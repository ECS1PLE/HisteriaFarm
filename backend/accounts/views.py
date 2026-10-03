import json
import re
from functools import wraps
from django.contrib.auth import authenticate, login, logout
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.http import JsonResponse, HttpResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from .models import Account, Activity, LoginAttempt, TelegramSettings, WarmupJob
from .security import encrypt, session_lock
from . import telegram, warmup

def api(methods, public=False, failure_title=None):
    def decorate(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if request.method not in methods:
                return JsonResponse({"error": "Метод не поддерживается."}, status=405)
            if not public and not request.user.is_authenticated:
                return JsonResponse({"error": "Войди в панель."}, status=401)
            try:
                return view(request, *args, **kwargs)
            except ValidationError as exc:
                return JsonResponse({"error": " ".join(exc.messages)}, status=400)
            except telegram.TelegramFailure as exc:
                if failure_title:
                    telegram.record(request.user, failure_title, str(exc), "warning")
                return JsonResponse({"error": str(exc)}, status=exc.status)
            except (ValueError, TypeError, json.JSONDecodeError):
                return JsonResponse({"error": "Некорректные данные запроса."}, status=400)
            except IntegrityError:
                return JsonResponse({"error": "Аккаунт уже подключён. Обнови список."}, status=409)
        return wrapped
    return decorate

def body(request):
    value = json.loads(request.body or "{}")
    if not isinstance(value, dict):
        raise ValidationError("Ожидается объект с полями запроса.")
    return value

def serialize(account):
    return {
        "id": str(account.id), "name": (account.first_name + " " + account.last_name).strip(),
        "firstName": account.first_name, "lastName": account.last_name, "username": account.username,
        "bio": account.bio, "phone": account.phone, "group": account.group, "status": account.status,
        "premium": account.premium, "avatarUrl": f"/api/accounts/{account.id}/avatar/?v={account.last_active.timestamp()}" if account.avatar else None,
        "proxy": "Без прокси", "country": "", "color": "#91b99a", "completed": 0,
        "lastActive": account.last_active.strftime("%d.%m %H:%M"), "error": account.error,
    }

def own_account(request, account_id):
    return Account.objects.filter(pk=account_id, owner=request.user).first()

@ensure_csrf_cookie
@api(["GET"], public=True)
def status(request):
    return JsonResponse({"authenticated": request.user.is_authenticated, "username": request.user.get_username() if request.user.is_authenticated else None,
        "telegramConfigured": telegram.configured(request.user) if request.user.is_authenticated else False, "csrfToken": get_token(request)})

@api(["POST"], public=True)
def panel_login(request):
    key = "login:" + request.META.get("REMOTE_ADDR", "")
    if cache.get(key, 0) >= 10:
        return JsonResponse({"error": "Слишком много попыток. Подожди 5 минут."}, status=429)
    data = body(request)
    user = authenticate(request, username=str(data.get("username", "")), password=str(data.get("password", "")))
    if not user:
        cache.set(key, cache.get(key, 0) + 1, 300)
        return JsonResponse({"error": "Неверный логин или пароль панели."}, status=401)
    login(request, user)
    cache.delete(key)
    return JsonResponse({"authenticated": True, "csrfToken": get_token(request)})

@api(["POST"])
def panel_logout(request):
    LoginAttempt.objects.filter(owner=request.user).delete()
    logout(request)
    return JsonResponse({"ok": True})

@api(["POST"])
def telegram_settings(request):
    data = body(request)
    api_id, api_hash = int(data.get("apiId", 0)), str(data.get("apiHash", "")).strip()
    if api_id <= 0 or not re.fullmatch(r"[a-fA-F0-9]{32}", api_hash):
        raise ValidationError("Проверь API ID и API Hash: ID - число, Hash - 32 шестнадцатеричных символа.")
    TelegramSettings.objects.update_or_create(owner=request.user, defaults={"credentials": encrypt({"apiId": api_id, "apiHash": api_hash})})
    return JsonResponse({"telegramConfigured": True})

@api(["GET"])
def workspace(request):
    events = Activity.objects.filter(owner=request.user).order_by("-created_at")[:100]
    return JsonResponse({"accounts": [serialize(a) for a in Account.objects.filter(owner=request.user).order_by("-last_active")], "tasks": [],
        "warmups": [warmup.serialize(job) for job in WarmupJob.objects.filter(owner=request.user).order_by("-started_at")[:20]],
        "warmupWorkerOnline": warmup.worker_online(), "events": [
        {"id": str(e.pk), "title": e.title, "detail": e.detail, "type": e.type, "time": e.created_at.strftime("%d.%m %H:%M")} for e in events
    ]})

@api(["POST"])
def start_warmup(request):
    return JsonResponse({"warmup": warmup.serialize(warmup.start(request.user, body(request)))}, status=201)

@api(["POST"])
def stop_warmup(request, job_id):
    job = warmup.stop(request.user, job_id)
    if not job:
        return JsonResponse({"error": "Задача не найдена."}, status=404)
    return JsonResponse({"warmup": warmup.serialize(job)})

@api(["POST"], failure_title="Не удалось запросить код Telegram")
def start_login(request):
    data = body(request)
    key = f"send-code:{request.user.pk}"
    if cache.get(key):
        return JsonResponse({"error": "Подожди минуту перед новым запросом кода."}, status=429)
    result = telegram.start_login(request.user, data.get("phone", ""), data.get("group", "Основная"))
    cache.set(key, True, 60)
    return JsonResponse(result)

@api(["POST", "DELETE"], failure_title="Не удалось подтвердить вход Telegram")
def finish_login(request, attempt_id):
    if request.method == "DELETE":
        with session_lock(f"auth-{attempt_id}"):
            LoginAttempt.objects.filter(pk=attempt_id, owner=request.user).delete()
        return JsonResponse({"ok": True})
    data = body(request)
    account = telegram.finish_login(request.user, attempt_id, str(data.get("code", "")), str(data.get("password", "")))
    return JsonResponse({"step": "done", "account": serialize(account)} if account else {"step": "password"})

@api(["POST", "PATCH", "DELETE"])
def account_detail(request, account_id):
    account = own_account(request, account_id)
    if not account:
        return JsonResponse({"error": "Аккаунт не найден."}, status=404)
    if request.method == "DELETE":
        with session_lock(account.id):
            telegram.record(request.user, "Аккаунт удалён из панели", account.first_name, "warning")
            account.delete()
        return JsonResponse({"ok": True})
    if request.method == "PATCH":
        data = body(request)
        group = str(data.get("group", "")).strip()
        if not group or len(group) > 64:
            raise ValidationError("Укажи группу длиной до 64 символов.")
        with session_lock(account.id):
            account.group = group
            account.save(update_fields=["group"])
        return JsonResponse({"account": serialize(account)})
    errors = telegram.update_account(account)
    return JsonResponse({"account": serialize(account), "errors": errors})

@api(["POST"])
def profile(request, account_id):
    account = own_account(request, account_id)
    if not account:
        return JsonResponse({"error": "Аккаунт не найден."}, status=404)
    data = json.loads(request.POST.get("profile", "{}")) if request.content_type == "multipart/form-data" else body(request)
    if not isinstance(data, dict):
        raise ValidationError("Ожидается объект профиля.")
    avatar = telegram.normalize_avatar(request.FILES["avatar"]) if "avatar" in request.FILES else None
    errors = telegram.update_account(account, data, avatar)
    return JsonResponse({"account": serialize(account), "errors": errors})

@api(["GET"])
def avatar(request, account_id):
    account = own_account(request, account_id)
    if not account or not account.avatar:
        return HttpResponse(status=404)
    response = HttpResponse(bytes(account.avatar), content_type="image/jpeg")
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response

def csrf_failure(request, reason=""):
    return JsonResponse({"error": "Сессия формы истекла. Обнови страницу и повтори."}, status=403)
