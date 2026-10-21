from django.core.management.base import BaseCommand, CommandError
from exposure.models import TrackingConsent
from exposure.services import process_user


class Command(BaseCommand):
    help = 'Recheck retained evidence and diagnoses without changing legacy flows.'

    def add_arguments(self, parser):
        parser.add_argument('--after-user-id', type=int, default=0)
        parser.add_argument('--limit', type=int, default=100)
        parser.add_argument('--all-users', action='store_true', help='Continue through bounded user pages for a scheduled full cycle.')

    def handle(self, *args, **options):
        if not 1 <= options['limit'] <= 1000:
            raise CommandError('limit must be 1..1000.')
        cursor = options['after_user_id']
        total = 0
        while True:
            ids = list(TrackingConsent.objects.filter(granted=True,
                user_id__gt=cursor).order_by('user_id').values_list('user_id', flat=True)[:options['limit']])
            for user_id in ids:
                for mode in ('real', 'synthetic_demo'):
                    process_user(user_id, mode)
            total += len(ids)
            cursor = ids[-1] if ids else cursor
            if not options['all_users'] or not ids:
                break
        self.stdout.write(f'Processed {total} users. Last user ID: {cursor}. Restart at zero next full cycle.')
