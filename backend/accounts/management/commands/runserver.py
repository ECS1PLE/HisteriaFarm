from threading import Thread
from django.core.management.commands.runserver import Command as DjangoRunserver
from accounts.warmup import run_worker


class Command(DjangoRunserver):
    def on_bind(self, server_port):
        super().on_bind(server_port)
        Thread(target=run_worker, name="warmup-worker", daemon=True).start()
