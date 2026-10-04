import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("accounts", "0003_reportdraft"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name="PublicationBatch", fields=[
            ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ("payload", models.TextField()),
            ("expires", models.DateTimeField()),
            ("cancelled", models.BooleanField(default=False)),
            ("error", models.CharField(blank=True, max_length=255)),
            ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ("verifier", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="accounts.account")),
        ]),
        migrations.CreateModel(name="PublicationDelivery", fields=[
            ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ("target_index", models.PositiveIntegerField()),
            ("state", models.CharField(default="pending", max_length=16)),
            ("message_id", models.PositiveIntegerField(null=True)),
            ("error", models.CharField(blank=True, max_length=255)),
            ("account", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="accounts.account")),
            ("batch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="deliveries", to="accounts.publicationbatch")),
        ], options={"constraints": [models.UniqueConstraint(fields=("batch", "account", "target_index"), name="one_publication_per_account_target")]}),
    ]
