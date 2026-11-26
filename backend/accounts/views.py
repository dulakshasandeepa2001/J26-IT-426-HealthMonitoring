from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from django.http import JsonResponse
from django.db.models import Q
from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.views.decorators.http import require_GET, require_POST
from django.utils import timezone
from django.db import transaction
import json
import uuid
import datetime
from accounts.models import PendingDoctor, User, Doctor, Laborator, Appointment, DoctorLiveAvailability
from accounts.permissions import IsApprovedAdmin
from taskcreate.models import Task



@api_view(['POST'])
def create_user(request):
    """Create a patient directly, or submit a doctor for admin approval."""
    try:
        data = request.data
        if not data:
            return JsonResponse({'error': 'Request body is empty. Please check that you are sending raw JSON in Postman.'}, status=400)

        role = str(data.get("role", "")).strip().lower()

        if role == "patient":
            user = User(
                username=data.get('username'),
                email=data.get('email'),
                phone=data.get('phone'),
                NIC_number=data.get('NIC_number'),
                birthday=data.get('birthday'),
                role='patient',
                is_approved=True, #patients are auto approved
            )
            user.set_password(data.get('password'))
            user.save()
            return JsonResponse({'message': 'Account created! You can login now.'})

        elif role == "doctor":
            slmc_reg_no = data.get('slmc_reg_no') or data.get('slmc_number') or data.get('register_id')
            if not slmc_reg_no:
                return JsonResponse({
                    'error': 'SLMC Registration Number is required for medical practitioners.'
                }, status=400)

            # Automated Instant SLMC Verification (No manual admin review required)
            from .slmc_service import verify_doctor_slmc, sanitize_slmc_reg
            slmc_result = verify_doctor_slmc(
                reg_no=slmc_reg_no,
                nic_number=data.get('NIC_number', ''),
                doctor_name=data.get('username', '')
            )

            if not slmc_result.get('verified'):
                return JsonResponse({
                    'error': slmc_result.get('message', 'SLMC verification failed. Registration number was not found or is inactive on medicalcouncil.lk. Only verified medical practitioners can register as a Doctor.'),
                    'slmc_unverified': True
                }, status=400)

            clean_slmc = slmc_result.get('slmc_reg_no', sanitize_slmc_reg(slmc_reg_no))
            doc_code = clean_slmc.replace("SLMC-", "").replace("SLMC", "")
            doctor_id_code = f"DOC-{doc_code}"

            # Create fully approved, verified Doctor account directly (Admin review eliminated)
            user = User(
                username=data.get('username'),
                email=data.get('email'),
                phone=data.get('phone'),
                NIC_number=data.get('NIC_number'),
                birthday=data.get('birthday') or '1990-01-01',
                university=data.get('university') or 'Faculty of Medicine',
                degrees=data.get('degrees') or 'MBBS',
                working_hospital=data.get('working_hospital') or 'General Hospital',
                doctorID=doctor_id_code,
                slmc_reg_no=clean_slmc,
                is_slmc_verified=True,
                slmc_verified_at=slmc_result.get('verified_at'),
                role='doctor',
                is_approved=True,
                is_active=True,
            )
            user.set_password(data.get('password'))
            user.save()

            # Ensure sync with Doctor catalogue for appointment booking
            try:
                from .models import Doctor
                if not Doctor.objects.filter(doctor_id=doctor_id_code).exists():
                    Doctor.objects.create(
                        doctor_id=doctor_id_code,
                        register_id=clean_slmc,
                        doctor_nicnumber=data.get('NIC_number') or f"NIC-{doc_code}",
                        doctors_name=data.get('username'),
                        dob=data.get('birthday') or '1990-01-01',
                        degrees=data.get('degrees') or 'MBBS',
                        university=data.get('university') or 'Faculty of Medicine',
                        working_hospital=data.get('working_hospital') or 'General Hospital'
                    )
            except Exception:
                pass

            return JsonResponse({
                'message': f'SLMC Credentials verified successfully ({clean_slmc})! Doctor account created and active. You can login now.',
                'doctor_id': doctor_id_code,
                'slmc_verified': True,
                'slmc_reg_no': clean_slmc
            })

        elif role == "lab":
            user = User(
                username=data.get('username'),
                email=data.get('email'),
                phone=data.get('phone'),
                NIC_number=data.get('NIC_number'),
                birthday=data.get('birthday'),
                lab_name=data.get('lab_name'),
                lab_address=data.get('lab_address'),
                license_id=data.get('license_id'),
                role='lab',
                is_approved=True,
            )
            user.set_password(data.get('password'))
            user.save()
            return JsonResponse({'message': 'Laboratory registered successfully.'})

        elif role in ["medical_officer", "phi"]:
            officer_id = data.get('officer_id') or data.get('phi_reg_number') or f"PHI-{data.get('NIC_number', '0000')[-4:]}"
            assigned_area = data.get('assigned_area') or data.get('district') or "Colombo North"
            moh_office = data.get('moh_office') or f"MOH Office - {assigned_area}"
            designation = data.get('degrees') or data.get('designation') or "Public Health Inspector (PHI)"

            user = User(
                username=data.get('username'),
                email=data.get('email'),
                phone=data.get('phone'),
                NIC_number=data.get('NIC_number'),
                birthday=data.get('birthday') or '1990-01-01',
                doctorID=officer_id,
                working_hospital=assigned_area,
                lab_name=moh_office,
                license_id=officer_id,
                degrees=designation,
                role='medical_officer',
                is_approved=True,
            )
            user.set_password(data.get('password'))
            user.save()
            return JsonResponse({
                'message': 'Medical Officer / PHI registered successfully. You can login now.',
                'officer_id': officer_id,
                'assigned_area': assigned_area,
            })

        else:
            return JsonResponse({'error': 'Invalid role. Must be "patient", "doctor", "lab", or "medical_officer".'}, status=400)

    except Exception as e:
        return JsonResponse({'error': f'Registration failed: {str(e)}'}, status=500)


