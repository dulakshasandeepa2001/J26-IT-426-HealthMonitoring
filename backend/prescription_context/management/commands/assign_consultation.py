"""Assign an encounter manually until the Component 1 appointment flow is ready."""

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q
from accounts.models import User
from prescription_context.models import PrescriptionContextConsultation


class Command(BaseCommand):
    help = 'Assign a registered patient to an approved doctor; no sample accounts or medical data are created.'

    def add_arguments(self, parser):
        parser.add_argument('--doctor-id', type=int, required=True)
        parser.add_argument('--patient-id', type=int, required=True)
        parser.add_argument('--assigned-by', type=int, required=True, help='Active approved admin or staff user ID')
        parser.add_argument('--reason', required=True)
        parser.add_argument('--demo', action='store_true', help='Mark this encounter as a PP1 demonstration')

    def handle(self, *args, **options):
        doctor = User.objects.filter(
            pk=options['doctor_id'], role='doctor', is_active=True, is_approved=True,
        ).first()
        patient = User.objects.filter(
            pk=options['patient_id'], role='patient', is_active=True, is_approved=True,
        ).first()
        assigner = User.objects.filter(pk=options['assigned_by'], is_active=True).filter(
            Q(is_staff=True) | Q(role='admin', is_approved=True)
        ).first()
        reason = options['reason'].strip()
        if not doctor or not patient or not assigner:
            raise CommandError('Use an active approved doctor, an active approved patient, and an active approved admin or staff assigner.')
        if not reason or len(reason) > 300:
            raise CommandError('Reason must contain 1 to 300 characters.')
        consultation = PrescriptionContextConsultation.objects.create(
            doctor=doctor, patient=patient, assigned_by=assigner,
            reason=reason, is_demo=options['demo'],
        )
        self.stdout.write(self.style.SUCCESS(f'Assigned consultation {consultation.pk}'))
