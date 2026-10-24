from django.core.management.base import BaseCommand
from accounts.monitoring import run_worker


class Command(BaseCommand):
    help = "Run persistent channel and keyword monitoring on this host."

    def handle(self, *args, **options):
        self.stdout.write("Monitoring worker started. Stop with Ctrl+C.")
        try:
            run_worker()
        except KeyboardInterrupt:
            pass