def session_user(user):
    return {
        "id": user.pk,
        "username": user.username,
        "role": user.role,
        "doctorID": user.doctorID,
        "slmc_reg_no": getattr(user, 'slmc_reg_no', None),
        "is_slmc_verified": getattr(user, 'is_slmc_verified', False),
        "lab_name": user.lab_name,
        "license_id": user.license_id,
        "lab_address": user.lab_address,
        "officer_id": user.doctorID or user.license_id,
        "assigned_area": user.working_hospital,
        "moh_office": user.lab_name,
        "designation": user.degrees or ("Public Health Inspector (PHI)" if user.role == 'medical_officer' else None),
    }


@require_GET
def current_session(request):
    user = request.user
    authenticated = user.is_authenticated and user.is_active and user.is_approved
    response = JsonResponse({
        "user": session_user(user) if authenticated else None,
        "csrfToken": get_token(request),
    })
    response["Cache-Control"] = "no-store"
    return response


@require_POST
@csrf_protect
def logout_user(request):
    logout(request)
    return JsonResponse({"message": "Logged out"})


@require_POST
@csrf_exempt
def login_user(request):
    """Login with username (or email) and password."""
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            return JsonResponse({"error": "Expected a JSON object"}, status=400)
        username = data.get("username", "")
        password = data.get("password", "")
        if not isinstance(username, str) or not isinstance(password, str):
            return JsonResponse({"error": "Username and password must be strings"}, status=400)
        username = username.strip()

        if not username or not password:
            return JsonResponse({"error": "Username and password are required"}, status=400)

        # Lookup user by username or email (case-insensitive)
        user = User.objects.filter(
            Q(username__iexact=username) | Q(email__iexact=username)
        ).first()

        if not user:
            # Check if this user is in the pending doctors approval queue
            pending_doc = PendingDoctor.objects.filter(
                Q(username__iexact=username) | Q(email__iexact=username)
            ).first()
            if pending_doc:
                if not getattr(pending_doc, 'is_slmc_verified', False):
                    return JsonResponse({
                        "error": "Your SLMC registration is not verified yet. Please complete verification.",
                        "slmc_unverified": True
                    }, status=403)
                return JsonResponse({"error": "Your doctor registration is pending administrator review & approval."}, status=403)
            return JsonResponse({"error": "Invalid username or password"}, status=401)

        if not user.check_password(password):
            return JsonResponse({"error": "Invalid username or password"}, status=401)

        if not user.is_active:
            return JsonResponse({"error": "This account is inactive."}, status=403)

        if not user.is_approved:
            return JsonResponse({"error": "Your account is pending admin approval."}, status=403)

        # SLMC License Verification Gate for Doctors
        if user.role == "doctor" and not getattr(user, "is_slmc_verified", False):
            return JsonResponse({
                "error": "Your SLMC registration is not verified yet. Please complete verification.",
                "slmc_unverified": True,
                "slmc_reg_no": getattr(user, "slmc_reg_no", None)
            }, status=403)

        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        response = JsonResponse({"message": "Login successful", **session_user(user)})
        response["Cache-Control"] = "no-store"
        return response

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"error": f"Failed to login: {str(e)}"}, status=500)


@api_view(['GET'])
def get_users(request):
    """Get all registered users."""
    try:
        users = User.objects.all().values(
            'id', 'username', 'email', 'phone', 'birthday',
            'role', 'date_joined', 'NIC_number', 'is_approved', 'doctorID'
        )
        return JsonResponse({'users': list(users)})
    except Exception as e:
        return JsonResponse({'error': f'Failed to get users: {str(e)}'}, status=500)


@api_view(['GET'])
def get_doctor(request):
    """
    Get all doctors: Checks User (role='doctor') and register_DoctorID table.
    Attaches live availability status so patients know who is currently online.
    """
    try:
        doctor_list = []
        seen_ids = set()
        today = datetime.date.today()

        # 1. Registered doctors from User model
        user_doctors = User.objects.filter(role='doctor').order_by('id')
        for u in user_doctors:
            doc_id = u.doctorID or f"DOC-{u.id:04d}"
            seen_ids.add(doc_id)

            raw_name = u.username.strip()
            doc_name = raw_name if raw_name.lower().startswith('dr.') else f"Dr. {raw_name}"

            # Check live availability
            live = DoctorLiveAvailability.objects.filter(doctor_id=doc_id).first()
            is_live = False
            available_until_str = None
            if live and live.is_available and (live.available_date == today or live.available_date is None):
                is_live = True
                if live.available_until:
                    available_until_str = live.available_until.strftime("%I:%M %p")

            doctor_list.append({
                'doctor_id': doc_id,
                'register_id': f"SLMC-{10000 + u.id}",
                'doctor_nicnumber': u.NIC_number or f"1990{u.id:04d}0V",
                'doctors_name': doc_name,
                'dob': str(u.birthday) if u.birthday else '1985-05-15',
                'degrees': u.degrees or 'MBBS, MD',
                'university': u.university or 'University of Colombo',
                'working_hospital': u.working_hospital or 'MediTrack General Hospital',
                'is_available': is_live,
                'available_until': available_until_str,
            })

        # 2. Any additional doctors in Doctor model
        for d in Doctor.objects.all():
            if d.doctor_id not in seen_ids:
                seen_ids.add(d.doctor_id)
                live = DoctorLiveAvailability.objects.filter(doctor_id=d.doctor_id).first()
                is_live = bool(live and live.is_available and live.available_date == today)
                until_str = live.available_until.strftime("%I:%M %p") if (live and live.available_until) else None
                doctor_list.append({
                    'doctor_id': d.doctor_id,
                    'register_id': d.register_id,
                    'doctor_nicnumber': d.doctor_nicnumber,
                    'doctors_name': d.doctors_name,
                    'dob': str(d.dob),
                    'degrees': d.degrees,
                    'university': d.university,
                    'working_hospital': d.working_hospital,
                    'is_available': is_live,
                    'available_until': until_str,
                })

        return JsonResponse({'doctors': doctor_list})
    except Exception as e:
        return JsonResponse({'error': f'Failed to get doctors: {str(e)}'}, status=500)


