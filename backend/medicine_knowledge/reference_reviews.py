"""Reference/coverage-gap acknowledgement is separate from executable review."""


def reference_only_scope(row):
    return (not row.content.get('product')
        or row.content.get('identity_status') in ('unresolved', 'reference_incomplete')
        or row.rules.get('policy', {}).get('handler') in ('catalogue_only', 'unresolved_ors')
        or row.rules.get('patient_screening_supported') is not True)
