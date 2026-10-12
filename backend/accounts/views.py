from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from django.http import JsonResponse
from django.db.models import Q
from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST
import json
from accounts.models import PendingDoctor, User, Doctor, Laborator  
from accounts.permissions import IsApprovedAdmin


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


def session_user(user):
    return {
        "id": user.pk,
        "username": user.username,
        "role": user.role,
        "doctorID": user.doctorID,
        "lab_name": user.lab_name,
        "license_id": user.license_id,
        "lab_address": user.lab_address,
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
@csrf_protect
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
            is_pending = PendingDoctor.objects.filter(
                Q(username__iexact=username) | Q(email__iexact=username)
            ).exists()
            if is_pending:
                return JsonResponse({"error": "Your doctor registration is pending administrator review & approval."}, status=403)
            return JsonResponse({"error": "Invalid username or password"}, status=401)

        if not user.check_password(password):
            return JsonResponse({"error": "Invalid username or password"}, status=401)

        if not user.is_active:
            return JsonResponse({"error": "This account is inactive."}, status=403)

        if not user.is_approved:
            return JsonResponse({"error": "Your account is pending admin approval."}, status=403)

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
    """Get all pre-registered doctors from register_DoctorID table."""
    try:
        doctors = Doctor.objects.all().values(
            'doctor_id', 'register_id', 'doctor_nicnumber',
            'doctors_name', 'dob', 'degrees', 'university', 'working_hospital'
        )
        return JsonResponse({'doctors': list(doctors)})
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
            'birthday', 'university', 'degrees', 'working_hospital', 'status', 'created_at'
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