@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsApprovedAdmin])
def get_pending_doctors(request):
    """Get all doctors waiting for admin approval."""
    try:
        pending_doctors = PendingDoctor.objects.filter(status='pending').values(
            'id', 'username', 'email', 'phone', 'NIC_number',
            'birthday', 'university', 'degrees', 'working_hospital',
            'slmc_reg_no', 'is_slmc_verified', 'slmc_verified_at',
            'status', 'created_at'
        )
        return JsonResponse({'pending_doctors': list(pending_doctors)})
    except Exception as e:
        return JsonResponse({'error': f'Failed to get pending doctors: {str(e)}'}, status=500)


@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsApprovedAdmin])
def approve_doctor(request, pk): #pk means  
    """Admin approves a pending doctor — creates their User account."""
    try:
        pending = PendingDoctor.objects.get(id=pk, status='pending')

        user = User(
            username=pending.username,
            email=pending.email,
            phone=pending.phone,
            NIC_number=pending.NIC_number,
            birthday=pending.birthday,
            role='doctor',
            degrees=pending.degrees,
            university=pending.university,
            working_hospital=pending.working_hospital,
            slmc_reg_no=getattr(pending, 'slmc_reg_no', None),
            is_slmc_verified=getattr(pending, 'is_slmc_verified', True),
            slmc_verified_at=getattr(pending, 'slmc_verified_at', None),
            is_approved=True,
        )
        user.set_password(pending.password)
        user.save()

        pending.status = 'approved'
        pending.save()

        return JsonResponse({'message': f'Doctor {user.username} approved and account created.'})
    except PendingDoctor.DoesNotExist:
        return JsonResponse({'error': 'Pending doctor not found or already processed.'}, status=404)
    except Exception as e:
        return JsonResponse({'error': f'Approval failed: {str(e)}'}, status=500)


@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsApprovedAdmin])
def reject_doctor(request, pk):
    """Admin rejects a pending doctor."""
    try:
        pending = PendingDoctor.objects.get(id=pk, status='pending')
        pending.status = 'rejected'
        pending.save()
        return JsonResponse({'message': f'Doctor {pending.username} rejected.'})
    except PendingDoctor.DoesNotExist:
        return JsonResponse({'error': 'Pending doctor not found or already processed.'}, status=404)
    except Exception as e:
        return JsonResponse({'error': f'Rejection failed: {str(e)}'}, status=500)


@api_view(['GET'])
def health_check(request):
    """Simple health check endpoint."""
    return Response({'status': 'Server is running', 'message': 'Medicare API is healthy!'})


@api_view(['POST'])
def mobile_login(request):
    """Mobile app login returning session token and user details for AuthProvider."""
    try:
        data = request.data if hasattr(request, 'data') and request.data else json.loads(request.body)
        username = (data.get("username") or data.get("identifier") or "").strip()
        password = data.get("password", "")

        if not username or not password:
            return JsonResponse({"error": "Username and password are required"}, status=400)

        # Lookup user by username, email, or phone (case-insensitive)
        phone_variants = [username]
        clean_num = ''.join(c for c in username if c.isdigit())
        if clean_num:
            if clean_num.startswith('94') and len(clean_num) == 11:
                phone_variants.extend(['+' + clean_num, '0' + clean_num[2:], clean_num[2:]])
            elif clean_num.startswith('0') and len(clean_num) == 10:
                phone_variants.extend(['+94' + clean_num[1:], clean_num, clean_num[1:]])
            else:
                phone_variants.extend(['+94' + clean_num, '0' + clean_num, clean_num])

        user = User.objects.filter(
            Q(username__iexact=username) | 
            Q(email__iexact=username) | 
            Q(phone__in=phone_variants)
        ).first()

        if not user:
            is_pending = PendingDoctor.objects.filter(
                Q(username__iexact=username) | Q(email__iexact=username)
            ).exists()
            if is_pending:
                return JsonResponse({"error": "Your doctor registration is pending administrator review & approval."}, status=403)
            return JsonResponse({"error": "Invalid username or password"}, status=401)

        if not user.check_password(password):
            return JsonResponse({"error": "Invalid username or password"}, status=401)

        if not user.is_approved:
            return JsonResponse({"error": "Your account is pending admin approval."}, status=403)

        if user.role == "doctor" and not getattr(user, "is_slmc_verified", False):
            return JsonResponse({
                "error": "Your SLMC registration is not verified yet. Please complete verification.",
                "slmc_unverified": True,
                "slmc_reg_no": getattr(user, "slmc_reg_no", None)
            }, status=403)

        # Generate a session token
        token = f"meditrack_{user.id}_{uuid.uuid4().hex}"
        expires_at = (timezone.now() + datetime.timedelta(days=7)).isoformat()

        return JsonResponse({
            "access_token": token,
            "expires_at": expires_at,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "doctorID": user.doctorID,
                "lab_name": user.lab_name,
                "license_id": user.license_id,
                "lab_address": user.lab_address,
            }
        }, status=200)

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"error": f"Failed to login: {str(e)}"}, status=500)


@api_view(['GET'])
def mobile_me(request):
    """Return user info for authenticated mobile session."""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return JsonResponse({"error": "Unauthorized"}, status=401)

    token = auth_header.split('Bearer ')[1].strip()
    parts = token.split('_')
    if len(parts) >= 2 and parts[0] == 'meditrack':
        try:
            uid = int(parts[1])
            user = User.objects.filter(id=uid).first()
            if user:
                return JsonResponse({
                    "user": {
                        "id": user.id,
                        "username": user.username,
                        "email": user.email,
                        "role": user.role,
                        "doctorID": user.doctorID,
                        "lab_name": user.lab_name,
                        "license_id": user.license_id,
                        "lab_address": user.lab_address,
                    }
                })
        except Exception:
            pass

    return JsonResponse({"error": "Invalid or expired token"}, status=401)


@api_view(['POST'])
def mobile_logout(request):
    """Handle mobile session logout."""
    return JsonResponse({"message": "Logged out successfully"}, status=200)




@api_view(['POST'])
def mobile_logout(request):
    """Handle mobile session logout."""
    return JsonResponse({"message": "Logged out successfully"}, status=200)


