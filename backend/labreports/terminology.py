"""
LOINC-Oriented Terminology Normalization & Deterministic Reference-Range Engine.
In accordance with Proposal Section 3.7 & Appendix B Table 15:
- Supported observations are normalized to a controlled dictionary with LOINC codes.
- Reference ranges are deterministic and versioned.
- Abnormal, Low, High, Critical flags are evaluated explicitly.
"""

from typing import Dict, Any, Optional, Tuple
import re

VERSION = "v1.0.0-rules-2026"

# Controlled LOINC Dictionary with canonical aliases and default reference ranges
LOINC_DICTIONARY: Dict[str, Dict[str, Any]] = {
    "718-7": {
        "standard_name": "Hemoglobin [Mass/volume] in Blood",
        "aliases": ["hemoglobin", "haemoglobin", "hgb", "hb"],
        "unit": "g/dL",
        "ref_min": 12.0,
        "ref_max": 17.5,
        "critical_min": 7.0,
        "critical_max": 20.0,
        "category": "hematology",
    },
    "6690-2": {
        "standard_name": "Leukocytes [#/volume] in Blood (WBC)",
        "aliases": ["wbc", "white blood cells", "total wbc", "leukocyte count", "white cell count"],
        "unit": "10^3/uL",
        "ref_min": 4.0,
        "ref_max": 11.0,
        "critical_min": 2.0,
        "critical_max": 30.0,
        "category": "hematology",
    },
    "777-3": {
        "standard_name": "Platelets [#/volume] in Blood",
        "aliases": ["platelets", "platelet count", "plt"],
        "unit": "10^3/uL",
        "ref_min": 150.0,
        "ref_max": 450.0,
        "critical_min": 50.0,
        "critical_max": 1000.0,
        "category": "hematology",
    },
    "789-8": {
        "standard_name": "Erythrocytes [#/volume] in Blood (RBC)",
        "aliases": ["rbc", "red blood cells", "erythrocyte count"],
        "unit": "10^6/uL",
        "ref_min": 4.2,
        "ref_max": 5.9,
        "critical_min": 2.5,
        "critical_max": 7.5,
        "category": "hematology",
    },
    "4544-3": {
        "standard_name": "Hematocrit [Volume Fraction] of Blood (PCV)",
        "aliases": ["hematocrit", "haematocrit", "pcv", "packed cell volume", "hct"],
        "unit": "%",
        "ref_min": 36.0,
        "ref_max": 50.0,
        "critical_min": 20.0,
        "critical_max": 60.0,
        "category": "hematology",
    },
    "751-8": {
        "standard_name": "Neutrophils/100 leukocytes in Blood",
        "aliases": ["neutrophils", "polymorphs", "neutrophil percentage"],
        "unit": "%",
        "ref_min": 40.0,
        "ref_max": 75.0,
        "category": "differential",
    },
    "731-0": {
        "standard_name": "Lymphocytes/100 leukocytes in Blood",
        "aliases": ["lymphocytes", "lymphocyte percentage"],
        "unit": "%",
        "ref_min": 20.0,
        "ref_max": 45.0,
        "category": "differential",
    },
    "1988-5": {
        "standard_name": "C reactive protein [Mass/volume] in Serum or Plasma",
        "aliases": ["crp", "c-reactive protein", "c reactive protein"],
        "unit": "mg/L",
        "ref_min": 0.0,
        "ref_max": 5.0,
        "critical_max": 50.0,
        "category": "biochemistry",
    },
    "44558-5": {
        "standard_name": "Influenza virus A RNA/Antigen [Presence]",
        "aliases": ["influenza a", "flu a", "influenza a pcr", "influenza a antigen"],
        "unit": "",
        "expected_value": "Negative",
        "is_qualitative": True,
        "category": "virology",
        "condition": "influenza",
    },
    "44567-6": {
        "standard_name": "Influenza virus B RNA/Antigen [Presence]",
        "aliases": ["influenza b", "flu b", "influenza b pcr", "influenza b antigen"],
        "unit": "",
        "expected_value": "Negative",
        "is_qualitative": True,
        "category": "virology",
        "condition": "influenza",
    },
    "22596-1": {
        "standard_name": "Varicella zoster virus IgM Ab [Presence] in Serum",
        "aliases": ["varicella zoster igm", "chickenpox igm", "vzv igm"],
        "unit": "",
        "expected_value": "Negative",
        "is_qualitative": True,
        "category": "virology",
        "condition": "chickenpox",
    },
    "51655-9": {
        "standard_name": "Dengue virus NS1 Ag [Presence] in Serum",
        "aliases": ["dengue ns1", "dengue ns1 antigen", "dengue virus ns1"],
        "unit": "",
        "expected_value": "Negative",
        "is_qualitative": True,
        "category": "virology",
        "condition": "dengue",
    },
    "1558-6": {
        "standard_name": "Fasting Glucose [Mass/volume] in Blood",
        "aliases": ["fasting blood sugar", "fbs", "fasting glucose", "blood sugar"],
        "unit": "mg/dL",
        "ref_min": 70.0,
        "ref_max": 99.0,
        "critical_min": 50.0,
        "critical_max": 350.0,
        "category": "biochemistry",
    },
    "2160-0": {
        "standard_name": "Creatinine [Mass/volume] in Serum or Plasma",
        "aliases": ["serum creatinine", "creatinine"],
        "unit": "mg/dL",
        "ref_min": 0.6,
        "ref_max": 1.3,
        "critical_max": 4.0,
        "category": "biochemistry",
    },
    "2093-3": {
        "standard_name": "Cholesterol [Mass/volume] in Serum or Plasma",
        "aliases": ["total cholesterol", "cholesterol", "serum cholesterol"],
        "unit": "mg/dL",
        "ref_min": 120.0,
        "ref_max": 200.0,
        "critical_max": 350.0,
        "category": "lipid",
    },
    "2571-8": {
        "standard_name": "Triglyceride [Mass/volume] in Serum or Plasma",
        "aliases": ["triglycerides", "triglyceride", "tg"],
        "unit": "mg/dL",
        "ref_min": 50.0,
        "ref_max": 150.0,
        "critical_max": 500.0,
        "category": "lipid",
    },
    "2085-9": {
        "standard_name": "HDL Cholesterol [Mass/volume] in Serum or Plasma",
        "aliases": ["hdl cholesterol", "hdl", "hdl-c"],
        "unit": "mg/dL",
        "ref_min": 40.0,
        "ref_max": 60.0,
        "category": "lipid",
    },
    "13457-7": {
        "standard_name": "LDL Cholesterol [Mass/volume] in Serum or Plasma",
        "aliases": ["ldl cholesterol", "ldl", "ldl-c"],
        "unit": "mg/dL",
        "ref_min": 60.0,
        "ref_max": 130.0,
        "critical_max": 190.0,
        "category": "lipid",
    },
    "1742-6": {
        "standard_name": "Alanine Aminotransferase (ALT/SGPT) in Serum",
        "aliases": ["alt", "sgpt", "alanine aminotransferase"],
        "unit": "U/L",
        "ref_min": 7.0,
        "ref_max": 56.0,
        "category": "liver",
    },
}


