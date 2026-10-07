from django.http import JsonResponse
from django.db import DatabaseError, connection
from rest_framework.decorators import api_view
from rest_framework.response import Response
from medicare_project.database import database_error_message
from taskcreate.models import Task
import json
import logging

logger = logging.getLogger(__name__)


@api_view(['POST'])
def create_task(request):
    """Create a new task"""
    try:
        data = json.loads(request.body)

        task_id = data.get("task_id")  # optional (AutoField will handle if None)
        doctor_id = data.get("doctor_id")
        task_date = data.get("task_date")
        task_title = data.get("task_title")
        task_description = data.get("task_description")
        task_type = data.get("task_type")
        start_time = data.get("start_time")
        end_time = data.get("end_time")
        priority = data.get("priority")

        # Required field validation
        if not all([task_date, task_title, start_time, end_time]):
            return JsonResponse(
                {'error': 'All required fields must be provided'},
                status=400
            )

        task = Task.objects.create(
            doctor_id=doctor_id,
            task_date=task_date,
            task_title=task_title,
            task_description=task_description,
            task_type=task_type,
            start_time=start_time,
            end_time=end_time,
            priority=priority
        )

        return JsonResponse({
            'message': 'Task created successfully',
            'task_id': task.task_id
        }, status=200)

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)

    except ValueError as e:
        return JsonResponse({'error': f'Invalid data: {str(e)}'}, status=400)

    except Exception as e:
        return JsonResponse(
            {'error': f'Failed to create task: {str(e)}'},
            status=500
        )


@api_view(['GET', 'POST'])
def get_tasks(request):
    """Get all tasks for a specific doctor and optional date using GET or POST method"""
    try:
        doctor_id = None
        task_date = None

        if request.method == 'GET':
            doctor_id = request.GET.get('doctor_id')
            task_date = request.GET.get('task_date')
        else:
            if request.body:
                data = json.loads(request.body)
                doctor_id = data.get('doctor_id')
                task_date = data.get('task_date')

        print(f"🔍 Fetching tasks for Doctor ID: {doctor_id} on Date: {task_date}")

        if not doctor_id:
            return JsonResponse({'error': 'Doctor ID is required'}, status=400)

        # Query tasks from database
        query_filters = {'doctor_id': doctor_id}
        if task_date:
            query_filters['task_date'] = task_date

        tasks = Task.objects.filter(**query_filters).values(
            'task_id',
            'doctor_id',
            'task_date',
            'task_title',
            'task_description',
            'task_type',
            'start_time',
            'end_time',
            'priority',
            'is_completed'
        ).order_by('task_date', 'start_time')

        print(f"✅ Found {len(tasks)} tasks")

        return JsonResponse({
            'success': True,
            'status': 'success',
            'tasks': list(tasks),
            'count': len(tasks)
        }, status=200)

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)

    except Exception as e:
        print(f"❌ Error fetching tasks: {str(e)}")
        return JsonResponse(
            {'error': f'Failed to fetch tasks: {str(e)}'},
            status=500
        )

@api_view(['GET'])
def health_check(request):
    """Report the result of a real, read-only database query."""
    database = {'backend': connection.vendor, 'status': 'connected'}
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except DatabaseError as error:
        message = database_error_message(error)
        logger.error('Database health check failed (%s): %s', connection.vendor, message)
        database.update(status='unavailable', message=message)
        return Response({'status': 'unhealthy', 'database': database}, status=503)

    return Response({'status': 'healthy', 'database': database})

@api_view(['DELETE'])
def delete_task(request, task_id):
    """Delete a task by ID"""
    try:
        print(f"🗑️ Attempting to delete task ID: {task_id}")
        
        # Check if task exists
        try:
            task = Task.objects.get(task_id=task_id)
        except Task.DoesNotExist:
            print(f"❌ Task {task_id} not found")
            return JsonResponse({
                'success': False,
                'error': 'Task not found'
            }, status=404)
        
        # Store task info for logging
        task_title = task.task_title
        task_date = task.task_date
        
        # Delete the task
        task.delete()
        
        print(f"✅ Task {task_id} deleted successfully: '{task_title}' on {task_date}")
        
        return JsonResponse({
            'success': True,
            'message': 'Task deleted successfully',
            'deleted_task': {
                'task_id': task_id,
                'task_title': task_title,
                'task_date': str(task_date)
            }
        }, status=200)
    except Exception as e:
        print(f"❌ Error deleting task {task_id}: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f'Failed to delete task: {str(e)}'
        }, status=500)
