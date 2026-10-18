"""Import additional source-backed scopes without changing pilot review bindings."""

from copy import deepcopy
import inspect

from django.db import transaction
from prescription_research import dataset as ds
from prescription_research.expansion import check, knowledge, screening
from .models import ConditionKnowledge, content_digest

RULE_FILES = (
    'backend/prescription_research/expansion/screening.py',
    'backend/prescription_research/expansion/knowledge.py',
    'backend/prescription_research/expansion/case.schema.json',
    'backend/prescription_drafts/engine.py',
)


def rule_bindings():
    return {name: ds.file_hash(ds.ROOT / name) for name in RULE_FILES}


def definitions():
    # Read/verify the existing frozen bundle, never regenerate it or fit a model.
    manifest = ds.read_json(check.DEFAULT_OUTPUT / 'manifest.json')
    for path, digest in manifest['inputs'].items():
        ds.require(ds.file_hash(ds.ROOT / path) == digest, 'Frozen knowledge source changed.')
    for path, digest in manifest['outputs'].items():
        ds.require(ds.file_hash(check.DEFAULT_OUTPUT / path) == digest, 'Frozen knowledge artifact changed.')
    bundle = ds.read_json(check.DEFAULT_OUTPUT / 'bundle.json')
    products = {row['id']: row for row in bundle['catalogue']}
    legacy = ds.read_json(ds.BACKEND / 'prescription_drafts/data/safety_profiles.json')
    result = []
    for policy in bundle['purpose_policies']:
        if policy['condition'] in ('influenza', 'chickenpox'):
            continue
        product = deepcopy(products.get(policy['candidate_id']))
        if product:
            product['uses'] = [row for row in product['uses'] if row['condition'] == policy['condition']]
            references = set(policy['source_ids']) | {product['standard_concept']['source_id']}
            for row in product['aliases']:
                references.add(row['source_id'])
            for row in product['uses'] + product['warnings']:
                references.update(row['source_ids'])
            product['sources'] = [row for row in product['sources'] if row['id'] in references]
            content = {'condition': policy['condition'], 'product': product, 'identity_status': 'source_reference_product',
                       'purpose': policy['purpose'], 'knowledge_version': bundle['knowledge_version']}
        else:
            unresolved = deepcopy(bundle['unresolved_products'][0])
            content = {'condition': policy['condition'], 'product': None, 'identity_status': 'unresolved',
                'purpose': policy['purpose'], 'knowledge_version': bundle['knowledge_version'], 'unresolved_product': unresolved}
        reference = deepcopy(legacy.get(policy['candidate_id']))
        if reference:
            reference['parameters']['relevant_symptoms'] = policy['target_symptoms']
            reference['parameters']['minimum_age_years'] = 18
            if policy['condition'] == 'mumps':
                reference['parameters']['symptom_review_days']['jaw_pain'] = reference['parameters']['symptom_review_days']['body_aches']
        rules = {'policy': deepcopy(policy), 'reference_profile': reference,
            'implementation_bindings': rule_bindings(), 'implementation_source': inspect.getsource(screening),
            'scope': 'Source-based adult research rules only; this review does not enable live screening or provide clinical validation.',
            'live_screening_enabled': False, 'prescription_eligible': False}
        from .additional_candidates import clinical_bindings, VERSION
        from prescription_context.history_identity import review_policy
        rules.update(clinical_implementation_bindings=clinical_bindings(), patient_screening_version=VERSION,
            history_identity_policy=review_policy(),
            patient_screening_supported=product is not None,
            implementation_source=rules['implementation_source'] + '\n# Patient screening adapter\n' + (ds.BACKEND / 'medicine_knowledge/screening_engine.py').read_text(encoding='utf-8'))
        result.append({'id': policy['id'], 'medicine_id': policy['candidate_id'], 'condition': policy['condition'],
                       'content': content, 'rules': rules, 'content_hash': content_digest(content), 'rules_hash': content_digest(rules)})
    ds.require(len(result) == 4, 'Expected four additional condition scopes.')
    return result


@transaction.atomic
def seed_condition_knowledge():
    counts = {'created': 0, 'updated': 0, 'unchanged': 0}
    for definition in definitions():
        row = ConditionKnowledge.objects.select_for_update().filter(pk=definition['id']).first()
        if row and all(getattr(row, key) == value for key, value in definition.items()):
            counts['unchanged'] += 1
            continue
        if row:
            for key, value in definition.items():
                setattr(row, key, value)
            row.save()  # Old audit decisions remain, currentness is version-bound.
            counts['updated'] += 1
        else:
            ConditionKnowledge.objects.create(**definition)
            counts['created'] += 1
    return counts
