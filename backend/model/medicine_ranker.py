import os
import json
import joblib
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "medicine_ranking_model.joblib")
JSON_PATH = os.path.join(BASE_DIR, "ranked_medicines_data.json")

_MODEL = None
_CATALOGUE = None

def get_model_and_catalogue():
    global _MODEL, _CATALOGUE
    if _CATALOGUE is None:
        if os.path.exists(JSON_PATH):
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                _CATALOGUE = json.load(f)
        else:
            _CATALOGUE = {}
    if _MODEL is None and os.path.exists(MODEL_PATH):
        try:
            _MODEL = joblib.load(MODEL_PATH)
        except Exception:
            _MODEL = None
    return _MODEL, _CATALOGUE


def normalize_condition_key(name_or_code):
    norm = str(name_or_code or "").lower().strip()
    if "flu" in norm or "influenza" in norm:
        return "influenza"
    if "chicken" in norm or "varicella" in norm or "zoster" in norm:
        return "chickenpox"
    if "measle" in norm or "rubeola" in norm:
        return "measles"
    if "mump" in norm or "parotit" in norm:
        return "mumps"
    if "conjunctiv" in norm or "eye" in norm or "pink" in norm:
        return "viral_conjunctivitis"
    if "gastro" in norm or "diarrh" in norm or "stomach" in norm or "vomit" in norm:
        return "viral_gastroenteritis"
    return "influenza"


# Common cross-allergen and brand-generic equivalency map
ALLERGY_SYNONYMS = {
    "paracetamol": ["paracetamol", "acetaminophen", "panadol", "tylenol", "calpol", "febrex"],
    "acetaminophen": ["paracetamol", "acetaminophen", "panadol", "tylenol", "calpol"],
    "panadol": ["paracetamol", "acetaminophen", "panadol", "tylenol"],
    "aspirin": ["aspirin", "acetylsalicylic acid", "nsaid", "nsaids", "disprin", "ecotrin"],
    "ibuprofen": ["ibuprofen", "nsaid", "nsaids", "brufen", "advil", "motrin", "nurofen"],
    "nsaid": ["aspirin", "ibuprofen", "diclofenac", "naproxen", "mefenamic", "nsaid", "nsaids", "ketoprofen", "meloxicam"],
    "nsaids": ["aspirin", "ibuprofen", "diclofenac", "naproxen", "mefenamic", "nsaid", "nsaids", "ketoprofen", "meloxicam"],
    "penicillin": ["penicillin", "amoxicillin", "ampicillin", "augmentin", "amoxil", "clavamox"],
    "amoxicillin": ["penicillin", "amoxicillin", "ampicillin", "augmentin", "amoxil"],
    "sulfa": ["sulfa", "sulfonamide", "bactrim", "septra", "cotrimoxazole", "co-trimoxazole"],
    "oseltamivir": ["oseltamivir", "tamiflu"],
    "acyclovir": ["acyclovir", "aciclovir", "zovirax", "valacyclovir"],
    "cetirizine": ["cetirizine", "zyrtec", "antihistamine", "histacin"],
    "dextromethorphan": ["dextromethorphan", "dxm", "cough suppressant", "benylin", "robitussin"]
}


def is_patient_allergic_to_drug(med_name, allergies_list):
    """
    Checks if a medicine name matches any documented allergy or known brand/class synonym.
    Supports complex strings like 'Paracetamol (Severe Hives)' or 'Allergic to NSAIDs'.
    """
    if not allergies_list:
        return False, None

    med_lower = med_name.lower()
    # Extract letters-only tokens from medicine name
    import re
    med_tokens = set(re.findall(r"[a-z]{3,}", med_lower))

    # Expand med_tokens with known synonyms
    expanded_med_terms = set(med_tokens)
    for token in med_tokens:
        if token in ALLERGY_SYNONYMS:
            expanded_med_terms.update(ALLERGY_SYNONYMS[token])

    for raw_al in allergies_list:
        if not raw_al:
            continue
        al_str = str(raw_al).lower()
        al_tokens = set(re.findall(r"[a-z]{3,}", al_str))

        # Direct token overlap
        overlap = med_tokens.intersection(al_tokens)
        if overlap:
            return True, f"Direct allergy match on: {', '.join(overlap).title()}"

        # Synonym / class overlap
        expanded_overlap = expanded_med_terms.intersection(al_tokens)
        if expanded_overlap:
            return True, f"Cross-reactivity/Class match: '{', '.join(expanded_overlap).title()}' in patient allergy profile"

        # Substring checks for compound names
        for token in med_tokens:
            if token in al_str:
                return True, f"Allergy match on: {token.title()}"
        for syn_token in expanded_med_terms:
            if syn_token in al_str:
                return True, f"Class/Synonym match: {syn_token.title()}"

    return False, None


