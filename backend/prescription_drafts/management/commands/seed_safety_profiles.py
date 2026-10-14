from django.core.management.base import BaseCommand
from prescription_drafts.profiles import seed_profiles


class Command(BaseCommand):
    help = 'Import pending executable pilot safety profiles, preserving identical reviewed records.'

    def handle(self, *args, **options):
        result = seed_profiles()
        self.stdout.write(self.style.SUCCESS(f"Safety profiles: {result['created']} created, {result['updated']} updated, {result['unchanged']} unchanged."))
