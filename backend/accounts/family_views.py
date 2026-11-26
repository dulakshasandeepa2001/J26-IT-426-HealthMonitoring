import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from accounts.models import User, PatientFamilyProfile, PatientLocationTracking, PatientLabRecord
from prescription_context.models import PrescriptionContextPatientcontext


@csrf_exempt
def save_family_profile_api(request):
    """
    POST /api/patient/family-tree/save/
    Payload: {
        "patient_id": 12,
        "mother_name": "Kanthi Silva",
        "father_name": "Sunil Perera",
        "mother_nic": "196850123456",
        "father_nic": "196510123456",
        "hereditary_risks": ["Type 2 Diabetes", "Hypertension"],
        "family_allergies": [{"relative": "Mother", "allergen": "Penicillin", "severity": "Severe Anaphylaxis"}],
        "household_exposures": [{"relative": "Brother", "disease": "Dengue Fever", "diagnosed_date": "2026-11-24"}]
    }
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Only POST allowed"}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8")) if request.body else {}
        patient_id = data.get("patient_id")
        if not patient_id:
            return JsonResponse({"status": "error", "message": "patient_id is required"}, status=400)

        user = User.objects.filter(id=patient_id).first()
        if not user:
            return JsonResponse({"status": "error", "message": f"Patient with ID {patient_id} not found"}, status=404)

        mother_name = (data.get("mother_name") or "").strip()
        father_name = (data.get("father_name") or "").strip()

        if not mother_name or not father_name:
            return JsonResponse({"status": "error", "message": "Both mother_name and father_name are required to construct Family Unit"}, status=400)

        profile, created = PatientFamilyProfile.objects.get_or_create(
            patient=user,
            defaults={
                "mother_name": mother_name,
                "father_name": father_name,
                "mother_nic": data.get("mother_nic", ""),
                "father_nic": data.get("father_nic", ""),
                "hereditary_risks": data.get("hereditary_risks", []),
                "family_allergies": data.get("family_allergies", []),
                "household_exposures": data.get("household_exposures", []),
            }
        )

        if not created:
            profile.mother_name = mother_name
            profile.father_name = father_name
            profile.mother_nic = data.get("mother_nic", profile.mother_nic)
            profile.father_nic = data.get("father_nic", profile.father_nic)
            if "hereditary_risks" in data:
                profile.hereditary_risks = data["hereditary_risks"]
            if "family_allergies" in data:
                profile.family_allergies = data["family_allergies"]
            if "household_exposures" in data:
                profile.household_exposures = data["household_exposures"]
            profile.family_unit_id = PatientFamilyProfile.compute_family_unit_id(mother_name, father_name)
            profile.save()

        return JsonResponse({
            "status": "success",
            "message": "Family Profile saved successfully",
            "family_unit_id": profile.family_unit_id,
            "patient_id": user.id,
            "patient_name": user.get_full_name() or user.username
        }, status=200)

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def get_family_tree_api(request, patient_id):
    """
    GET /api/patient/family-tree/<patient_id>/
    Returns the complete linked Family Tree (Patient node, Father, Mother, Siblings sharing family_unit_id,
    Hereditary conditions, family allergies, and intra-household exposure alerts).
    """
    try:
        user = User.objects.filter(id=patient_id).first()
        if not user:
            return JsonResponse({"status": "error", "message": "Patient not found"}, status=404)

        profile = PatientFamilyProfile.objects.filter(patient=user).first()
        if not profile:
            return JsonResponse({
                "status": "warning",
                "message": "Family profile has not been configured yet for this patient.",
                "patient_id": user.id,
                "patient_name": user.get_full_name() or user.username,
                "family_tree": None
            }, status=200)

        # Find all siblings sharing the exact same family_unit_id
        siblings_qs = PatientFamilyProfile.objects.filter(
            family_unit_id=profile.family_unit_id
        ).exclude(patient=user).select_related("patient")

        siblings_list = []
        for s in siblings_qs:
            siblings_list.append({
                "patient_id": s.patient.id,
                "username": s.patient.username,
                "full_name": s.patient.get_full_name() or s.patient.username,
                "birthday": str(s.patient.birthday) if s.patient.birthday else None,
                "household_exposures": s.household_exposures
            })

        # Check if father or mother are registered users in Medicare
        father_user = None
        if profile.father_nic:
            father_user = User.objects.filter(NIC_number=profile.father_nic).first()

        mother_user = None
        if profile.mother_nic:
            mother_user = User.objects.filter(NIC_number=profile.mother_nic).first()

        tree_data = {
            "family_unit_id": profile.family_unit_id,
            "patient": {
                "id": user.id,
                "name": user.get_full_name() or user.username,
                "birthday": str(user.birthday) if user.birthday else None,
                "phone": user.phone,
                "nic": user.NIC_number
            },
            "parents": {
                "father": {
                    "name": profile.father_name,
                    "nic": profile.father_nic,
                    "is_registered_patient": bool(father_user),
                    "user_id": father_user.id if father_user else None
                },
                "mother": {
                    "name": profile.mother_name,
                    "nic": profile.mother_nic,
                    "is_registered_patient": bool(mother_user),
                    "user_id": mother_user.id if mother_user else None
                }
            },
            "siblings": siblings_list,
            "siblings_count": len(siblings_list),
            "hereditary_risks": profile.hereditary_risks,
            "family_allergies": profile.family_allergies,
            "household_exposures": profile.household_exposures,
            "pedigree_summary": {
                "total_family_members": 2 + 1 + len(siblings_list), # Parents (2) + Patient (1) + Siblings
                "high_risk_flags": [
                    risk for risk in profile.hereditary_risks
                ],
                "active_household_infection_alert": bool(profile.household_exposures)
            }
        }

        return JsonResponse({
            "status": "success",
            "family_tree": tree_data
        }, status=200)

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
def sync_location_tracking_api(request):
    """
    POST /api/mobile/location/sync/
    Payload: {
        "patient_id": 12,
        "latitude": 6.9271,
        "longitude": 79.8612,
        "area_name": "Colombo 07 - Cinnamon Gardens",
        "risk_zone_level": "moderate",
        "stay_duration_minutes": 180,
        "close_contact_exposure": {
            "disease": "Influenza",
            "contact_duration_minutes": 45,
            "index_patient_id": 408
        }
    }
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Only POST allowed"}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8")) if request.body else {}
        patient_id = data.get("patient_id")
        user = User.objects.filter(id=patient_id).first()
        if not user:
            return JsonResponse({"status": "error", "message": "Patient not found"}, status=404)

        log = PatientLocationTracking.objects.create(
            patient=user,
            latitude=data.get("latitude"),
            longitude=data.get("longitude"),
            area_name=data.get("area_name", "Unknown Area"),
            risk_zone_level=data.get("risk_zone_level", "low"),
            stay_duration_minutes=int(data.get("stay_duration_minutes", 0)),
            close_contact_exposure=data.get("close_contact_exposure", {})
        )

        return JsonResponse({
            "status": "success",
            "log_id": log.id,
            "message": "Mobility and proximity exposure synced successfully"
        }, status=201)

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def get_location_exposure_api(request, patient_id):
    """
    GET /api/mobile/location/exposure/<patient_id>/
    """
    try:
        user = User.objects.filter(id=patient_id).first()
        if not user:
            return JsonResponse({"status": "error", "message": "Patient not found"}, status=404)

        logs = PatientLocationTracking.objects.filter(patient=user)[:5]
        latest_exposure = {}
        history = []
        for l in logs:
            history.append({
                "area_name": l.area_name,
                "risk_zone_level": l.risk_zone_level,
                "stay_duration_minutes": l.stay_duration_minutes,
                "close_contact_exposure": l.close_contact_exposure,
                "recorded_at": l.recorded_at.isoformat()
            })
            if not latest_exposure and l.close_contact_exposure:
                latest_exposure = l.close_contact_exposure

        return JsonResponse({
            "status": "success",
            "patient_id": patient_id,
            "latest_exposure": latest_exposure,
            "recent_mobility_logs": history
        }, status=200)

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
def add_lab_record_api(request):
    """
    POST /api/lab/records/add/
    Payload: {
        "patient_id": 12,
        "test_name": "Full Blood Count (FBC)",
        "test_date": "2026-11-25",
        "metrics": {
            "platelets": 185000,
            "wbc": 6200,
            "rbc": 4.8,
            "hemoglobin": 13.8,
            "creatinine": 0.9,
            "alt_sgpt": 28,
            "ns1_antigen": "Negative"
        },
        "clinical_flags": ["Normal Platelet Count (Dengue Safe)", "Normal Renal Function"],
        "lab_name": "Asiri Central Hospital Laboratory",
        "verified_by": "Dr. K. D. Jayawardena (Consultant Hematologist)"
    }
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Only POST allowed"}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8")) if request.body else {}
        patient_id = data.get("patient_id")
        user = User.objects.filter(id=patient_id).first()
        if not user:
            return JsonResponse({"status": "error", "message": "Patient not found"}, status=404)

        rec = PatientLabRecord.objects.create(
            patient=user,
            test_name=data.get("test_name", "Clinical Laboratory Panel"),
            test_date=data.get("test_date") or None,
            metrics=data.get("metrics", {}),
            clinical_flags=data.get("clinical_flags", []),
            lab_name=data.get("lab_name", "General Medical Lab"),
            verified_by=data.get("verified_by", "Lab Officer")
        )

        return JsonResponse({
            "status": "success",
            "record_id": rec.id,
            "message": "Laboratory test report recorded successfully"
        }, status=201)

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def get_patient_lab_records_api(request, patient_id):
    """
    GET /api/lab/records/<patient_id>/
    """
    try:
        user = User.objects.filter(id=patient_id).first()
        if not user:
            return JsonResponse({"status": "error", "message": "Patient not found"}, status=404)

        records = PatientLabRecord.objects.filter(patient=user)
        results = []
        for r in records:
            results.append({
                "id": r.id,
                "test_name": r.test_name,
                "test_date": str(r.test_date),
                "metrics": r.metrics,
                "clinical_flags": r.clinical_flags,
                "lab_name": r.lab_name,
                "verified_by": r.verified_by
            })

        return JsonResponse({
            "status": "success",
            "patient_id": patient_id,
            "lab_records": results
        }, status=200)

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def get_patient_unified_clinical_context(patient_id):
    """
    Core aggregator function: Fuses all 4 clinical sources into a single
    Unified Clinical Profile for RAG & Diagnosis:
      1. Patient EHR Context (Allergies, Current Chronic Meds, Weight, Age)
      2. Family Tree & Genetic Risks (Hereditary Risks, Family Allergies, Household Exposures)
      3. Mobility & Proximity Location Tracking (Recent contact with infected patients)
      4. Recent Laboratory Reports (Platelets, Creatinine, Liver, NS1)
    """
    patient = User.objects.filter(id=patient_id).first()
    if not patient:
        return {
            "patient_id": patient_id,
            "allergies": [],
            "current_medicines": [],
            "hereditary_risks": [],
            "family_allergies": [],
            "household_exposures": [],
            "lab_metrics": {},
            "lab_flags": [],
            "close_contact_exposure": {}
        }

    # 1. EHR Context (Safe fallback if unmigrated app table is offline)
    allergies = []
    current_medicines = []
    try:
        ehr_ctx = PrescriptionContextPatientcontext.objects.filter(patient=patient).first()
        allergies = ehr_ctx.allergies if ehr_ctx and isinstance(ehr_ctx.allergies, list) else []
        current_medicines = ehr_ctx.current_medicines if ehr_ctx and isinstance(ehr_ctx.current_medicines, list) else []
    except Exception as e:
        pass

    # 2. Family Tree Profile
    fam = PatientFamilyProfile.objects.filter(patient=patient).first()
    hereditary_risks = fam.hereditary_risks if fam and isinstance(fam.hereditary_risks, list) else []
    family_allergies = fam.family_allergies if fam and isinstance(fam.family_allergies, list) else []
    household_exposures = fam.household_exposures if fam and isinstance(fam.household_exposures, list) else []

    # 3. Location Tracking & Exposure
    loc = PatientLocationTracking.objects.filter(patient=patient).first()
    close_contact_exposure = loc.close_contact_exposure if loc and isinstance(loc.close_contact_exposure, dict) else {}

    # 4. Lab Records
    lab = PatientLabRecord.objects.filter(patient=patient).first()
    lab_metrics = lab.metrics if lab and isinstance(lab.metrics, dict) else {}
    lab_flags = lab.clinical_flags if lab and isinstance(lab.clinical_flags, list) else []

    # Auto-infer flags if metrics exist
    if "platelets" in lab_metrics:
        pl = lab_metrics["platelets"]
        if pl < 100000:
            lab_flags.append(f"CRITICAL: Thrombocytopenia (Platelets {pl} < 100k) - NSAIDs strictly contraindicated!")
        elif pl < 150000:
            lab_flags.append(f"WARNING: Borderline low platelets ({pl}) - Monitor Dengue profile")
        else:
            lab_flags.append(f"Normal Platelets ({pl}) - Dengue Bleeding Risk Low")

    if "creatinine" in lab_metrics:
        cr = lab_metrics["creatinine"]
        if cr > 1.4:
            lab_flags.append(f"Elevated Serum Creatinine ({cr} mg/dL) - Renal dose adjustment required")
        else:
            lab_flags.append(f"Normal Renal Function (Creatinine {cr} mg/dL)")

    return {
        "patient_id": patient.id,
        "patient_name": patient.get_full_name() or patient.username,
        "birthday": str(patient.birthday) if patient.birthday else None,
        "allergies": allergies,
        "current_medicines": current_medicines,
        "hereditary_risks": hereditary_risks,
        "family_allergies": family_allergies,
        "household_exposures": household_exposures,
        "close_contact_exposure": close_contact_exposure,
        "lab_metrics": lab_metrics,
        "lab_flags": lab_flags
    }