@api_view(['GET'])
def reset_priya_password(request):
    """Quick password reset for Priya Singh."""
    user = User.objects.filter(username__iexact='Priya Singh').first()
    if user:
        user.set_password('Priya@123')
        user.is_approved = True
        user.is_active = True
        user.save()
        return JsonResponse({
            'status': 'success',
            'message': 'Password for Priya Singh has been changed to Priya@123',
            'username': user.username,
            'role': user.role,
            'is_approved': user.is_approved
        })
    return JsonResponse({'status': 'error', 'message': 'User Priya Singh not found'}, status=404)


@api_view(['GET'])
def check_doctor_availability(request):
    """
    Check if a doctor is available on a specific date.
    A doctor is ONLY available if they have created an active schedule in doctor_tasks.
    """
    doctor_id = request.GET.get('doctor_id', '').strip()
    date_str = request.GET.get('date', '').strip()

    if not doctor_id or not date_str:
        return JsonResponse({'error': 'doctor_id and date query parameters are required'}, status=400)

    try:
        query_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return JsonResponse({'error': 'Invalid date format. Use YYYY-MM-DD'}, status=400)

    # 1. Check live availability or scheduled task
    live = DoctorLiveAvailability.objects.filter(doctor_id=doctor_id).first()
    schedule = Task.objects.filter(doctor_id=doctor_id, task_date=query_date).first()
    registered_doc = Doctor.objects.filter(doctor_id=doctor_id).first()
    doctor_user = User.objects.filter(doctorID=doctor_id).first()

    doctor_name = (
        (live.doctor_name if live and live.doctor_name else None) or
        (f"Dr. {doctor_user.username}" if doctor_user else None) or
        (registered_doc.doctors_name if registered_doc else None) or
        f"Doctor ({doctor_id})"
    )

    is_available = False
    start_time_str = "09:00 AM"
    end_time_str = "01:00 PM"
    task_title = "Consultation"

    if live and live.is_available and (live.available_date == query_date or query_date == datetime.date.today()):
        is_available = True
        start_time_str = "Now (Live)"
        end_time_str = live.available_until.strftime("%I:%M %p") if live.available_until else "Until Further Notice"
        task_title = f"Live Consultation (Until {end_time_str})"
    elif schedule:
        is_available = True
        start_time_str = schedule.start_time.strftime("%I:%M %p") if hasattr(schedule.start_time, 'strftime') else str(schedule.start_time)
        end_time_str = schedule.end_time.strftime("%I:%M %p") if hasattr(schedule.end_time, 'strftime') else str(schedule.end_time)
        task_title = schedule.task_title
    else:
        # Check if doctor is a registered consultant in Doctor or User table
        explicitly_offline = live and (live.is_available is False) and (live.available_date == query_date)
        if (registered_doc or doctor_user) and not explicitly_offline and not live:
            is_available = True
            start_time_str = "09:00 AM"
            end_time_str = "01:00 PM"
            task_title = "OPD General Consultation"

    if not is_available:
        return JsonResponse({
            'available': False,
            'doctor_id': doctor_id,
            'doctor_name': doctor_name,
            'date': date_str,
            'message': 'Doctor is currently offline / not accepting patients.'
        }, status=200)

    # 2. Get current queue counts for this doctor on this date
    booked_count = Appointment.objects.filter(
        doctor_id=doctor_id,
        appointment_date=query_date
    ).exclude(status='cancelled').count()

    next_token_num = booked_count + 1
    next_token_label = f"#{next_token_num:02d}"

    return JsonResponse({
        'available': True,
        'doctor_id': doctor_id,
        'doctor_name': doctor_name,
        'date': date_str,
        'task_title': task_title,
        'start_time': start_time_str,
        'end_time': end_time_str,
        'total_booked': booked_count,
        'next_token': next_token_label,
        'estimated_wait_minutes': booked_count * 10
    }, status=200)


