"""Bound database waits without changing clinical rules or review bindings."""
from contextlib import contextmanager

from django.db import OperationalError, connection, transaction
from rest_framework.exceptions import APIException


class ScreeningUnavailable(APIException):
    status_code = 503
    default_code = 'screening_temporarily_unavailable'
    wait = 3


@contextmanager
def screening_database_operation():
    # The existing service still locks and rechecks all decision inputs. Keep
    # these limits transaction-local so other requests retain their settings.
    try:
        with transaction.atomic():
            if connection.vendor == 'postgresql':
                with connection.cursor() as cursor:
                    cursor.execute("SELECT set_config('lock_timeout', %s, true)", ['3s'])
                    cursor.execute("SELECT set_config('statement_timeout', %s, true)", ['20s'])
                    # A dropped pooled client must not leave screening row
                    # locks behind indefinitely after its last read query.
                    cursor.execute("SELECT set_config('idle_in_transaction_session_timeout', %s, true)", ['30s'])
            yield
    except OperationalError as error:
        cause = error.__cause__ or error
        if getattr(cause, 'pgcode', None) in {'55P03', '57014'}:
            message = 'Screening is temporarily busy with another database operation. Wait a few seconds and try again. No new screening result was confirmed.'
        else:
            message = 'The screening database connection is temporarily unavailable. Try again shortly. No new screening result was confirmed.'
        # Raise only after the transaction has rolled back. Never return partial
        # candidates or leak database connection details into the interface.
        raise ScreeningUnavailable(message) from error
