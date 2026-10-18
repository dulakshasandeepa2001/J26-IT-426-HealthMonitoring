from django.core.management.base import BaseCommand
from django.db import transaction
from medicine_knowledge.condition_knowledge import seed_condition_knowledge
from medicine_knowledge.additional_candidates import additional_definitions
from medicine_knowledge.models import ConditionKnowledge


class Command(BaseCommand):
    help = 'Import versioned six-condition patient-screening scopes and ten additional candidates. Never creates doctor reviews.'

    @transaction.atomic
    def handle(self, *args, **options):
        base = seed_condition_knowledge()
        counts = {'created': 0, 'updated': 0, 'unchanged': 0}
        for definition in additional_definitions():
            row = ConditionKnowledge.objects.select_for_update().filter(pk=definition['id']).first()
            if row and all(getattr(row, key) == value for key, value in definition.items()):
                counts['unchanged'] += 1
            elif row:
                for key, value in definition.items():
                    setattr(row, key, value)
                row.save()
                counts['updated'] += 1
            else:
                ConditionKnowledge.objects.create(**definition)
                counts['created'] += 1
        self.stdout.write(f'Existing additional scopes: {base}. New candidate scopes: {counts}. No review decisions created.')
