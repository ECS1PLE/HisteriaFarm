import json
import re
from functools import wraps
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.validators import validate_email
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse, HttpResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from .models import Account, Activity, LoginAttempt, TelegramSettings, WarmupJob, ReportDraft, PublicationBatch, Membership, MonitorRule
from .access import available_accounts, membership
from .authentication import allow_attempt
from .security import encrypt, session_lock
from . import telegram, warmup, reports, publications, checks

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

def serialize(account, owner=None):
    return {
        "id": str(account.id), "name": (account.first_name + " " + account.last_name).strip(),
        "owned": owner is None or account.owner_id == owner.pk,
        "firstName": account.first_name, "lastName": account.last_name, "username": account.username,
        "bio": account.bio, "phone": account.phone, "group": account.group, "status": account.status,
        "premium": account.premium, "avatarUrl": f"/api/accounts/{account.id}/avatar/?v={account.last_active.timestamp()}" if account.avatar else None,
        "proxy": "Без прокси", "country": "", "color": "#91b99a", "completed": 0,
        "lastActive": account.last_active.strftime("%d.%m %H:%M"), "error": account.error,
        "sessionStatus": account.session_status,
        "sessionCheckedAt": account.session_checked_at.isoformat() if account.session_checked_at else None,
        "sessionError": account.session_error,
        "spamStatus": account.spam_status,
        "spamCheckedAt": account.spam_checked_at.isoformat() if account.spam_checked_at else None,
        "spamDetail": account.spam_detail,
        "checkRetryAt": account.check_retry_at.isoformat() if account.check_retry_at and account.check_retry_at > timezone.now() else None,
    }

def own_account(request, account_id):
    return available_accounts(request.user).filter(pk=account_id).first()

@ensure_csrf_cookie
@api(["GET"], public=True)
def status(request):
    return JsonResponse({"authenticated": request.user.is_authenticated, "username": request.user.get_username() if request.user.is_authenticated else None,
        "telegramConfigured": telegram.configured(request.user) if request.user.is_authenticated else False,
        "membership": membership(request.user) if request.user.is_authenticated else None, "csrfToken": get_token(request)})

