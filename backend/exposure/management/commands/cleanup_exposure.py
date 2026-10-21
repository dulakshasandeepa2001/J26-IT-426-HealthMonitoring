import json
from django.core.management.base import BaseCommand, CommandError
from exposure.services import cleanup


class Command(BaseCommand):
    help = 'Count expired NEW exposure rows; --execute enables bounded deletion.'

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group()
        group.add_argument('--execute', action='store_true')
        group.add_argument('--dry-run', action='store_true')
        parser.add_argument('--batch-size', type=int, default=500)
        parser.add_argument('--max-batches', type=int, default=10)

    def handle(self, *args, **options):
        if not 1 <= options['batch_size'] <= 5000 or not 1 <= options['max_batches'] <= 100:
            raise CommandError('batch-size must be 1..5000 and max-batches 1..100.')
        self.stdout.write(json.dumps(cleanup(dry_run=not options['execute'],
            batch_size=options['batch_size'], max_batches=options['max_batches'])))
