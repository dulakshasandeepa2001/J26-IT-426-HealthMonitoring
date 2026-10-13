from django.core.management.base import BaseCommand
from medicine_knowledge.services import seed_catalogue


class Command(BaseCommand):
    help = 'Import the bundled pilot catalogue; new or changed content always needs clinician review.'

    def handle(self, *args, **options):
        result = seed_catalogue()
        self.stdout.write(self.style.SUCCESS(
            f"Catalogue: {result['created']} created, {result['updated']} updated, {result['unchanged']} unchanged."
        ))
