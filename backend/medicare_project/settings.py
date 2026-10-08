"""
Django settings for medicare_project project.
"""

from pathlib import Path
from decouple import config

# -----------------------------------------
# BASE DIRECTORY
# -----------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent

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
USE_SUPABASE = config('USE_SUPABASE', default=False, cast=bool)

if USE_SUPABASE:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': config('SUPABASE_DB_NAME', default='postgres'),
            'USER': config('SUPABASE_DB_USER', default='postgres'),
            'PASSWORD': config('SUPABASE_DB_PASSWORD', default=''),
            'HOST': config(
                'SUPABASE_DB_HOST',
                default='db.wixgbvdcwteghicynwvz.supabase.co',
            ),
            'PORT': config('SUPABASE_DB_PORT', default='5432'),
            'OPTIONS': {
                'sslmode': 'require',
            },
        }
    }
    print("[INFO] Supabase PostgreSQL database selected.")
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
    print("[INFO] Local SQLite database selected.")

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
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://yuemlsjtzdpgclgnlogg.supabase.co",
]

CORS_ALLOW_CREDENTIALS = True