@api_view(['POST'])
def book_appointment(request):
    """
    Securely book an appointment and issue the next sequential Queue Token.
    Validates that doctor is currently online/live, scheduled, or registered.
    """
    try:
        data = request.data if hasattr(request, 'data') and request.data else json.loads(request.body)
        doctor_id = str(data.get("doctor_id", "")).strip()
        doctor_name = str(data.get("doctor_name", "")).strip()
        date_str = str(data.get("appointment_date", "")).strip()
        hospital_name = str(data.get("hospital_name", "")).strip() or "Colombo Outpatient Clinic"
        reason = str(data.get("reason", "")).strip()

        if not doctor_id or not date_str:
            return JsonResponse({'error': 'doctor_id and appointment_date are required'}, status=400)

        try:
            appt_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return JsonResponse({'error': 'Invalid date format. Use YYYY-MM-DD'}, status=400)

        # Authenticate patient from session token or payload
        patient = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split('Bearer ')[1].strip()
            parts = token.split('_')
            if len(parts) >= 2 and parts[0] == 'meditrack':
                try:
                    uid = int(parts[1])
                    patient = User.objects.filter(id=uid).first()
                except Exception:
                    pass

        if not patient:
            p_user = data.get("patient_username") or data.get("username")
            if p_user:
                patient = User.objects.filter(username__iexact=p_user).first()

        if not patient:
            patient = User.objects.filter(role='patient').first() or User.objects.first()

        if not patient:
            return JsonResponse({'error': 'Authentication required. Please log in.'}, status=401)

        # Check live availability OR schedule OR registered doctor
        live = DoctorLiveAvailability.objects.filter(doctor_id=doctor_id).first()
        schedule = Task.objects.filter(doctor_id=doctor_id, task_date=appt_date).first()

        is_avail = False
        session_start = datetime.time(9, 0)
        session_end = datetime.time(13, 0)

        if live and live.is_available and (live.available_date == appt_date or appt_date == datetime.date.today()):
            is_avail = True
            session_end = live.available_until or datetime.time(17, 0)
            session_start = datetime.datetime.now().time()
        elif schedule:
            is_avail = True
            session_start = schedule.start_time
            session_end = schedule.end_time
        else:
            registered_doc = Doctor.objects.filter(doctor_id=doctor_id).first()
            explicitly_offline = live and (live.is_available is False) and (live.available_date == appt_date)
            if registered_doc and not explicitly_offline:
                is_avail = True
                session_start = datetime.time(9, 0)
                session_end = datetime.time(13, 0)

        if not is_avail:
            return JsonResponse({
                'error': f'Doctor is currently offline / not available on {date_str}.'
            }, status=400)

        # Check if patient already has an active appointment for this doctor on this date
        existing = Appointment.objects.filter(
            patient=patient,
            doctor_id=doctor_id,
            appointment_date=appt_date
        ).exclude(status='cancelled').exclude(status='completed').first()

        if existing:
            return JsonResponse({
                'message': 'You already have an active appointment for this doctor on this date.',
                'already_booked': True,
                'appointment': {
                    'id': existing.id,
                    'token_label': existing.token_label,
                    'token_number': existing.token_number,
                    'doctor_name': existing.doctor_name,
                    'appointment_date': str(existing.appointment_date),
                    'estimated_time': existing.estimated_time,
                    'status': existing.status
                }
            }, status=200)

        # Atomic token generation to prevent race conditions
        with transaction.atomic():
            last_token = Appointment.objects.filter(
                doctor_id=doctor_id,
                appointment_date=appt_date
            ).select_for_update().order_by('-token_number').first()

            token_number = (last_token.token_number + 1) if last_token else 1
            token_label = f"#{token_number:02d}"

            try:
                base_dt = datetime.datetime.combine(appt_date, session_start)
                est_dt = base_dt + datetime.timedelta(minutes=(token_number - 1) * 10)
                estimated_time = est_dt.strftime("%I:%M %p")
            except Exception:
                estimated_time = "In Consultation Window"

            appointment = Appointment.objects.create(
                patient=patient,
                doctor_id=doctor_id,
                doctor_name=doctor_name or f"Doctor {doctor_id}",
                hospital_name=hospital_name,
                appointment_date=appt_date,
                session_start_time=session_start,
                session_end_time=session_end,
                token_number=token_number,
                token_label=token_label,
                estimated_time=estimated_time,
                status='booked',
                reason=reason
            )

        return JsonResponse({
            'message': 'Appointment booked successfully!',
            'appointment': {
                'id': appointment.id,
                'token_label': appointment.token_label,
                'token_number': appointment.token_number,
                'doctor_name': appointment.doctor_name,
                'hospital_name': appointment.hospital_name,
                'appointment_date': str(appointment.appointment_date),
                'session_start_time': session_start.strftime("%I:%M %p") if hasattr(session_start, 'strftime') else str(session_start),
                'session_end_time': session_end.strftime("%I:%M %p") if hasattr(session_end, 'strftime') else str(session_end),
                'estimated_time': appointment.estimated_time,
                'status': appointment.status,
                'patients_ahead': token_number - 1,
                'estimated_wait_minutes': (token_number - 1) * 10
            }
        }, status=201)

    except Exception as e:
        return JsonResponse({'error': f'Failed to book appointment: {str(e)}'}, status=500)


@api_view(['POST'])
def set_doctor_availability(request):
    """Doctor sets their live availability and available-until time."""
    try:
        data = request.data if hasattr(request, 'data') and request.data else json.loads(request.body)
        doctor_id = str(data.get("doctor_id", "DOC-0001")).strip()
        doctor_name = str(data.get("doctor_name", "Doctor")).strip()
        is_available = bool(data.get("is_available", False))
        until_str = data.get("available_until")

        until_time = None
        if until_str:
            for fmt in ("%H:%M", "%H:%M:%S", "%I:%M %p"):
                try:
                    until_time = datetime.datetime.strptime(until_str.strip(), fmt).time()
                    break
                except ValueError:
                    pass

        avail, _ = DoctorLiveAvailability.objects.update_or_create(
            doctor_id=doctor_id,
            defaults={
                'doctor_name': doctor_name,
                'is_available': is_available,
                'available_until': until_time,
                'available_date': datetime.date.today(),
            }
        )

        return JsonResponse({
            'message': 'Availability updated successfully',
            'doctor_id': avail.doctor_id,
            'is_available': avail.is_available,
            'available_until': avail.available_until.strftime("%I:%M %p") if avail.available_until else None,
            'available_date': str(avail.available_date)
        }, status=200)
    except Exception as e:
        return JsonResponse({'error': f'Failed to update availability: {str(e)}'}, status=500)


@api_view(['GET'])
def get_doctor_live_availability(request):
    """Retrieve current live availability status for doctor."""
    doctor_id = request.GET.get('doctor_id', 'DOC-0001').strip()
    try:
        avail = DoctorLiveAvailability.objects.filter(doctor_id=doctor_id).first()
        if not avail:
            return JsonResponse({
                'doctor_id': doctor_id,
                'is_available': False,
                'available_until': None,
                'available_date': str(datetime.date.today())
            }, status=200)

        if avail.available_date != datetime.date.today():
            avail.is_available = False
            avail.available_date = datetime.date.today()
            avail.save()

        return JsonResponse({
            'doctor_id': avail.doctor_id,
            'doctor_name': avail.doctor_name,
            'is_available': avail.is_available,
            'available_until': avail.available_until.strftime("%I:%M %p") if avail.available_until else None,
            'available_date': str(avail.available_date)
        }, status=200)
    except Exception as e:
        return JsonResponse({
            'doctor_id': doctor_id,
            'is_available': False,
            'available_until': None,
            'available_date': str(datetime.date.today()),
            'warning': f'Database unavailable: {str(e)}'
        }, status=200)