@api(["POST"], public=True)
def panel_register(request):
    if not allow_attempt(request, "register", 5):
        return JsonResponse({"error": "Слишком много попыток регистрации. Подожди 5 минут."}, status=429)
    data = body(request)
    username = str(data.get("username", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    if not re.fullmatch(r"[A-Za-z0-9_]{3,32}", username):
        raise ValidationError("Логин: 3–32 символа, латиница, цифры и подчёркивание.")
    validate_email(email)
    if len(email) > 254 or len(password) > 128:
        raise ValidationError("Email — до 254 символов, пароль — до 128.")
    if password != data.get("passwordConfirm"):
        raise ValidationError("Пароли не совпадают.")
    if data.get("sharingAccepted") is not True:
        raise ValidationError("Подтверди общий доступ Premium к добавляемым Telegram-сессиям.")
    User = get_user_model()
    user = User(username=username, email=email)
    validate_password(password, user)
    # Case-insensitive registration and duplicate email checks also cover legacy Django users.
    with session_lock("panel-registration", blocking=True), transaction.atomic():
        if User.objects.filter(username__iexact=username).exists() or User.objects.filter(email__iexact=email).exists():
            return JsonResponse({"error": "Логин или email уже используется."}, status=409)
        user.set_password(password)
        user.save()
        Membership.objects.create(owner=user, email=email)
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return JsonResponse({"authenticated": True, "membership": membership(user), "csrfToken": get_token(request)}, status=201)

@api(["POST"], public=True)
def panel_login(request):
    if not allow_attempt(request, "login", 10):
        return JsonResponse({"error": "Слишком много попыток. Подожди 5 минут."}, status=429)
    data = body(request)
    user = authenticate(request, username=str(data.get("username", "")), password=str(data.get("password", "")))
    if not user:
        return JsonResponse({"error": "Неверный логин или пароль панели."}, status=401)
    login(request, user)
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
    from . import monitoring
    return JsonResponse({"accounts": [serialize(a, request.user) for a in available_accounts(request.user).order_by("-last_active")], "tasks": [],
        "membership": membership(request.user),
        "monitors": [monitoring.serialize(rule) for rule in MonitorRule.objects.filter(owner=request.user).select_related("account").order_by("-created_at")],
        "monitorWorkerOnline": monitoring.worker_online(),
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
        if account.owner_id != request.user.pk:
            return JsonResponse({"error": "Удалить сессию может только её владелец."}, status=403)
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
        return JsonResponse({"account": serialize(account, request.user)})
    errors = telegram.update_account(account)
    return JsonResponse({"account": serialize(account, request.user), "errors": errors})

@api(["POST"])
def check_account(request, account_id):
    account = own_account(request, account_id)
    if not account:
        return JsonResponse({"error": "Аккаунт не найден."}, status=404)
    issues = checks.check_account(account, body(request).get("kind", "all"))
    return JsonResponse({"account": serialize(account, request.user), "errors": issues})

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
    return JsonResponse({"account": serialize(account, request.user), "errors": errors})

@api(["GET"])
def avatar(request, account_id):
    account = own_account(request, account_id)
    if not account or not account.avatar:
        return HttpResponse(status=404)
    response = HttpResponse(bytes(account.avatar), content_type="image/jpeg")
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response

@api(["GET", "POST"])
def prepare_report(request, account_id):
    account = own_account(request, account_id)
    if not account:
        return JsonResponse({"error": "Аккаунт не найден."}, status=404)
    if request.method == "GET":
        return JsonResponse({"reasons": [{"value": key, "label": value[0]} for key, value in reports.REASONS.items()]})
    return JsonResponse({"report": reports.prepare(account, body(request), owner=request.user)}, status=201)

@api(["POST"], failure_title="Не удалось подать жалобу")
def submit_report(request, account_id, report_id):
    draft = ReportDraft.objects.filter(pk=report_id, account_id=account_id, owner=request.user, account__in=available_accounts(request.user)).select_related("account").first()
    if not draft:
        return JsonResponse({"error": "Жалоба не найдена."}, status=404)
    return JsonResponse({"report": reports.advance(draft, body(request))})

@api(["POST"])
def prepare_publication(request):
    return JsonResponse({"publication": publications.serialize(publications.prepare(request.user, body(request)))}, status=201)

@api(["GET", "DELETE"])
def publication_detail(request, batch_id):
    batch = publications.cancel(request.user, batch_id) if request.method == "DELETE" else PublicationBatch.objects.filter(pk=batch_id, owner=request.user).first()
    if not batch:
        return JsonResponse({"error": "Публикация не найдена."}, status=404)
    return JsonResponse({"publication": publications.serialize(batch)})

@api(["POST"])
def publication_delivery(request, batch_id, delivery_id):
    return JsonResponse(publications.deliver(request.user, batch_id, delivery_id, body(request)))

@api(["POST"])
def skip_publication_account(request, batch_id, delivery_id):
    return JsonResponse(publications.skip_delivery_account(request.user, batch_id, delivery_id, body(request)))

@api(["POST"])
def create_monitor(request):
    from . import monitoring
    return JsonResponse({"monitor": monitoring.serialize(monitoring.create(request.user, body(request)))}, status=201)

@api(["PATCH", "DELETE"])
def monitor_detail(request, rule_id):
    from . import monitoring
    result = monitoring.change(request.user, rule_id, "delete" if request.method == "DELETE" else body(request).get("action"))
    if result is None:
        return JsonResponse({"error": "Правило не найдено."}, status=404)
    return JsonResponse({"ok": True} if result is True else {"monitor": monitoring.serialize(result)})

def csrf_failure(request, reason=""):
    return JsonResponse({"error": "Сессия формы истекла. Обнови страницу и повтори."}, status=403)