def rank_medicines_for_patient(condition, age=30, severity="moderate", allergies=None, red_flags=None):
    """
    Returns AI-ranked candidate medicines for one of the 6 target diseases.
    Filters out allergic drugs and contraindications, returning safe alternatives.
    """
    model, catalogue = get_model_and_catalogue()
    cond_key = normalize_condition_key(condition)
    
    cond_data = catalogue.get(cond_key)
    if not cond_data:
        cond_data = catalogue.get("influenza", {"display_name": "Influenza", "medicines": []})
        cond_key = "influenza"

    raw_allergies = allergies or []
    red_flags_str = " ".join([str(r).lower() for r in (red_flags or [])])

    cond_keys_list = ["influenza", "chickenpox", "measles", "mumps", "viral_conjunctivitis", "viral_gastroenteritis"]
    cond_idx = cond_keys_list.index(cond_key) if cond_key in cond_keys_list else 0

    sev_num = 3 if "severe" in str(severity).lower() else (1 if "mild" in str(severity).lower() else 2)
    has_fever = 1 if cond_key in ["influenza", "chickenpox", "measles", "mumps"] else 0
    has_rash = 1 if cond_key in ["chickenpox", "measles"] else 0
    has_eye = 1 if cond_key == "viral_conjunctivitis" else 0
    has_gi = 1 if cond_key == "viral_gastroenteritis" else 0

    candidates = cond_data.get("medicines", [])
    ranked_results = []
    excluded_medicines = []

    for idx, med in enumerate(candidates):
        med_name = med["name"]
        med_name_lower = med_name.lower()

        # 1. Check allergy safety contraindication
        is_allergic, match_reason = is_patient_allergic_to_drug(med_name, raw_allergies)
        if is_allergic:
            excluded_medicines.append({
                "name": med_name,
                "reason": match_reason or "Documented allergy in patient history",
                "type": "allergy",
                "action": "Excluded to prevent adverse allergic reaction. Safe alternatives ranked instead."
            })
            continue

        # 2. Red flags contraindications
        # e.g. "avoid aspirin" in red flags or chickenpox
        if "aspirin" in red_flags_str and "aspirin" in med_name_lower:
            excluded_medicines.append({
                "name": med_name,
                "reason": "Red flag contraindication: Avoid Aspirin",
                "type": "contraindication",
                "action": "Excluded due to documented patient red flags."
            })
            continue
            
        if cond_key == "chickenpox" and ("ibuprofen" in med_name_lower or "aspirin" in med_name_lower):
            excluded_medicines.append({
                "name": med_name,
                "reason": "Clinical safety guideline: NSAIDs/Aspirin contraindicated in Chickenpox (Reye's syndrome & skin superinfection risk)",
                "type": "contraindication",
                "action": "Excluded by WHO/CDC varicella safety protocol."
            })
            continue

        # 3. Calculate ML predicted suitability score
        base_match = med.get("match_score", 90)
        if model is not None:
            try:
                import pandas as pd
                cols = ["condition_idx", "drug_idx", "age", "severity", "has_fever", "has_rash", "has_eye", "has_gi"]
                features_df = pd.DataFrame([[cond_idx, idx, age, sev_num, has_fever, has_rash, has_eye, has_gi]], columns=cols)
                pred_val = model.predict(features_df)[0]
                computed_score = int(round(float(pred_val) * 100))
            except Exception:
                computed_score = base_match
        else:
            computed_score = base_match

        ranked_results.append({
            "id": f"rank-{cond_key}-{idx+1}",
            "name": med["name"],
            "dosage": med.get("dosage", "Standard formulation"),
            "frequency": med.get("frequency", "As directed"),
            "duration": med.get("duration", "3 - 5 Days"),
            "instructions": med.get("instructions", "Take as directed with water."),
            "clinical_role": med.get("clinical_role", "Therapeutic treatment"),
            "rationale": med.get("rationale", ""),
            "match_score": max(50, min(99, computed_score)),
            "real_world_rating": med.get("real_world_rating", 8.5),
            "review_count": med.get("review_count", 50),
            "useful_count": med.get("useful_count", 100)
        })

    # Sort descending by match_score
    ranked_results.sort(key=lambda m: (m["match_score"], m["real_world_rating"]), reverse=True)

    # Assign rank number (1, 2, 3...)
    for rank_idx, item in enumerate(ranked_results):
        item["rank"] = rank_idx + 1

    return {
        "status": "success",
        "condition": cond_data.get("display_name", condition),
        "condition_code": cond_key,
        "total_ranked": len(ranked_results),
        "ranked_medicines": ranked_results,
        "excluded_medicines": excluded_medicines
    }