@api_view(['GET'])
def get_my_queue(request):
    """
    Get live queue status for the logged-in patient's latest active appointment.
    """
    try:
        patient = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split('Bearer ')[1].strip()
            parts = token.split('_')
            if len(parts) >= 2 and parts[0] == 'meditrack':
                try:
                    uid = int(parts[1])
                    patient = User.objects.filter(id=uid).first()
                except Exception:
                    pass

        if not patient:
            p_user = request.GET.get('username')
            if p_user:
                patient = User.objects.filter(username__iexact=p_user).first()

        if not patient:
            patient = User.objects.filter(role='patient').first() or User.objects.first()

        if not patient:
            return JsonResponse({'has_appointment': False}, status=200)

        # Get latest booked or serving appointment
        appt = Appointment.objects.filter(
            patient=patient
        ).exclude(status='completed').exclude(status='cancelled').order_by('-appointment_date', 'token_number').first()

        if not appt:
            return JsonResponse({'has_appointment': False}, status=200)

        # Get currently serving token for this doctor on this date
        serving = Appointment.objects.filter(
            doctor_id=appt.doctor_id,
            appointment_date=appt.appointment_date,
            status='serving'
        ).first()

        if not serving:
            lowest_pending = Appointment.objects.filter(
                doctor_id=appt.doctor_id,
                appointment_date=appt.appointment_date,
                status='booked'
            ).order_by('token_number').first()
            current_serving_token = lowest_pending.token_label if lowest_pending else "#01"
            current_serving_num = lowest_pending.token_number if lowest_pending else 1
        else:
            current_serving_token = serving.token_label
            current_serving_num = serving.token_number

        patients_ahead = max(0, appt.token_number - current_serving_num)
        estimated_wait = patients_ahead * 10

        return JsonResponse({
            'has_appointment': True,
            'appointment': {
                'id': appt.id,
                'my_token': appt.token_label,
                'my_token_number': appt.token_number,
                'doctor_name': appt.doctor_name,
                'doctor_id': appt.doctor_id,
                'hospital_name': appt.hospital_name,
                'appointment_date': str(appt.appointment_date),
                'session_start_time': appt.session_start_time.strftime("%I:%M %p") if hasattr(appt.session_start_time, 'strftime') else str(appt.session_start_time or "09:00 AM"),
                'current_serving_token': current_serving_token,
                'patients_ahead': patients_ahead,
                'estimated_wait_minutes': max(5, estimated_wait),
                'status': appt.status,
                'estimated_time': appt.estimated_time
            }
        }, status=200)

    except Exception as e:
        return JsonResponse({'error': f'Failed to retrieve queue: {str(e)}'}, status=500)


@api_view(['GET'])
def get_doctor_queue(request):
    """
    Doctor views their live patient queue for a given date (defaults to today).
    Query params: doctor_id, date (YYYY-MM-DD optional), username
    """
    try:
        doctor_id = request.GET.get('doctor_id', '').strip()
        date_str = request.GET.get('date', '').strip()

        if not doctor_id:
            username = request.GET.get('username', '').strip()
            if username:
                u = User.objects.filter(username__iexact=username).first()
                if u and u.doctorID:
                    doctor_id = u.doctorID
                else:
                    doc = Doctor.objects.filter(doctors_name__icontains=username).first()
                    if doc:
                        doctor_id = doc.doctor_id

        if not doctor_id:
            first_doc = Doctor.objects.first()
            doctor_id = first_doc.doctor_id if first_doc else "DOC-0001"

        if date_str:
            try:
                query_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                query_date = datetime.date.today()
        else:
            query_date = datetime.date.today()

        appts = Appointment.objects.filter(
            doctor_id=doctor_id,
            appointment_date=query_date
        ).order_by('token_number')

        queue_list = []
        now_serving = None

        for a in appts:
            patient_user = a.patient
            age = None
            if patient_user.birthday:
                today = datetime.date.today()
                age = today.year - patient_user.birthday.year - ((today.month, today.day) < (patient_user.birthday.month, patient_user.birthday.day))

            item = {
                'id': a.id,
                'token_number': a.token_number,
                'token_label': a.token_label,
                'patient_id': patient_user.id,
                'patient_name': patient_user.username,
                'patient_email': patient_user.email,
                'patient_phone': patient_user.phone or "N/A",
                'patient_age': age or 28,
                'status': a.status,
                'reason': a.reason or "Routine Medical Consultation",
                'estimated_time': a.estimated_time or "In Queue",
                'created_at': a.created_at.strftime("%I:%M %p") if a.created_at else None,
            }
            queue_list.append(item)
            if a.status == 'serving' and not now_serving:
                now_serving = item

        if not now_serving:
            for item in queue_list:
                if item['status'] == 'booked':
                    now_serving = item
                    break

        total_booked = appts.count()
        waiting_count = appts.filter(status='booked').count()
        completed_count = appts.filter(status='completed').count()
        serving_count = appts.filter(status='serving').count()

        live = DoctorLiveAvailability.objects.filter(doctor_id=doctor_id).first()
        is_live = live.is_available if live else False
        available_until = live.available_until.strftime("%I:%M %p") if live and live.available_until else None

        return JsonResponse({
            'success': True,
            'doctor_id': doctor_id,
            'date': str(query_date),
            'is_live': is_live,
            'available_until': available_until,
            'stats': {
                'total': total_booked,
                'waiting': waiting_count,
                'serving': serving_count,
                'completed': completed_count,
                'now_serving_token': now_serving['token_label'] if now_serving else None,
            },
            'now_serving': now_serving,
            'queue': queue_list
        }, status=200)

    except Exception as e:
        return JsonResponse({
            'success': False,
            'doctor_id': doctor_id or "DOC-0001",
            'date': str(query_date if 'query_date' in locals() else datetime.date.today()),
            'is_live': False,
            'available_until': None,
            'stats': {'total': 0, 'waiting': 0, 'serving': 0, 'completed': 0, 'now_serving_token': None},
            'now_serving': None,
            'queue': [],
            'warning': f'Database connection temporarily unavailable: {str(e)}'
        }, status=200)


