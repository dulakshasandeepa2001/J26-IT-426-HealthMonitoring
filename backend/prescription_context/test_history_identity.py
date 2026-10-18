"""Identity resolution must not turn unknowns into clearance."""
from copy import deepcopy
from django.test import SimpleTestCase
from .history_identity import VERSION, product_hash, resolved_allergies, resolve_medicines


class HistoryIdentityTests(SimpleTestCase):
    def context(self):
        return {'allergy_status': 'confirmed', 'allergies': ['Penicillin (Rash)'], 'medicine_status': 'confirmed', 'current_medicines': ['Paracetamol 500mg SOS'],
            'provenance': {'history_identity': {'version': VERSION, 'reviewed_by': 1, 'reviewed_at': '2026-10-17T01:00:00Z', 'details': {
                'allergies': [{'recorded_text': 'Penicillin (Rash)', 'identity': 'penicillin'}],
                'medicines': [{'recorded_text': 'Paracetamol 500mg SOS', 'catalogue_id': 'para', 'expected_identity_hash': ''}]}}}}

    def test_unbound_unknown_and_unsupported_allergies_stay_unresolved(self):
        context = self.context()
        self.assertEqual(resolved_allergies(context), ['penicillin'])
        context['provenance']['history_identity']['details']['allergies'][0]['identity'] = 'unrecognized substance'
        self.assertEqual(resolved_allergies(context), [None])
        context['allergies'] = ['New allergy']
        self.assertIsNone(resolved_allergies(context))
        context = self.context(); context['provenance']['history_identity'].pop('reviewed_by')
        self.assertIsNone(resolved_allergies(context))

    def test_product_change_or_missing_selection_cannot_reuse_clearance(self):
        context = self.context()
        product = {'id': 'para', 'ingredients': [{'name': 'acetaminophen'}], 'strength': '500 mg'}
        row = context['provenance']['history_identity']['details']['medicines'][0]
        row['expected_identity_hash'] = product_hash(product)
        fallback = [{'input': context['current_medicines'][0], 'status': 'unrecognized', 'matches': []}]
        result = resolve_medicines(context, {'para': product}, fallback)
        self.assertEqual(result[0]['matches'][0]['ingredients'], ['acetaminophen'])
        changed = deepcopy(product); changed['strength'] = '650 mg'
        self.assertEqual(resolve_medicines(context, {'para': changed}, fallback)[0]['status'], 'unrecognized')
        row['catalogue_id'] = ''
        recognized = [{'input': 'x', 'status': 'recognized', 'matches': [{'entry_id': 'para'}]}]
        self.assertEqual(resolve_medicines(context, {'para': product}, recognized)[0]['status'], 'unrecognized')
