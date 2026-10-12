"""Isolated test database. Never connects to Supabase or the local db.sqlite3."""

import os

os.environ['DATABASE_BACKEND'] = 'sqlite'

from .settings import *  # noqa: E402,F403

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