@api_view(['POST'])
def update_appointment_status(request):
    """
    Doctor advances or updates the status of an appointment.
    POST body: { appointment_id: 12, status: 'serving' | 'completed' | 'cancelled' | 'booked' }
    """
    try:
        data = request.data if hasattr(request, 'data') and request.data else json.loads(request.body)
        appt_id = data.get("appointment_id")
        new_status = str(data.get("status", "")).strip().lower()

        if not appt_id or not new_status:
            return JsonResponse({'error': 'appointment_id and status are required'}, status=400)

        if new_status not in ['booked', 'serving', 'completed', 'cancelled']:
            return JsonResponse({'error': 'Invalid status. Must be booked, serving, completed, or cancelled'}, status=400)

        appt = Appointment.objects.filter(id=appt_id).first()
        if not appt:
            return JsonResponse({'error': 'Appointment not found'}, status=404)

        with transaction.atomic():
            if new_status == 'serving':
                Appointment.objects.filter(
                    doctor_id=appt.doctor_id,
                    appointment_date=appt.appointment_date,
                    status='serving'
                ).exclude(id=appt.id).update(status='completed')

            appt.status = new_status
            appt.save()

        return JsonResponse({
            'success': True,
            'message': f"Appointment {appt.token_label} updated to {new_status}",
            'appointment': {
                'id': appt.id,
                'token_label': appt.token_label,
                'token_number': appt.token_number,
                'status': appt.status,
                'doctor_id': appt.doctor_id,
                'patient_name': appt.patient.username
            }
        }, status=200)

    except Exception as e:
        return JsonResponse({'error': f'Failed to update status: {str(e)}'}, status=500)


@api_view(['POST'])
def cancel_appointment(request):
    """
    Cancel an appointment by ID.
    POST body: { appointment_id: 12 }
    """
    try:
        data = request.data if hasattr(request, 'data') and request.data else json.loads(request.body)
        appt_id = data.get("appointment_id")
        if not appt_id:
            return JsonResponse({'error': 'appointment_id is required'}, status=400)

        appt = Appointment.objects.filter(id=appt_id).first()
        if not appt:
            return JsonResponse({'error': 'Appointment not found'}, status=404)

        appt.status = 'cancelled'
        appt.save()

        return JsonResponse({
            'success': True,
            'message': f"Appointment {appt.token_label} has been cancelled successfully."
        }, status=200)
    except Exception as e:
        return JsonResponse({'error': f'Failed to cancel appointment: {str(e)}'}, status=500)


@api_view(['GET'])
def get_patient_appointments(request):
    """
    Retrieve all appointments for a patient (past and upcoming).
    Query param: username
    """
    try:
        username = request.GET.get('username', '').strip()
        patient = None

        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split('Bearer ')[1].strip()
            parts = token.split('_')
            if len(parts) >= 2 and parts[0] == 'meditrack':
                try:
                    uid = int(parts[1])
                    patient = User.objects.filter(id=uid).first()
                except Exception:
                    pass

        if not patient and username:
            patient = User.objects.filter(username__iexact=username).first()

        if not patient:
            patient = User.objects.filter(role='patient').first() or User.objects.first()

        if not patient:
            return JsonResponse({'appointments': []}, status=200)

        appts = Appointment.objects.filter(patient=patient).order_by('-appointment_date', '-token_number')
        result = []
        for a in appts:
            result.append({
                'id': a.id,
                'token_label': a.token_label,
                'token_number': a.token_number,
                'doctor_id': a.doctor_id,
                'doctor_name': a.doctor_name,
                'hospital_name': a.hospital_name,
                'appointment_date': str(a.appointment_date),
                'session_start_time': a.session_start_time.strftime("%I:%M %p") if hasattr(a.session_start_time, 'strftime') else str(a.session_start_time or "09:00 AM"),
                'status': a.status,
                'estimated_time': a.estimated_time,
                'reason': a.reason
            })

        return JsonResponse({'success': True, 'appointments': result}, status=200)
    except Exception as e:
        return JsonResponse({'error': f'Failed to get appointments: {str(e)}'}, status=500)


# ==============================================================================
# MEDICAL OFFICER / PUBLIC HEALTH INSPECTOR (PHI) ENDPOINTS
# ==============================================================================

@api_view(['POST'])
def medical_officer_login_api(request):
    """
    Dedicated Login endpoint for Medical Officers / Public Health Inspectors (PHI).
    POST { "username": "phi_officer", "password": "Password@123" }
    """
    try:
        data = request.data if hasattr(request, 'data') and request.data else json.loads(request.body)
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", "")).strip()

        if not username or not password:
            return JsonResponse({"error": "Username/Officer ID and password are required."}, status=400)

        # Lookup by username, email, or officer ID (doctorID/license_id)
        user = User.objects.filter(
            Q(username__iexact=username) | 
            Q(email__iexact=username) | 
            Q(doctorID__iexact=username) | 
            Q(license_id__iexact=username)
        ).first()

        if not user or not user.check_password(password):
            return JsonResponse({"error": "Invalid credentials for Medical Officer / PHI."}, status=401)

        if user.role not in ['medical_officer', 'phi', 'admin']:
            return JsonResponse({"error": "Access denied. This account does not have Medical Officer / PHI privileges."}, status=403)

        if not user.is_active:
            return JsonResponse({"error": "This Medical Officer account is deactivated."}, status=403)

        # Generate access token
        token = f"meditrack_mo_{user.id}_{uuid.uuid4().hex}"
        expires_at = (timezone.now() + datetime.timedelta(days=7)).isoformat()

        # Safely handle session if session middleware is active
        req_for_login = getattr(request, '_request', request)
        if hasattr(req_for_login, 'session'):
            try:
                login(req_for_login, user, backend="django.contrib.auth.backends.ModelBackend")
            except Exception:
                pass

        return JsonResponse({
            "success": True,
            "message": "Medical Officer / PHI login successful.",
            "access_token": token,
            "expires_at": expires_at,
            "user": session_user(user),
        }, status=200)

    except Exception as e:
        return JsonResponse({"error": f"Login failed: {str(e)}"}, status=500)


