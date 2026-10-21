from django.core.management.base import BaseCommand
from django.db import transaction
from medicine_knowledge.models import ConditionKnowledge
from medicine_knowledge.ors_reference import definition


class Command(BaseCommand):
    help = 'Import the separate exact Dioralyte UK reference scope; never creates clinical reviews or changes the generic ORS identity.'

    @transaction.atomic
    def handle(self, *args, **options):
        shipped = definition()
        row = ConditionKnowledge.objects.select_for_update().filter(pk=shipped['id']).first()
        if row is None:
            ConditionKnowledge.objects.create(**shipped)
            status = 'created'
        elif all(getattr(row, name) == value for name, value in shipped.items()):
            status = 'unchanged'
        else:
            for name, value in shipped.items():
                setattr(row, name, value)
            row.save()  # Previous review history retained; changed version needs review.
            status = 'updated'
        self.stdout.write(f'Exact ORS reference scope: {status}. No reviews or clinical records created.')
