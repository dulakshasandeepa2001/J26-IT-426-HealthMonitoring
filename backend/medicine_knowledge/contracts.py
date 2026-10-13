from urllib.parse import urlsplit

from rest_framework import serializers
from prescription_context.analysis_contract import StrictSerializer


class SourceSerializer(StrictSerializer):
    id = serializers.SlugField(max_length=100)
    title = serializers.CharField(max_length=250)
    publisher = serializers.CharField(max_length=100)
    url = serializers.URLField(max_length=500)
    published_date = serializers.DateField(allow_null=True)
    accessed_date = serializers.DateField()
    sections = serializers.ListField(child=serializers.CharField(max_length=100), min_length=1, max_length=15)

    def validate_url(self, value):
        url = urlsplit(value)
        if url.scheme != 'https' or url.hostname not in ('dailymed.nlm.nih.gov', 'www.cdc.gov', 'www.fda.gov') or url.username or url.password:
            raise serializers.ValidationError('Use an HTTPS reference to an approved primary source.')
        return value


class IngredientSerializer(StrictSerializer):
    name = serializers.CharField(max_length=100)
    strength = serializers.CharField(max_length=100)


class AliasSerializer(StrictSerializer):
    name = serializers.CharField(max_length=200)
    level = serializers.ChoiceField(choices=('ingredient', 'product'))
    source_id = serializers.SlugField(max_length=100)


class ConceptSerializer(StrictSerializer):
    rxcui = serializers.RegexField(r'^\d+$', max_length=20)
    name = serializers.CharField(max_length=200)
    term_type = serializers.ChoiceField(choices=('SCD',))
    source_id = serializers.SlugField(max_length=100)


class UseSerializer(StrictSerializer):
    condition = serializers.ChoiceField(choices=('influenza', 'chickenpox'))
    purpose = serializers.ChoiceField(choices=('antiviral', 'symptom_relief'))
    basis = serializers.ChoiceField(choices=('label', 'guidance', 'symptom_mapping'))
    summary = serializers.CharField(max_length=700)
    scope = serializers.CharField(max_length=700)
    source_ids = serializers.ListField(child=serializers.SlugField(max_length=100), min_length=1, max_length=5)


class WarningSerializer(StrictSerializer):
    category = serializers.ChoiceField(choices=('contraindication', 'precaution', 'interaction'))
    summary = serializers.CharField(max_length=700)
    source_ids = serializers.ListField(child=serializers.SlugField(max_length=100), min_length=1, max_length=5)


class EntryContentSerializer(StrictSerializer):
    schema_version = serializers.ChoiceField(choices=('1.0',))
    catalogue_version = serializers.CharField(max_length=100)
    id = serializers.SlugField(max_length=100)
    generic_name = serializers.CharField(max_length=200)
    form = serializers.ChoiceField(choices=('tablet', 'capsule', 'lotion'))
    route = serializers.ChoiceField(choices=('oral', 'topical'))
    strength = serializers.CharField(max_length=100)
    ingredients = IngredientSerializer(many=True, min_length=1, max_length=10)
    aliases = AliasSerializer(many=True, min_length=1, max_length=30)
    standard_concept = ConceptSerializer()
    uses = UseSerializer(many=True, min_length=1, max_length=2)
    warnings = WarningSerializer(many=True, min_length=1, max_length=20)
    sources = SourceSerializer(many=True, min_length=1, max_length=10)

    def validate(self, data):
        source_ids = [source['id'] for source in data['sources']]
        if len(source_ids) != len(set(source_ids)):
            raise serializers.ValidationError('Evidence source IDs must be unique.')
        refs = [data['standard_concept']['source_id']] + [alias['source_id'] for alias in data['aliases']]
        for item in data['uses'] + data['warnings']:
            refs.extend(item['source_ids'])
        if set(refs) - set(source_ids):
            raise serializers.ValidationError('Every statement and alias must reference a listed source.')
        aliases = [normalize_name(alias['name']) for alias in data['aliases']]
        if len(aliases) != len(set(aliases)):
            raise serializers.ValidationError('Alias names must be unique within an entry.')
        return data


def normalize_name(name):
    # No substring, spelling correction, strength stripping or brand inference.
    return ' '.join(name.casefold().split())


class ReviewRequestSerializer(StrictSerializer):
    decision = serializers.ChoiceField(choices=('reviewed', 'rejected', 'pending'))
    notes = serializers.CharField(min_length=10, max_length=2000)
    evidence_checked = serializers.BooleanField()
    expected_content_hash = serializers.RegexField(r'^[a-f0-9]{64}$')
    expected_updated_at = serializers.DateTimeField()

    def validate(self, data):
        if data['decision'] == 'reviewed' and not data['evidence_checked']:
            raise serializers.ValidationError({'evidence_checked': 'Review the listed evidence and scope before accepting this content.'})
        return data


class NormalizeRequestSerializer(StrictSerializer):
    names = serializers.ListField(child=serializers.CharField(max_length=200), min_length=1, max_length=50)