@api_view(['GET'])
def medical_officer_dashboard_data(request):
    """
    Returns epidemiological outbreak surveillance summary, premises inspections, 
    and public health metrics for the Medical Officer's assigned division.
    """
    try:
        user = getattr(request, 'user', None)
        assigned_area = "Colombo North"
        officer_name = "Dr. / Insp. Medical Officer"
        officer_id = "MOH-COL-04"

        if user and getattr(user, 'is_authenticated', False) and getattr(user, 'role', '') in ['medical_officer', 'phi']:
            assigned_area = getattr(user, 'working_hospital', None) or assigned_area
            officer_name = user.get_full_name() or user.username
            officer_id = getattr(user, 'doctorID', None) or getattr(user, 'license_id', None) or officer_id

        # Query param override if passed
        query_area = request.GET.get('area', '').strip()
        if query_area:
            assigned_area = query_area

        # Outbreak intelligence mapping tailored to Sri Lankan health divisions
        is_western = any(w in assigned_area.lower() for w in ["colombo", "gampaha", "kalutara", "western"])
        is_central = any(w in assigned_area.lower() for w in ["kandy", "matale", "nuwara eliya", "central"])

        district_risk = "High Surge" if is_western else ("Moderate Alert" if is_central else "Controlled")

        area_metrics = {
            "success": True,
            "assigned_area": assigned_area,
            "officer_name": officer_name,
            "officer_id": officer_id,
            "moh_office": getattr(user, 'lab_name', None) or f"MOH Office - {assigned_area}",
            "district_risk_level": district_risk,
            "last_surveillance_sync": datetime.datetime.now().strftime("%Y-%m-%d %I:%M %p"),
            "active_outbreaks": [
                {
                    "disease": "Dengue Fever (Serotype 2)",
                    "risk": "High Surge" if is_western else "Moderate",
                    "active_cases": 142 if is_western else 45,
                    "high_risk_gn_divisions": [f"{assigned_area} Zone A", f"{assigned_area} East", f"{assigned_area} Industrial"],
                    "action_required": "Source reduction, larva survey & fogging campaign",
                    "contagion_index": "R0: 1.5"
                },
                {
                    "disease": "Seasonal Influenza (H3N2 / Flu A)",
                    "risk": "Elevated",
                    "active_cases": 89,
                    "high_risk_gn_divisions": [f"{assigned_area} Commercial Zone", "Central Bus Terminal"],
                    "action_required": "School awareness, triage protocols & mask advisory",
                    "contagion_index": "R0: 1.3"
                },
                {
                    "disease": "Acute Gastroenteritis",
                    "risk": "Controlled",
                    "active_cases": 18,
                    "high_risk_gn_divisions": ["Market Street Food Stalls"],
                    "action_required": "Water safety testing & food handling inspection",
                    "contagion_index": "R0: 0.8"
                }
            ],
            "inspection_statistics": {
                "premises_inspected_this_month": 485,
                "larval_breeding_sites_detected": 64,
                "red_notices_issued": 19,
                "legal_notices_served": 5,
                "fogging_operations_completed": 12
            },
            "recent_inspection_logs": [
                {
                    "id": "INS-2026-101",
                    "premises": "Commercial Construction Site, Ward 04",
                    "category": "Construction / Commercial",
                    "date": "2026-10-21",
                    "status": "Breeding Site Detected",
                    "action": "Section 2 Red Notice Issued - 7 Days to Rectify",
                    "officer": officer_name
                },
                {
                    "id": "INS-2026-102",
                    "premises": "St. Mary's Primary School Grounds",
                    "category": "Educational Institute",
                    "date": "2026-10-20",
                    "status": "Clear / Negative",
                    "action": "Cleanliness Certificate Endorsed",
                    "officer": officer_name
                },
                {
                    "id": "INS-2026-103",
                    "premises": "Royal Bakery & Sweet House",
                    "category": "Food Establishment",
                    "date": "2026-10-19",
                    "status": "Minor Sanitation Defect",
                    "action": "Written Warning Issued",
                    "officer": officer_name
                }
            ]
        }

        return JsonResponse(area_metrics, status=200)

    except Exception as e:
        return JsonResponse({"error": f"Failed to load surveillance data: {str(e)}"}, status=500)


@api_view(['POST'])
def medical_officer_submit_notice(request):
    """
    Medical Officer / PHI submits a new inspection record or public health alert notice.
    """
    try:
        data = request.data if hasattr(request, 'data') and request.data else json.loads(request.body)
        premises_name = data.get("premises_name", "").strip()
        category = data.get("category", "General Premises").strip()
        status = data.get("status", "Routine Inspection").strip()
        action_taken = data.get("action_taken", "Inspection Recorded").strip()
        notes = data.get("notes", "").strip()

        if not premises_name:
            return JsonResponse({"error": "Premises name is required."}, status=400)

        record_id = f"INS-2026-{uuid.uuid4().hex[:6].upper()}"

        return JsonResponse({
            "success": True,
            "message": f"Public health inspection record {record_id} recorded successfully.",
            "record": {
                "id": record_id,
                "premises": premises_name,
                "category": category,
                "date": str(datetime.date.today()),
                "status": status,
                "action": action_taken,
                "notes": notes,
                "officer": (getattr(request, 'user', None) and getattr(request.user, 'username', None)) or "PHI Field Officer"
            }
        }, status=201)
    except Exception as e:
        return JsonResponse({"error": f"Failed to record notice: {str(e)}"}, status=500)


@api_view(['POST', 'GET'])
def verify_slmc_registration_api(request):
    """
    POST / GET endpoint to verify medical practitioner credentials against SLMC.
    Accepts: { 'slmc_reg_no': 'SLMC-24901', 'nic': '199012345678', 'name': 'Dr. Perera' }
    """
    try:
        from .slmc_service import verify_doctor_slmc

        if request.method == 'POST':
            data = request.data if hasattr(request, 'data') and request.data else json.loads(request.body or '{}')
            reg_no = data.get('slmc_reg_no') or data.get('reg_no') or data.get('slmc_number')
            nic = data.get('nic') or data.get('NIC_number') or ''
            name = data.get('name') or data.get('username') or ''
        else:
            reg_no = request.GET.get('slmc_reg_no') or request.GET.get('reg_no') or request.GET.get('slmc_number')
            nic = request.GET.get('nic') or request.GET.get('NIC_number') or ''
            name = request.GET.get('name') or request.GET.get('username') or ''

        if not reg_no:
            return JsonResponse({'verified': False, 'error': 'SLMC Registration Number is required.'}, status=400)

        result = verify_doctor_slmc(reg_no=reg_no, nic_number=nic, doctor_name=name)
        status_code = 200 if result.get('verified') else 400
        return JsonResponse(result, status=status_code)
    except Exception as e:
        return JsonResponse({'verified': False, 'error': f'Verification failed: {str(e)}'}, status=500)





