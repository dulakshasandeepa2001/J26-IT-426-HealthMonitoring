import os
import sys
from datetime import date, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)

import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'medicare_project.settings')
django.setup()

from accounts.models import User
from labreports.models import LabRequest, LabReport, LabObservation

dulaksha = User.objects.filter(username='Dulaksha').first()
ruvinda = User.objects.filter(username='Ruvinda').first()
saman = User.objects.filter(username='saman').first()
priya = User.objects.filter(username='Priya Singh').first()

if dulaksha and saman:
    # 1. Lab Request Requisition
    req, _ = LabRequest.objects.get_or_create(
        patient=dulaksha,
        doctor=saman,
        test_type='Full Blood Count (FBC/CBC)',
        defaults={
            'clinical_notes': 'Persistent high fever for 3 days. Rule out viral illness / Dengue.',
            'priority': 'urgent',
            'status': 'processing'
        }
    )

    # 2. Draft Report waiting for Doctor Review
    r1, created = LabReport.objects.get_or_create(
        patient=dulaksha,
        lab_name='Lanka Hospitals Diagnostic Laboratory',
        report_title='Full Blood Count (FBC / CBC)',
        test_date=date.today(),
        defaults={
            'lab_request': req,
            'approval_status': 'draft',
            'image_quality_status': 'pass',
            'overall_confidence': 0.94,
            'is_dispatched_to_patient': False
        }
    )
    if created:
        obs1 = [
            ('Haemoglobin', '718-7', 'Hemoglobin [Mass/volume] in Blood', '11.2', 11.2, 'g/dL', '12.0 - 16.0', 12.0, 16.0, 'LOW'),
            ('White Blood Cell Count', '6690-2', 'Leukocytes [#/volume] in Blood', '14.5', 14.5, '10^3/uL', '4.0 - 11.0', 4.0, 11.0, 'HIGH'),
            ('Platelet Count', '777-3', 'Platelets [#/volume] in Blood', '98', 98.0, '10^3/uL', '150 - 450', 150.0, 450.0, 'LOW'),
            ('Red Blood Cell Count', '789-8', 'Erythrocytes [#/volume] in Blood', '4.3', 4.3, '10^6/uL', '3.8 - 5.2', 3.8, 5.2, 'NORMAL'),
            ('Hematocrit (PCV)', '4544-3', 'Hematocrit [Volume Fraction] of Blood', '33.0', 33.0, '%', '36.0 - 48.0', 36.0, 48.0, 'LOW'),
        ]
        for name, code, std, val, num, unit, rr, rmin, rmax, flag in obs1:
            LabObservation.objects.create(
                lab_report=r1,
                test_original_name=name,
                test_standard_code=code,
                standard_name=std,
                result_value=val,
                numeric_value=num,
                unit=unit,
                reference_range_raw=rr,
                reference_min=rmin,
                reference_max=rmax,
                abnormal_flag=flag,
                extraction_confidence=0.95
            )

    # 3. Approved Report already verified and dispatched to Patient
    r2, created2 = LabReport.objects.get_or_create(
        patient=dulaksha,
        lab_name='Asiri Central Hospital Laboratory',
        report_title='Dengue NS1 Antigen & Hematology Panel',
        test_date=date.today() - timedelta(days=2),
        defaults={
            'approval_status': 'approved',
            'reviewed_by': saman,
            'physician_notes': 'Dengue NS1 positive. Mild thrombocytopenia detected. Maintain strict oral hydration (ORS, fresh juices). Avoid NSAIDs / Aspirin. Repeat CBC in 24 hours.',
            'image_quality_status': 'pass',
            'overall_confidence': 0.98,
            'is_dispatched_to_patient': True,
            'contributed_to_surveillance': True
        }
    )
    if created2:
        obs2 = [
            ('Dengue NS1 Antigen', '51655-9', 'Dengue virus NS1 Ag [Presence] in Serum', 'Positive', None, None, 'Negative', None, None, 'ABNORMAL'),
            ('Platelet Count', '777-3', 'Platelets [#/volume] in Blood', '115', 115.0, '10^3/uL', '150 - 450', 150.0, 450.0, 'LOW'),
            ('White Blood Cell Count', '6690-2', 'Leukocytes [#/volume] in Blood', '3.4', 3.4, '10^3/uL', '4.0 - 11.0', 4.0, 11.0, 'LOW'),
            ('Hematocrit (PCV)', '4544-3', 'Hematocrit [Volume Fraction] of Blood', '38.5', 38.5, '%', '36.0 - 48.0', 36.0, 48.0, 'NORMAL')
        ]
        for name, code, std, val, num, unit, rr, rmin, rmax, flag in obs2:
            LabObservation.objects.create(
                lab_report=r2,
                test_original_name=name,
                test_standard_code=code,
                standard_name=std,
                result_value=val,
                numeric_value=num,
                unit=unit,
                reference_range_raw=rr,
                reference_min=rmin,
                reference_max=rmax,
                abnormal_flag=flag,
                extraction_confidence=0.99
            )

print(f"DONE: {LabReport.objects.count()} reports, {LabObservation.objects.count()} observations")
