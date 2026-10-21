"""
Django settings for medicare_project project.
"""

from pathlib import Path
from decouple import Config, RepositoryEmpty, RepositoryEnv
import socket
from medicare_project.database import build_database_config

# -----------------------------------------
# BASE DIRECTORY
# -----------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent

# Load this backend's .env explicitly; operating-system variables take priority.
ENV_FILE = BASE_DIR / '.env'
config = Config(RepositoryEnv(str(ENV_FILE)) if ENV_FILE.is_file() else RepositoryEmpty())

# -----------------------------------------
# SECURITY
# -----------------------------------------
SECRET_KEY = 'django-insecure-o(j5nzv3qn3cqu-*lgjl4og(5q4i)a*j_yr6rxk0z_&-3e*gpx'
DEBUG = True
ALLOWED_HOSTS = ['*', 'localhost', '127.0.0.1']

# -----------------------------------------
# APPLICATIONS
# -----------------------------------------
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'accounts',
    'taskcreate',
    'prescription_context',
    'prescription_review',
    'medicine_knowledge',
    'prescription_drafts',
]

# Custom User Model
AUTH_USER_MODEL = 'accounts.User'

# -----------------------------------------
# MIDDLEWARE
# -----------------------------------------
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'medicare_project.database_availability.DatabaseAvailabilityMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# -----------------------------------------
# URL & WSGI CONFIGURATION
# -----------------------------------------
ROOT_URLCONF = 'medicare_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'medicare_project.wsgi.application'

# -----------------------------------------
# DATABASE CONFIGURATION
# -----------------------------------------
try:
    DATABASES = {'default': build_database_config(config, BASE_DIR)}
except Exception:
    def is_supabase_reachable():
        try:
            s = socket.create_connection(('db.wixgbvdcwteghicynwvz.supabase.co', 5432), timeout=2)
            s.close()
            return True
        except Exception:
            return False

    if is_supabase_reachable():
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.postgresql',
                'NAME': 'postgres',
                'USER': 'postgres',
                'PASSWORD': config('SUPABASE_DB_PASSWORD', default='Ddugiborn@2001'),
                'HOST': 'db.wixgbvdcwteghicynwvz.supabase.co',
                'PORT': '5432',
                'OPTIONS': {
                    'sslmode': 'require',
                },
            }
        }
        print("[INFO] Connected to Supabase PostgreSQL Database!")
    else:
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.sqlite3',
                'NAME': BASE_DIR / 'db.sqlite3',
            }
        }
        print("[INFO] Offline/Fallback mode: Falling back to local SQLite Database!")

# -----------------------------------------
# PASSWORD VALIDATION
# -----------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# -----------------------------------------
# INTERNATIONALIZATION
# -----------------------------------------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# -----------------------------------------
# STATIC FILES
# -----------------------------------------
STATIC_URL = 'static/'

# -----------------------------------------
# DEFAULT AUTO FIELD
# -----------------------------------------
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# -----------------------------------------
# REST FRAMEWORK CONFIG
# -----------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [],
    'UNAUTHENTICATED_USER': None,
    'UNAUTHENTICATED_TOKEN': None,
}

# -----------------------------------------
# CORS SETTINGS
# -----------------------------------------
CORS_ALLOW_ALL_ORIGINS = True
LOCAL_DEV_PORTS = range(3000, 3010)
LOCAL_DEV_ORIGINS = [
    f"http://{host}:{port}"
    for host in ("localhost", "127.0.0.1")
    for port in LOCAL_DEV_PORTS
]

CORS_ALLOWED_ORIGINS = [
    *LOCAL_DEV_ORIGINS,
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:8082",
    "http://127.0.0.1:8082",
    "https://yuemlsjtzdpgclgnlogg.supabase.co",
]

CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
]

CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = [
    *LOCAL_DEV_ORIGINS,
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:8082",
    "http://127.0.0.1:8082",
    "https://yuemlsjtzdpgclgnlogg.supabase.co",
]
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'

# Component 1 worker receiver. Keep its key in backend/.env, never in the frontend.
# An existing active approved admin account can be the service identity; no staff
# privileges are needed. Empty defaults leave server-to-server ingestion disabled.
COMPONENT1_API_KEY = config('COMPONENT1_API_KEY', default='')
COMPONENT1_SERVICE_USER_ID = config('COMPONENT1_SERVICE_USER_ID', default=0, cast=int)

# Optional read-only demonstration of frozen synthetic research fixtures.
# Never enables real-patient model inputs, training, reviews or publication.
PRESCRIPTION_EXPERIMENTAL_ML_ENABLED = config('PRESCRIPTION_EXPERIMENTAL_ML_ENABLED', default=False, cast=bool)

