"""Reference/coverage-gap acknowledgement is separate from executable review."""


def reference_only_scope(row):
    if row.pk == 'gi-dioralyte-natural-gsl':
        from .ors_reference import implementation_binding
        if row.rules.get('ors_implementation') != implementation_binding():
            return True
    return (not row.content.get('product')
        or row.content.get('identity_status') in ('unresolved', 'reference_incomplete')
        or row.rules.get('policy', {}).get('handler') in ('catalogue_only', 'unresolved_ors')
        or row.rules.get('patient_screening_supported') is not True)
