from django.core.management.base import BaseCommand
from accounts.warmup import run_worker


class Command(BaseCommand):
    help = "Run the persistent account messaging scheduler."

    def handle(self, *args, **options):
        self.stdout.write("Warmup worker started. Stop with Ctrl+C.")
        try:
            run_worker()
        except KeyboardInterrupt:
            pass