def normalize_test_name(raw_name: str) -> Optional[Tuple[str, Dict[str, Any]]]:
    """
    Matches raw test text extracted from a report to its LOINC definition.
    Returns (loinc_code, loinc_meta) or None.
    """
    clean = re.sub(r"[^a-zA-Z0-9\s]", "", raw_name).strip().lower()
    
    # 1. Exact alias match
    for code, meta in LOINC_DICTIONARY.items():
        for alias in meta["aliases"]:
            if clean == alias or clean == alias.replace(" ", ""):
                return code, meta

    # 2. Substring / Token match
    for code, meta in LOINC_DICTIONARY.items():
        for alias in meta["aliases"]:
            if alias in clean or clean in alias:
                return code, meta

    return None


def evaluate_abnormal_flag(
    loinc_meta: Dict[str, Any],
    result_val_str: str,
    custom_min: Optional[float] = None,
    custom_max: Optional[float] = None
) -> Tuple[str, Optional[float]]:
    """
    Applies deterministic reference-range rules to determine:
    NORMAL, LOW, HIGH, CRITICAL_LOW, CRITICAL_HIGH, ABNORMAL, or INDETERMINATE.
    """
    is_qualitative = loinc_meta.get("is_qualitative", False)

    if is_qualitative:
        val_clean = result_val_str.strip().lower()
        if "pos" in val_clean or "reactive" in val_clean or "detected" in val_clean:
            return "ABNORMAL", None
        elif "neg" in val_clean or "non-reactive" in val_clean or "not detected" in val_clean:
            return "NORMAL", None
        else:
            return "INDETERMINATE", None

    # Quantitative numeric check
    # Extract first numeric sequence (handles e.g. "13.4 g/dL", "< 5.0", "150,000")
    num_str = result_val_str.replace(",", "").strip()
    match = re.search(r"[-+]?\d*\.?\d+", num_str)
    if not match:
        return "INDETERMINATE", None

    try:
        numeric_val = float(match.group())
    except ValueError:
        return "INDETERMINATE", None

    # Reference boundaries (prefer report printed range if valid, else standard LOINC dictionary)
    ref_min = custom_min if custom_min is not None else loinc_meta.get("ref_min")
    ref_max = custom_max if custom_max is not None else loinc_meta.get("ref_max")
    crit_min = loinc_meta.get("critical_min")
    crit_max = loinc_meta.get("critical_max")

    if crit_min is not None and numeric_val < crit_min:
        return "CRITICAL_LOW", numeric_val
    if crit_max is not None and numeric_val > crit_max:
        return "CRITICAL_HIGH", numeric_val

    if ref_min is not None and numeric_val < ref_min:
        return "LOW", numeric_val
    if ref_max is not None and numeric_val > ref_max:
        return "HIGH", numeric_val

    return "NORMAL", numeric_val
