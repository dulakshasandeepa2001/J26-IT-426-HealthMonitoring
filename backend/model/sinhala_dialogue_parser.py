# Re-export all functions from sinhala_dialogue_praser for correct spelling imports
from .sinhala_dialogue_praser import (
    tokenize_sinhala_sentence,
    classify_speaker,
    is_pure_denial,
    is_affirmed,
    check_symptom_negated,
    extract_duration,
    find_symptoms_in_text,
    parse_clinical_dialogue,
    COMMON_SINHALA_SYMPTOMS
)

if __name__ == "__main__":
    from .sinhala_dialogue_praser import sample_talk
    print("Testing sinhala_dialogue_parser...")
    result = parse_clinical_dialogue(sample_talk)
    print("Positive:", result["positive_symptoms"])
    print("Negated:", result["negated_symptoms"])
    print("Duration:", result["duration"])
