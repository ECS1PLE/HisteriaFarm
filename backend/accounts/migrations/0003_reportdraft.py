import uuid
import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_warmupjob_warmupparticipant_and_more")]
    operations = [migrations.CreateModel(name="ReportDraft", fields=[
        ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
        ("payload", models.TextField()),
        ("state", models.CharField(default="confirm", max_length=16)),
        ("expires", models.DateTimeField()),
        ("account", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="accounts.account")),
    ])]
