from django.core.management.base import BaseCommand
from medicine_knowledge.condition_knowledge import seed_condition_knowledge


class Command(BaseCommand):
    help = 'Import four additional condition scopes without resetting pilot content/rule reviews. No review decisions are fabricated.'

    def handle(self, *args, **options):
        counts = seed_condition_knowledge()
        self.stdout.write(self.style.SUCCESS(f"Condition knowledge: {counts['created']} created, {counts['updated']} updated, {counts['unchanged']} unchanged."))
