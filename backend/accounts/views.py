import _winapi
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.http import JsonResponse
from django.db.models import Q
import json
import uuid
import datetime
from accounts.models import PendingDoctor, User, Doctor, Laborator, Appointment, DoctorLiveAvailability
from taskcreate.models import Task
from django.db import transaction

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
            pending = PendingDoctor.objects.create(
                username=data.get('username'),
                email=data.get('email'),
                password=data.get('password'),
                phone=data.get('phone'),
                NIC_number=data.get('NIC_number'),
                birthday=data.get('birthday'),
                university=data.get('university'),
                degrees=data.get('degrees'),
                working_hospital=data.get('working_hospital'),
                status='pending',
            )
            return JsonResponse({
                'message': 'Registration submitted! Waiting for admin approval.',
                'pending_id': pending.id
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

        else:
            return JsonResponse({'error': 'Invalid role. Must be "patient", "doctor", or "lab".'}, status=400)

    except Exception as e:
        return JsonResponse({'error': f'Registration failed: {str(e)}'}, status=500)


@api_view(['POST'])
def login_user(request):
    """Login with username (or email) and password."""
    try:
        data = json.loads(request.body)
        username = data.get("username", "").strip()
        password = data.get("password", "")

        if not username or not password:
            return JsonResponse({"error": "Username and password are required"}, status=400)

        # Lookup user by username or email (case-insensitive)
        user = User.objects.filter(
            Q(username__iexact=username) | Q(email__iexact=username)
        ).first()

        if not user:
            # Check if this user is in the pending doctors approval queue
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

        return JsonResponse({
            "message": "Login successful",
            "username": user.username,
            "role": user.role,
            "doctorID": user.doctorID,
            "lab_name": user.lab_name,
            "license_id": user.license_id,
            "lab_address": user.lab_address,
        }, status=200)

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
def get_pending_doctors(request):
    """Get all doctors waiting for admin approval."""
    try:
        pending_doctors = PendingDoctor.objects.filter(status='pending').values(
            'id', 'username', 'email', 'phone', 'NIC_number',
            'birthday', 'university', 'degrees', 'working_hospital', 'status', 'created_at'
        )
        return JsonResponse({'pending_doctors': list(pending_doctors)})
    except Exception as e:
        return JsonResponse({'error': f'Failed to get pending doctors: {str(e)}'}, status=500)


@api_view(['POST'])
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

        # Lookup user by username or email (case-insensitive)
        user = User.objects.filter(
            Q(username__iexact=username) | Q(email__iexact=username)
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

    if not is_available:
        return JsonResponse({
            'available': False,
            'doctor_id': doctor_id,
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
        'doctor_name': (live.doctor_name if live and live.doctor_name else None),
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
    Validates that doctor is currently online/live or scheduled.
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

        # Check live availability OR schedule
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

        if not is_avail:
            return JsonResponse({
                'error': f'Doctor is currently offline / not available on {date_str}.'
            }, status=400)

        # Check if patient already has an active appointment for this doctor on this date
        existing = Appointment.objects.filter(
            patient=patient,
            doctor_id=doctor_id,
            appointment_date=appt_date
        ).exclude(status='cancelled').first()

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



