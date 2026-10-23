"""
Django settings for medicare_project project.
"""

import os
from pathlib import Path
from decouple import config
import socket

# -----------------------------------------
# BASE DIRECTORY
# -----------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / '.env'
if ENV_FILE.exists():
    from decouple import RepositoryEnv, Config
    env_config = Config(RepositoryEnv(str(ENV_FILE)))
else:
    env_config = config

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
    'labreports',
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

# Set USE_LOCAL_DB=True in .env (or as an env var) to use SQLite instead of Supabase.
# Useful when there is no internet connection / Supabase is unreachable.
_use_local_db = os.environ.get('USE_LOCAL_DB', env_config('USE_LOCAL_DB', default='False')).strip().lower() in ('true', '1', 'yes')

if _use_local_db:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': env_config('SUPABASE_DB_NAME', default='postgres'),
            'USER': env_config('SUPABASE_DB_USER', default='postgres.wixgbvdcwteghicynwvz'),
            'PASSWORD': env_config('SUPABASE_DB_PASSWORD', default='Ddugiborn@2001'),
            'HOST': env_config('SUPABASE_DB_HOST', default='aws-1-ap-southeast-2.pooler.supabase.com'),
            'PORT': env_config('SUPABASE_DB_PORT', default='6543'),
            'CONN_MAX_AGE': 0,
            'OPTIONS': {
                'sslmode': 'require',
            },
        }
    }

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
TIME_ZONE = 'Asia/Colombo'
USE_I18N = True
USE_TZ = True

# -----------------------------------------
# STATIC FILES
# -----------------------------------------
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

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
# CORS & CSRF SETTINGS
# -----------------------------------------
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

CORS_ALLOW_CREDENTIALS = True