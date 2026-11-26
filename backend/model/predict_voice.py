import os
import re
import uuid
import difflib
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# 1. File Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(BASE_DIR, "best_disease_model.joblib")
SEV_PATH = os.path.join(BASE_DIR, "Symptom-severity.csv")
DESC_PATH = os.path.join(BASE_DIR, "symptom_Description.csv")
PREC_PATH = os.path.join(BASE_DIR, "symptom_precaution.csv")

# Load Model & Metadata
artifacts = joblib.load(MODEL_PATH)
model = artifacts["model"]
le = artifacts["label_encoder"]
symptom_columns = artifacts["symptom_columns"]

sev_df = pd.read_csv(SEV_PATH)
sev_df['Symptom'] = sev_df['Symptom'].astype(str).str.strip().str.lower().str.replace(' ', '_')
severity_map = dict(zip(sev_df['Symptom'], sev_df['weight']))

desc_df = pd.read_csv(DESC_PATH)
desc_df['Disease'] = desc_df['Disease'].astype(str).str.strip()
description_map = dict(zip(desc_df['Disease'], desc_df['Description']))

prec_df = pd.read_csv(PREC_PATH)
prec_df['Disease'] = prec_df['Disease'].astype(str).str.strip()

# Build Disease-to-Symptom Profile Dictionary from Cleaned Dataset for Clinical Validation
CLEAN_DATA_PATH = os.path.join(BASE_DIR, "cleaned_clinical_dataset.csv")
clean_df = pd.read_csv(CLEAN_DATA_PATH)
meta_cols = ['Disease', 'symptom_count', 'total_severity_score', 'severity_level']
sym_cols = [c for c in clean_df.columns if c not in meta_cols]

DISEASE_PROFILES = {}
for disease_name, grp in clean_df.groupby('Disease'):
    active_syms = set()
    for col in sym_cols:
        if (grp[col] > 0).any():
            active_syms.add(col)
    DISEASE_PROFILES[str(disease_name).strip()] = active_syms

# Enrich clinical respiratory profiles for chest tightness / pain
if 'Bronchial Asthma' in DISEASE_PROFILES:
    DISEASE_PROFILES['Bronchial Asthma'].add('chest_pain')

# 2. Comprehensive Clinical Knowledge Base (Idioms, Slang, Medical Jargon, Sinhala & Singlish -> Dataset Symptoms)
CLINICAL_PHRASE_CORPUS = {
    # Fever & Temperature
    "high_fever": [
        "fever", "high temperature", "body is burning up", "burning up", "feeling very hot",
        "pyrexia", "hyperthermia", "febrile", "running a temperature", "hot forehead",
        "තද උණ", "උණ", "ඇඟ රස්නෙයි", "ඇඟ පිච්චෙනවා", "ගිනි රස්නෙයි", "una", "thada una", "anga rasnei"
    ],
    "mild_fever": [
        "mild fever", "low grade fever", "slightly warm", "slight temperature", "subfebrile",
        "මද උණ", "පොඩි උණක්", "mada una"
    ],
    "chills": [
        "chills", "feeling cold", "freezing inside", "cold sweats", "goosebumps from cold",
        "සීතලයි", "සීතල ගැහීම", "seethala gahima", "seethalai"
    ],
    "shivering": [
        "shivering", "shaking uncontrollably", "trembling with cold", "rigors",
        "වෙවුලුම", "වෙවුලනවා", "wewlum", "wewulanawa"
    ],

    # Head & Neurological
    "headache": [
        "headache", "head pain", "head feels like it is going to explode", "head is exploding",
        "splitting head", "throbbing head", "migraine", "cephalalgia", "pounding head", "head hurts",
        "ඔළුව කැක්කුම", "හිසරදය", "ඔළුව රිදෙනවා", "oluwa kakkuma", "hisaradhaya", "oluwa ridenawa"
    ],
    "dizziness": [
        "dizziness", "dizzy", "room is spinning", "vertigo", "lightheaded", "feeling faint", "unsteady",
        "කැරකිල්ල", "කරකැවිල්ල", "හිස කරකැවිල්ල", "karakilla", "karakawilla"
    ],
    "loss_of_balance": [
        "loss of balance", "cannot walk straight", "stumbling", "falling over", "ataxia",
        "සමබරතාව නැතිවීම", "කෙලින් ඇවිදින්න බෑ"
    ],
    "altered_sensorium": [
        "confused", "disoriented", "brain fog", "cannot think clearly", "delirium",
        "සිහිමඳ ගතිය", "මනස අවුල්", "කල්පනාව මදි"
    ],

    # Gastrointestinal (Stomach, Nausea, Vomiting, Diarrhea)
    "vomiting": [
        "vomiting", "throwing up", "cannot keep any food down", "cannot keep food down",
        "puking", "emesis", "bringing up food", "retching", "vomited",
        "වමනය", "වමනෙ", "වමනෙ යනවා", "වමනෙ දැම්මා", "wamanaya", "wamane"
    ],
    "nausea": [
        "nausea", "nauseous", "feel like throwing up", "queasy", "sick to my stomach", "urge to vomit",
        "ඔක්කාරය", "වමනෙ දාන්න වගේ", "okkāraya", "okkaraya"
    ],
    "stomach_pain": [
        "stomach ache", "stomach pain", "tummy ache", "epigastric pain", "epigastric distress",
        "gastric pain", "stomach cramps", "stomach is hurting",
        "බඩ රිදෙනවා", "බඩේ කැක්කුම", "බඩ කැක්කුම", "ගැස්ට්‍රික්", "bade kakkuma", "bada ridenawa"
    ],
    "abdominal_pain": [
        "abdominal pain", "belly pain", "belly ache", "gut pain", "lower belly cramps", "visceral pain",
        "යටිබඩ රිදෙනවා", "යටිබඩ කැක්කුම", "yatibada kakkuma"
    ],
    "acidity": [
        "acidity", "heartburn", "acid reflux", "burning in chest after eating", "sour taste in mouth", "gerd",
        "පපුව දැවිල්ල", "ඇඹුල් රසක් එනවා", "ඇසිඩ් ගතිය", "papuwa dawilla"
    ],
    "diarrhoea": [
        "diarrhea", "diarrhoea", "loose motion", "watery stool", "frequent bowel movements", "running to the toilet",
        "බඩ බුරුල්", "දියර මළපහ", "බඩ යනවා", "bada yanawa", "bada burul"
    ],
    "constipation": [
        "constipation", "hard stool", "cannot pass stool", "difficulty passing motion",
        "මළබද්ධය", "බඩවේලීම", "malabaddaya", "badaweelima"
    ],
    "loss_of_appetite": [
        "loss of appetite", "dont feel like eating", "no hunger", "anorexia", "cant eat anything",
        "කෑම අප්පිරියාව", "කන්න බෑ", "බඩගිනි නෑ", "kama appiriyawa"
    ],
    "indigestion": [
        "indigestion", "upset stomach", "dyspepsia", "bloated after eating", "heavy stomach",
        "අජීර්ණය", "බඩ පිපුම", "බඩ පිරුණු ගතිය", "ajeernaya", "bada pipuma"
    ],

    # Respiratory (Cough, Throat, Breathing, Nose)
    "cough": [
        "cough", "dry cough", "coughing non stop", "hacking cough", "barking cough", "tussis",
        "කැස්ස", "වියළි කැස්ස", "කැස්සයි", "kassa", "kassai"
    ],
    "breathlessness": [
        "shortness of breath", "breathing difficulty", "cannot catch my breath", "out of breath",
        "dyspnea", "gasping for air", "hard to breathe", "tightness when breathing",
        "හුස්ම ගන්න අමාරුයි", "හුස්ම ගැනීමේ අපහසුව", "ඇදුම", "මහන්සියි හුස්ම ගන්න", "husma ganna amarui"
    ],
    "throat_irritation": [
        "sore throat", "scratchy throat", "throat hurts", "pain when swallowing", "pharyngitis", "itchy throat",
        "උගුර රිදෙනවා", "උගුර කනවා", "උගුරේ දැවිල්ල", "ගිලින්න අමාරුයි", "ugura ridenawa"
    ],
    "patches_in_throat": [
        "throat pain", "white spots in throat", "pus in tonsils", "swollen tonsils",
        "ටොන්සිල් ඉදිමිලා", "උගුර ඇතුලෙ තුවාල"
    ],
    "runny_nose": [
        "runny nose", "nasal discharge", "rhinorrhea", "dripping nose", "watery nose",
        "හොටු දියර", "නාසයෙන් දියර ගැලීම", "පීනස", "pinasa", "hotu diyara"
    ],
    "congestion": [
        "blocked nose", "stuffy nose", "nasal congestion", "plugged nose", "cant breathe through nose",
        "නාසය හිරවීම", "හොටු හිරවීම", "nasaya hirawima"
    ],
    "continuous_sneezing": [
        "sneezing", "continuous sneezing", "non stop sneezing", "sneezing fits",
        "කිවිසුම් යාම", "කිවිසුම් යනවා දිගටම", "kiwisum"
    ],
    "phlegm": [
        "mucus", "sputum", "coughing up phlegm", "wet cough", "chest congestion with mucus",
        "සෙම", "කැස්ස එක්ක සෙම", "සෙම කැස්ස", "sema", "kassa ekka sema"
    ],

    # Musculoskeletal & General Fatigue
    "fatigue": [
        "tired", "weakness", "exhausted", "no energy", "lethargy", "extreme lethargy",
        "completely drained", "wiped out", "malaise", "worn out",
        "මහන්සියි", "පණ නෑ", "අධික තෙහෙට්ටුව", "ඇඟට පණ නෑ", "mahansiyi", "pana na"
    ],
    "muscle_pain": [
        "body pain", "muscle ache", "body ache", "myalgia", "whole body hurts", "sore muscles",
        "ඇඟපත රිදිල්ල", "ඇඟ රිදෙනවා", "ඇඟපත වේදනාව", "ඇඟ කැක්කුම", "angapatha ridilla", "aga ridenawa"
    ],
    "joint_pain": [
        "joint pain", "arthralgia", "knees hurt", "aching joints", "pain in elbows and knees",
        "හන්දිපත් රුදාව", "හන්දි රිදෙනවා", "දණහිස් කැක්කුම", "handi ridenawa", "handipath rudawa"
    ],
    "back_pain": [
        "back pain", "lower back ache", "lumbar pain", "spine hurts", "backache",
        "කොන්ද රිදෙනවා", "කොන්දේ කැක්කුම", "konda ridenawa", "konde kakkuma"
    ],
    "neck_pain": [
        "neck pain", "stiff neck", "cervical pain", "neck hurts",
        "බෙල්ල රිදෙනවා", "බෙල්ලේ කැක්කුම", "bella ridenawa"
    ],

    # Skin & Dermatological
    "itching": [
        "itching", "itchy skin", "scratching all over", "pruritus",
        "ඇඟ කැසීම", "කැසිල්ල", "ඇඟ කසනවා", "kasilla", "aga kasanawa"
    ],
    "skin_rash": [
        "skin rash", "rash", "red spots on skin", "hives", "dermatitis", "eruptions on skin",
        "පලු දැමීම", "බිබිලි", "සමේ ලප", "පලු දාලා", "palu dameema", "bibili"
    ],
    "yellowish_skin": [
        "yellow skin", "jaundice", "skin turning yellow",
        "සම කහ පැහැවීම", "සම කහ වෙලා", "kaha paata wela"
    ],
    "yellowing_of_eyes": [
        "yellow eyes", "eyes turning yellow", "scleral icterus",
        "ඇස් කහ වීම", "ඇස් කහ පාටයි", "as kaha weema"
    ],

    # Cardiac & Chest
    "chest_pain": [
        "chest pain", "tightness in chest", "angina", "heavy pressure on chest", "chest hurts",
        "පපුව රිදෙනවා", "පපුවේ කැක්කුම", "පපුව තද වීම", "papuwe kakkuma", "papuwa ridenawa"
    ],
    "palpitations": [
        "heart racing", "heart pounding", "palpitations", "fast heartbeat", "fluttering in chest",
        "පපුව ගැහෙනවා", "හෘද ස්පන්දනය වේගවත්", "papuwa gahenawa"
    ],

    # Urinary
    "burning_micturition": [
        "burning urination", "pain when peeing", "dysuria", "burning sensation while urinating", "stinging pee",
        "චූ දවද්දී දැවිල්ල", "මුත්‍රා දැවිල්ල", "චූ දැවිල්ල", "muthra dawilla"
    ],
    "dark_urine": [
        "dark urine", "brownish pee", "tea colored urine",
        "මුත්‍රා තද පාට වීම", "තේ පාටට චූ යනවා", "the paatata chu"
    ]
}

# Build TF-IDF Vectorizer over all known symptom phrases for Semantic / Fuzzy N-gram matching
corpus_phrases = []
corpus_Targets = []

for sym in symptom_columns:
    clean_label = sym.replace('_', ' ')
    corpus_phrases.append(clean_label)
    corpus_Targets.append(sym)

for sym, phrases in CLINICAL_PHRASE_CORPUS.items():
    if sym in symptom_columns:
        for p in phrases:
            corpus_phrases.append(p.lower())
            corpus_Targets.append(sym)

tfidf_vectorizer = TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5))
tfidf_matrix = tfidf_vectorizer.fit_transform(corpus_phrases)


def transcribe_audio_file(audio_file_path):
    """Whisper ASR Stage 1."""
    try:
        import whisper
        asr_model = whisper.load_model("base")
        result = asr_model.transcribe(audio_file_path)
        return result.get("text", "").strip()
    except Exception as e:
        raise RuntimeError(f"Whisper ASR Transcription failed: {str(e)}")


def extract_duration(text):
    text_lower = text.lower()
    # 1. Standard English Duration Match
    match = re.search(r'(\d+\s*(?:day|days|week|weeks|month|months|hour|hours))', text_lower)
    if match:
        return match.group(1)
        
    # 2. Sinhala Digit Duration (e.g., "දවස් 3", "දවස් 2ක්")
    sin_digit_match = re.search(r'දවස්\s*(\d+)', text_lower)
    if sin_digit_match:
        val = sin_digit_match.group(1)
        return f"{val} day" if val == "1" else f"{val} days"
        
    # 3. Sinhala Word Numbers (e.g., "දවස් තුන", "දවස් දෙකක්")
    sin_word_map = {
        "එක": "1", "දෙක": "2", "තුන": "3", "හතර": "4",
        "පහ": "5", "හය": "6", "හත": "7", "අට": "8"
    }
    for word, num in sin_word_map.items():
        if f"දවස් {word}" in text_lower or f"දවස {word}" in text_lower:
            return f"{num} day" if num == "1" else f"{num} days"
            
    # 4. Sinhala Relative Terms
    if "සතියක්" in text_lower or "සති 1" in text_lower:
        return "1 week"
    if "සති දෙකක්" in text_lower or "සති 2" in text_lower:
        return "2 weeks"
    if "ඊයේ" in text_lower or "අද" in text_lower or "ඊයේ රෑ" in text_lower or "අද උදේ" in text_lower:
        return "1 day"

    # 5. English Relative Terms
    if "yesterday" in text_lower:
        return "1 day"
    if "last night" in text_lower or "today" in text_lower or "this morning" in text_lower:
        return "1 day"
    if "last week" in text_lower:
        return "1 week"
    return "unspecified"


# =========================================================================
# 3. REGIONAL LOCATION & VIRAL OUTBREAK KNOWLEDGE BASE (SRI LANKA)
# =========================================================================
DISTRICT_KNOWLEDGE = {
    "colombo": {
        "district": "Colombo",
        "province": "Western Province",
        "outbreak_status": "High Viral & Dengue Surveillance",
        "alert_level": "High Risk",
        "active_clusters": ["Dengue Virus (High Incidence)", "Seasonal Influenza (Flu)", "Acute Respiratory Infection"],
        "regional_advisory": "High Dengue transmission zone in Colombo. If fever > 2 days, order FBC & NS1 antigen. Ensure adequate oral hydration."
    },
    "gampaha": {
        "district": "Gampaha",
        "province": "Western Province",
        "outbreak_status": "High Viral Surveillance",
        "alert_level": "High Risk",
        "active_clusters": ["Dengue Virus", "Seasonal Respiratory Clusters"],
        "regional_advisory": "High mosquito breeding & transmission area. Advise mosquito bite prevention and early fever tracking."
    },
    "kalutara": {
        "district": "Kalutara",
        "province": "Western Province",
        "outbreak_status": "Moderate-to-High Surveillance",
        "alert_level": "Moderate-to-High Risk",
        "active_clusters": ["Dengue", "Leptospirosis / Rat Fever", "Viral Gastroenteritis"],
        "regional_advisory": "Lowland waterlogging and coastal zone. Monitor for severe myalgia, calf tenderness and hydration."
    },
    "kandy": {
        "district": "Kandy",
        "province": "Central Province",
        "outbreak_status": "Moderate Viral Surveillance",
        "alert_level": "Moderate Risk",
        "active_clusters": ["Seasonal Influenza (A & B)", "Viral Pharyngitis", "Chickenpox Clusters"],
        "regional_advisory": "Hill country cooler climate respiratory viral cluster. Monitor cough and oxygen saturation."
    },
    "galle": {
        "district": "Galle",
        "province": "Southern Province",
        "outbreak_status": "Moderate Surveillance",
        "alert_level": "Moderate Risk",
        "active_clusters": ["Dengue", "Viral Gastroenteritis (Stomach Flu)", "Viral Conjunctivitis"],
        "regional_advisory": "Coastal community cluster. If gastrointestinal symptoms present, evaluate hydration and fluid intake."
    },
    "matara": {
        "district": "Matara",
        "province": "Southern Province",
        "outbreak_status": "Moderate Surveillance",
        "alert_level": "Moderate Risk",
        "active_clusters": ["Viral Fever", "Dengue"],
        "regional_advisory": "Monitor fever progression and hydration."
    },
    "kurunegala": {
        "district": "Kurunegala",
        "province": "North Western Province",
        "outbreak_status": "Moderate Surveillance",
        "alert_level": "Moderate Risk",
        "active_clusters": ["Dengue", "Viral Respiratory Infection"],
        "regional_advisory": "Inter-monsoonal viral surge zone."
    },
    "ratnapura": {
        "district": "Ratnapura",
        "province": "Sabaragamuwa Province",
        "outbreak_status": "Moderate Surveillance",
        "alert_level": "Moderate Risk",
        "active_clusters": ["Leptospirosis", "Dengue", "Viral Fever"],
        "regional_advisory": "Monitor platelet counts and liver/renal profile in febrile illness."
    },
    "kegalle": {
        "district": "Kegalle",
        "province": "Sabaragamuwa Province",
        "outbreak_status": "Moderate Surveillance",
        "alert_level": "Moderate Risk",
        "active_clusters": ["Viral Respiratory Cluster", "Dengue"],
        "regional_advisory": "Community viral transmission zone."
    },
    "jaffna": {
        "district": "Jaffna",
        "province": "Northern Province",
        "outbreak_status": "Seasonal Surveillance",
        "alert_level": "Moderate Risk",
        "active_clusters": ["Seasonal Viral Fever", "Viral Conjunctivitis"],
        "regional_advisory": "Monitor fever and ophthalmic manifestations."
    },
    "anuradhapura": {
        "district": "Anuradhapura",
        "province": "North Central Province",
        "outbreak_status": "Seasonal Surveillance",
        "alert_level": "Moderate Risk",
        "active_clusters": ["Viral Fever", "Dengue"],
        "regional_advisory": "Dry zone viral fever monitoring."
    },
    "badulla": {
        "district": "Badulla",
        "province": "Uva Province",
        "outbreak_status": "Seasonal Surveillance",
        "alert_level": "Moderate Risk",
        "active_clusters": ["Respiratory Viral Infections", "Viral Pharyngitis"],
        "regional_advisory": "Uva hill country viral surveillance."
    }
}

CITY_TO_DISTRICT = {
    "negombo": "gampaha",
    "kelaniya": "gampaha",
    "wattala": "gampaha",
    "ja-ela": "gampaha",
    "ja ela": "gampaha",
    "moratuwa": "colombo",
    "dehiwala": "colombo",
    "maharagama": "colombo",
    "nugegoda": "colombo",
    "kotte": "colombo",
    "malabe": "colombo",
    "kaduwela": "colombo",
    "piliyandala": "colombo",
    "battaramulla": "colombo",
    "homagama": "colombo",
    "panadura": "kalutara",
    "horana": "kalutara",
    "beruwala": "kalutara",
    "aluthgama": "kalutara",
    "peradeniya": "kandy",
    "katugastota": "kandy",
    "gampola": "kandy",
    "hikkaduwa": "galle",
    "karapitiya": "galle",
    "ambalangoda": "galle",
    "weligama": "matara"
}

def extract_location_and_outbreak(text, fallback_location=None):
    text_lower = text.lower()
    
    # 1. Direct district match
    for dist, info in DISTRICT_KNOWLEDGE.items():
        if re.search(r'\b' + re.escape(dist) + r'\b', text_lower):
            return {
                **info,
                "location_source": "dialogue_extracted",
                "matched_query": dist.title()
            }
            
    # 2. City to district match
    for city, dist in CITY_TO_DISTRICT.items():
        if re.search(r'\b' + re.escape(city) + r'\b', text_lower):
            info = DISTRICT_KNOWLEDGE[dist]
            return {
                **info,
                "matched_query": f"{city.title()} ({info['district']} District)",
                "location_source": "dialogue_extracted"
            }
            
    # 3. Fallback if patient profile has a known location
    if fallback_location and isinstance(fallback_location, str):
        fb_lower = fallback_location.lower()
        for dist, info in DISTRICT_KNOWLEDGE.items():
            if dist in fb_lower:
                return {
                    **info,
                    "location_source": "patient_profile",
                    "matched_query": info['district']
                }

    # Default regional surveillance
    default_info = DISTRICT_KNOWLEDGE["colombo"]
    return {
        **default_info,
        "matched_query": "Western Province (Standard Surveillance)",
        "location_source": "regional_default"
    }


# =========================================================================
# 4. CLINICAL ALLERGY & MEDICATION EXTRACTION
# =========================================================================
ALLERGEN_CATALOG = {
    "penicillin": {
        "label": "Penicillin",
        "warning": "Avoid Penicillins (Amoxicillin, Augmentin, Ampicillin) - Severe Beta-lactam hypersensitivity risk."
    },
    "amoxicillin": {
        "label": "Amoxicillin",
        "warning": "Avoid Amoxicillin, Augmentin and related aminopenicillins."
    },
    "ampicillin": {
        "label": "Ampicillin",
        "warning": "Avoid Ampicillin and related aminopenicillins."
    },
    "aspirin": {
        "label": "Aspirin",
        "warning": "Strictly avoid Aspirin & NSAIDs - High risk of Reye's syndrome in viral infections and NSAID hypersensitivity."
    },
    "ibuprofen": {
        "label": "Ibuprofen",
        "warning": "Avoid NSAIDs (Ibuprofen, Diclofenac, Naproxen, Mefenamic acid)."
    },
    "diclofenac": {
        "label": "Diclofenac",
        "warning": "Avoid NSAID analgesics."
    },
    "nsaid": {
        "label": "NSAIDs",
        "warning": "Avoid all Non-Steroidal Anti-Inflammatory Drugs (NSAIDs) - use only Paracetamol."
    },
    "sulfa": {
        "label": "Sulfa Drugs / Sulfonamides",
        "warning": "Avoid Co-trimoxazole (Bactrim, Septra) and all sulfonamide antibiotics."
    },
    "sulfonamide": {
        "label": "Sulfonamides",
        "warning": "Avoid sulfonamide antibiotics."
    },
    "paracetamol": {
        "label": "Paracetamol",
        "warning": "Caution: Paracetamol hypersensitivity reported. Clinician must review alternative antipyretics."
    },
    "codeine": {
        "label": "Codeine / Opioids",
        "warning": "Avoid Codeine and related opioid antitussives."
    },
    "ciprofloxacin": {
        "label": "Ciprofloxacin",
        "warning": "Avoid Fluoroquinolone antimicrobials."
    },
    "cephalosporin": {
        "label": "Cephalosporins",
        "warning": "Avoid Cephalexin, Cefuroxime, Ceftriaxone."
    },
    "erythromycin": {
        "label": "Erythromycin / Macrolides",
        "warning": "Avoid Macrolide antibiotics (Erythromycin, Azithromycin, Clarithromycin)."
    }
}

MEDICATION_PATTERNS = [
    ("metformin", "Metformin (Oral Hypoglycemic)"),
    ("මෙට්ෆෝමින්", "Metformin (Oral Hypoglycemic)"),
    ("insulin", "Insulin"),
    ("ඉන්සියුලින්", "Insulin"),
    ("losartan", "Losartan (Antihypertensive)"),
    ("ලොසාර්ටන්", "Losartan (Antihypertensive)"),
    ("amlodipine", "Amlodipine (Calcium Channel Blocker)"),
    ("ඇම්ලොඩිපින්", "Amlodipine (Calcium Channel Blocker)"),
    ("enalapril", "Enalapril (ACE Inhibitor)"),
    ("atorvastatin", "Atorvastatin (Lipid Lowering)"),
    ("rosuvastatin", "Rosuvastatin"),
    ("salbutamol", "Salbutamol Inhaler (Bronchodilator)"),
    ("inhaler", "Asthma Inhaler"),
    ("ඉන්හේලර්", "Asthma Inhaler"),
    ("omeprazole", "Omeprazole (Proton Pump Inhibitor)"),
    ("pantoprazole", "Pantoprazole"),
    ("cetirizine", "Cetirizine (Antihistamine)"),
    ("සෙට්‍රිසින්", "Cetirizine (Antihistamine)"),
    ("loratadine", "Loratadine"),
    ("thyroxine", "Levothyroxine (Thyroid Hormone)"),
    ("warfarin", "Warfarin (Anticoagulant)")
]

SINHALA_ALLERGEN_MAP = {
    "පෙනිසිලින්": "penicillin",
    "ඇමොක්සිලින්": "amoxicillin",
    "ඇස්ප්‍රින්": "aspirin",
    "පැරසිටමෝල්": "paracetamol",
    "පැනඩෝල්": "paracetamol"
}

def extract_current_meds(text_lower):
    detected_meds = []
    for key, label in MEDICATION_PATTERNS:
        if re.search(r'\b' + re.escape(key) + r'\b', text_lower) or key in text_lower:
            # Ensure not part of allergy phrase
            if not re.search(r'\b(?:allergic|allergy|reaction)\s+(?:to\s+)?' + re.escape(key) + r'\b', text_lower):
                if label not in detected_meds:
                    detected_meds.append(label)
    return detected_meds

def extract_allergies_and_medications(text):
    text_lower = text.lower()
    
    # Check negation: "no known allergies", "no allergies", "NKDA", "කිසිම ඇලජික් එකක් නෑ"
    no_allergy_patterns = [
        r'\bno\s+(?:known\s+)?(?:drug\s+)?allerg(?:y|ies)\b',
        r'\bnot\s+allergic\b',
        r'\bno\s+allergies\b',
        r'\bwithout\s+(?:any\s+)?allerg(?:y|ies)\b',
        r'\bnkda\b',
        r'\bdoesn\'?t\s+have\s+(?:any\s+)?allerg(?:y|ies)\b',
        r'\bdenies\s+(?:any\s+)?allerg(?:y|ies)\b',
        r'කිසිම\s*ඇලජික්\s*(?:එකක්\s*)?නෑ',
        r'ඇලජික්\s*(?:නෑ|නැත|නැහැ)',
        r'අසාත්මිකතා\s*(?:නෑ|නැත|නැහැ)',
        r'බෙහෙත්\s*වලට\s*(?:කිසිම\s*)?අසාත්මිකතා\s*නෑ'
    ]
    for p in no_allergy_patterns:
        if re.search(p, text_lower):
            return {
                "patient_reported_allergies": [],
                "allergy_status": "No Known Drug Allergies (NKDA)",
                "contraindication_warnings": [],
                "patient_current_medications": extract_current_meds(text_lower)
            }
            
    detected_allergens = []
    warnings = []

    # Check Sinhala Allergen mentions
    for sin_key, eng_key in SINHALA_ALLERGEN_MAP.items():
        if sin_key in text_lower:
            allergy_context = "ඇලජික්" in text_lower or "අසාත්මික" in text_lower or "allergy" in text_lower
            if allergy_context:
                data = ALLERGEN_CATALOG[eng_key]
                if data["label"] not in detected_allergens:
                    detected_allergens.append(data["label"])
                    warnings.append(data["warning"])
    
    for key, data in ALLERGEN_CATALOG.items():
        pattern = r'\b' + re.escape(key) + r'(?:s)?\b'
        if re.search(pattern, text_lower):
            allergy_context = (
                f"allergic to {key}" in text_lower or
                f"allergy to {key}" in text_lower or
                f"{key} allergy" in text_lower or
                f"{key} allergies" in text_lower or
                f"reaction to {key}" in text_lower or
                "allergic" in text_lower or
                "allergy" in text_lower
            )
            if allergy_context or "allergic" in text_lower:
                if data["label"] not in detected_allergens:
                    detected_allergens.append(data["label"])
                    warnings.append(data["warning"])

    status = "Confirmed Allergies Reported" if detected_allergens else "No Specific Allergies Mentioned in Dialogue"
    
    return {
        "patient_reported_allergies": detected_allergens,
        "allergy_status": status,
        "contraindication_warnings": warnings,
        "patient_current_medications": extract_current_meds(text_lower)
    }

def extract_vital_signs(text):
    """
    Extracts clinical vital signs and stethoscope findings from English, Sinhala and Singlish consultation text:
    - Heart Rate / Pulse (bpm)
    - Blood Pressure (mmHg)
    - Body Temperature (°F / °C)
    - Oxygen Saturation (SpO2 %)
    - Respiratory Rate (breaths/min)
    - Stethoscope Auscultation Findings (Wheezing / Crackles / Normal)
    """
    vitals = {}
    text_lower = text.lower()
    
    # 1. Temperature (English + Sinhala: fever, temp, temperature, උෂ්ණත්වය, උණ, ටෙම්ප්)
    temp_patterns = [
        r'(?:fever|temp|temperature|උෂ්ණත්වය|උණ|ටෙම්ප්)\s*(?:is|of|:|එක|එකත්)?\s*(\d{2,3}(?:\.\d+)?)\s*(?:°|degrees|deg)?\s*([cf])?\b',
        r'(\d{2,3}(?:\.\d+)?)\s*(?:°|degrees|deg)\s*([cf])?\b',
        r'(\d{2,3}(?:\.\d+)?)\s*(?:°\s*)?([cf])\b'
    ]
    for p in temp_patterns:
        m = re.search(p, text_lower)
        if m:
            val = float(m.group(1))
            unit = m.group(2) if len(m.groups()) > 1 and m.group(2) else None
            is_f = unit.lower() == 'f' if unit else val > 50
            if is_f and 95.0 <= val <= 108.0:
                c_val = round((val - 32) * 5 / 9, 1)
                vitals["temperature"] = f"{val}°F ({c_val}°C)"
                break
            elif not is_f and 35.0 <= val <= 43.0:
                f_val = round((val * 9 / 5) + 32, 1)
                vitals["temperature"] = f"{val}°C ({f_val}°F)"
                break
            
    # 2. Blood Pressure (English + Sinhala: bp, blood pressure, ප්‍රෙෂර්, බ්ලඩ් ප්‍රෙෂර්)
    bp_match = re.search(r'(?:bp|blood\s*pressure|ප්‍රෙෂර්|ප්‍රෙෂර්\s*එක|බ්ලඩ්\s*ප්‍රෙෂර්)?\s*(\d{2,3})\s*(?:\/|\s+over\s+|\s+)\s*(\d{2,3})\s*(?:mmhg)?', text_lower)
    if bp_match:
        sys_val, dia_val = int(bp_match.group(1)), int(bp_match.group(2))
        if 60 <= sys_val <= 240 and 40 <= dia_val <= 150:
            vitals["blood_pressure"] = f"{sys_val}/{dia_val} mmHg"
        
    # 3. Heart Rate / Pulse (English + Sinhala: pulse, heart rate, hr, bpm, හාට් රේට්, හාර්ට් රේට්, පල්ස්, හෘද ස්පන්දනය)
    hr_match = re.search(r'(?:pulse|heart\s*rate|hr|bpm|හාට්\s*රේට්|හාර්ට්\s*රේට්|පල්ස්|හෘද\s*ස්පන්දනය)\s*(?:is|of|:|එක|එකත්)?\s*(\d{2,3})', text_lower)
    if hr_match:
        hr_val = int(hr_match.group(1))
        if 40 <= hr_val <= 220:
            vitals["heart_rate"] = f"{hr_val} bpm"

    # 4. Oxygen Saturation (SpO2 %: spo2, oxygen, saturation, sat, ඔක්සිජන්, ඔක්සිජන් මට්ටම)
    spo2_match = re.search(r'(?:spo2|oxygen|saturation|sat|ඔක්සිජන්|ඔක්සිජන්\s*මට්ටම)\s*(?:level|is|of|:|එක|එකත්)?\s*(\d{2,3})\s*(?:%|ප්‍රතිශතයක්)?', text_lower)
    if spo2_match:
        s_val = int(spo2_match.group(1))
        if 50 <= s_val <= 100:
            vitals["spo2"] = f"{s_val}%"

    # 5. Respiratory Rate (breaths/min: resp rate, respiratory rate, breathing rate, ශ්වසන වේගය)
    rr_match = re.search(r'(?:respiratory\s*rate|resp\s*rate|breathing\s*rate|ශ්වසන\s*වේගය)\s*(?:is|of|:|එක)?\s*(\d{1,2})', text_lower)
    if rr_match:
        rr_val = int(rr_match.group(1))
        if 8 <= rr_val <= 60:
            vitals["respiratory_rate"] = f"{rr_val} breaths/min"

    # 6. Stethoscope Auscultation Findings (English + Sinhala)
    if re.search(r'(?:wheeze|wheezing|විසින්|විසිං|ස්ට්‍රයිඩර්|හුස්ම\s*ගනිද්දි\s*සද්දයක්)', text_lower):
        vitals["stethoscope_auscultation"] = "Wheezing (Bilateral Bronchospasm)"
    elif re.search(r'(?:crackle|crackles|crepitations|රොන්චි|කර කර ගානවා)', text_lower):
        vitals["stethoscope_auscultation"] = "Crackles / Crepitations (Possible Consolidation)"
    elif re.search(r'(?:clear\s*chest|chest\s*is\s*clear|පපුව\s*හොඳයි|පපුව\s*ක්ලියර්|පපුවේ\s*සද්ද\s*නෑ)', text_lower):
        vitals["stethoscope_auscultation"] = "Clear Vesicular Breath Sounds"
        
    return vitals


# =========================================================================
# 5. STANDARDIZED ICD-10 & TARGET CONDITIONS MAPPING
# =========================================================================
ICD10_MAP = {
    "Dengue": ("A90", "DENGUE", "Dengue Fever"),
    "Common Cold": ("J00", "COMMON_COLD", "Common Cold / Acute Upper Respiratory Infection"),
    "Chicken pox": ("B01.9", "CHICKENPOX", "Chickenpox (Varicella)"),
    "Gastroenteritis": ("A08.4", "VIRAL_GASTROENTERITIS", "Viral Gastroenteritis (Acute Stomach Flu)"),
    "Bronchial Asthma": ("J45.909", "BRONCHIAL_ASTHMA", "Bronchial Asthma with Exacerbation"),
    "Pneumonia": ("J18.9", "PNEUMONIA", "Pneumonia / Lower Respiratory Tract Infection"),
    "Typhoid": ("A01.0", "TYPHOID", "Typhoid Fever"),
    "Malaria": ("B54", "MALARIA", "Malaria Infection"),
    "Allergy": ("T78.40", "ALLERGIC_REACTION", "Allergic Reaction / Hypersensitivity"),
    "GERD": ("K21.9", "GERD", "Gastroesophageal Reflux Disease"),
    "Migraine": ("G43.909", "MIGRAINE", "Migraine Headache"),
    "Urinary tract infection": ("N39.0", "UTI", "Urinary Tract Infection"),
}

SUGGESTED_TREATMENTS = {
    "Dengue": ["Oral Rehydration Therapy (ORS)", "Antipyretic (Paracetamol Only - Strictly Avoid NSAIDs)", "Complete Blood Count & Platelet Monitoring", "Rest & High Fluid Intake"],
    "Common Cold": ["Antihistamine / Decongestant", "Paracetamol for body aches", "Steam inhalation & Hydration", "Vitamin C & Throat Lozenges"],
    "Chicken pox": ["Antiviral (Acyclovir if indicated by doctor)", "Calamine lotion for pruritus", "Antihistamine for itching", "Paracetamol for fever (Avoid Aspirin)"],
    "Gastroenteritis": ["Oral Rehydration Salts (ORS)", "Zinc supplementation", "Probiotics", "Electrolyte maintenance"],
    "Bronchial Asthma": ["Short-acting Beta-agonist (Salbutamol Inhaler)", "Inhaled Corticosteroid", "Avoid exposure to cold/dust allergens"],
    "Pneumonia": ["Urgent Physician Clinical Review", "Antimicrobial therapy as prescribed", "Chest physiotherapy & Oxygenation check"]
}


ORGAN_SPECIFIC_KEYWORDS = {
    'stomach_pain': ['stomach', 'belly', 'gastric', 'epigastric', 'tummy', 'බඩ'],
    'abdominal_pain': ['abdomen', 'belly', 'gut', 'යටිබඩ', 'බඩ'],
    'chest_pain': ['chest', 'angina', 'පපුව', 'තද'],
    'back_pain': ['back', 'lumbar', 'spine', 'කොන්ද'],
    'neck_pain': ['neck', 'cervical', 'බෙල්ල'],
    'joint_pain': ['joint', 'knee', 'elbow', 'හන්දි', 'දණහිස්'],
    'headache': ['head', 'migraine', 'cephalalgia', 'ඔළුව', 'හිස'],
    'yellowish_skin': ['yellow', 'jaundice', 'කහ', 'සම'],
    'yellowing_of_eyes': ['eye', 'eyes', 'sclera', 'ඇස්', 'ඇහැ', 'කහ']
}


def is_symptom_negated(phrase, text):
    """
    Checks if a reported symptom is clinically negated in speech.
    Supports English ("no vomiting", "denies cough") and Sinhala ("වමනය නෑ", "කැස්සක් නෑ").
    """
    eng_patterns = [
        r'\b(?:no|not|without|denies|denied|free of|negative for)\s+(?:any\s+)?' + re.escape(phrase),
        re.escape(phrase) + r'\s+(?:is|was)?\s*absent\b'
    ]
    for p in eng_patterns:
        if re.search(p, text):
            return True

    sin_patterns = [
        re.escape(phrase) + r'\s*(?:ක්|යක්)?\s*(?:නෑ|නැත|නැහැ)',
        r'(?:නෑ|නැත|නැහැ)\s*[\w\s\u0D80-\u0DFF]{0,15}\s*' + re.escape(phrase)
    ]
    for p in sin_patterns:
        if re.search(p, text):
            return True

    return False


def smart_extract_symptoms(transcript_text):
    """
    3-Layer Clinical NLP Extraction:
      1. Direct & Idiomatic Phrase Matching (English & Sinhala)
      2. Clinical Negation Detection ("no vomiting", "වමනය නෑ")
      3. Clause-level Semantic / Character N-gram TF-IDF Similarity
    """
    # Preserve English alphanumeric & Sinhala Unicode range (\u0D80-\u0DFF)
    text_lower = re.sub(r'[^\w\s\u0D80-\u0DFF]', ' ', transcript_text.lower())
    text_lower = re.sub(r'\s+', ' ', text_lower).strip()

    detected = {}  # symptom_code -> confidence

    # Layer 1: Exact Dataset Names & Clinical Phrase Corpus
    for sym in symptom_columns:
        readable = sym.replace('_', ' ')
        if re.search(r'\b' + re.escape(readable) + r'\b', text_lower):
            if not is_symptom_negated(readable, text_lower):
                detected[sym] = 0.98

    for sym, phrases in CLINICAL_PHRASE_CORPUS.items():
        if sym in symptom_columns:
            for phrase in phrases:
                if phrase in text_lower:
                    if not is_symptom_negated(phrase, text_lower):
                        detected[sym] = max(detected.get(sym, 0.0), 0.94)

    # Layer 2: Sliding Window & Clause TF-IDF Similarity
    words = text_lower.split()
    candidate_chunks = []
    for window_size in [2, 3, 4, 5]:
        for i in range(len(words) - window_size + 1):
            chunk = " ".join(words[i:i + window_size])
            candidate_chunks.append(chunk)

    if candidate_chunks:
        chunk_vecs = tfidf_vectorizer.transform(candidate_chunks)
        sim_matrix = cosine_similarity(chunk_vecs, tfidf_matrix)

        for chunk_idx, sims in enumerate(sim_matrix):
            best_match_idx = int(np.argmax(sims))
            best_score = float(sims[best_match_idx])
            if best_score >= 0.72:
                matched_sym = corpus_Targets[best_match_idx]
                if matched_sym in ORGAN_SPECIFIC_KEYWORDS:
                    if not any(k in text_lower for k in ORGAN_SPECIFIC_KEYWORDS[matched_sym]):
                        continue

                chunk_str = candidate_chunks[chunk_idx]
                is_neg = (
                    is_symptom_negated(chunk_str, text_lower) or
                    any(is_symptom_negated(p, text_lower) for p in CLINICAL_PHRASE_CORPUS.get(matched_sym, []))
                )
                if matched_sym not in detected and not is_neg:
                    detected[matched_sym] = round(min(0.92, best_score), 2)

    return detected


def analyze_patient_consultation(transcript_text, patient_id=12, doctor_id=2, consultation_id=None, patient_location=None, manual_vitals=None):
    """
    Primary Clinical Consultation AI Engine:
    1. Extracts Duration, Symptoms, Allergies, Current Meds, Vitals & Location
    2. Integrates Physical Examination (Stethoscope Auscultation & Vitals Desk)
    3. Runs Clinical Machine Learning Inference with Auscultation Priors
    4. Synthesizes ICD-10 Classification, Precautions & Safety Warnings
    5. Generates Data-Contract-Compatible JSON for Component 3
    """
    # 0. Sinhala Clinical Dialogue Parsing (Speaker separation & Negation handling)
    dialogue_info = None
    try:
        from .sinhala_dialogue_praser import parse_clinical_dialogue
        dialogue_info = parse_clinical_dialogue(transcript_text)
    except Exception as parse_err:
        print(f"[Dialogue Parser Warning] {parse_err}")

    default_duration = extract_duration(transcript_text)
    if dialogue_info and dialogue_info.get("duration") != "Not specified":
        default_duration = dialogue_info["duration"]

    patient_speech = transcript_text
    if dialogue_info and dialogue_info.get("patient_speech_combined", "").strip():
        patient_speech = dialogue_info["patient_speech_combined"]

    detected_map = smart_extract_symptoms(patient_speech)

    # Integrate Dialogue Parser Confirmed Positive and Negated Symptoms
    if dialogue_info:
        for sym in dialogue_info.get("positive_symptoms", []):
            if sym in symptom_columns:
                detected_map[sym] = max(detected_map.get(sym, 0.0), 0.95)
        for neg_sym in dialogue_info.get("negated_symptoms", []):
            detected_map.pop(neg_sym, None)

    detected_symptoms = sorted(list(detected_map.keys()))

    # Extract Location & Regional Outbreak Surveillance
    location_data = extract_location_and_outbreak(transcript_text, fallback_location=patient_location)
    
    # Extract Allergies, Contraindications & Current Medications
    allergy_data = extract_allergies_and_medications(transcript_text)
    
    # Extract Mentioned Vitals from Voice
    vitals_data = extract_vital_signs(transcript_text)

    # Merge Doctor's Clinical Physical Examination & Manual Vitals Desk (takes precedence)
    if manual_vitals and isinstance(manual_vitals, dict):
        for vk, vv in manual_vitals.items():
            if vv and str(vv).strip():
                vitals_data[vk] = str(vv).strip()

    # Vitals & Auscultation Clinical Reasoning
    auscultation_text = str(vitals_data.get("stethoscope_auscultation", "")).lower()
    has_wheezing = any(w in auscultation_text for w in ["wheez", "විසිං", "විසින්", "ස්ට්‍රයිඩර්"])
    has_crackles = any(c in auscultation_text for c in ["crackle", "crepitation", "රොන්චි"])

    spo2_val = None
    if "spo2" in vitals_data:
        m_sp = re.search(r'(\d{2,3})', str(vitals_data["spo2"]))
        if m_sp:
            spo2_val = int(m_sp.group(1))

    sys_bp = None
    if "blood_pressure" in vitals_data:
        m_bp = re.search(r'(\d{2,3})\s*/\s*(\d{2,3})', str(vitals_data["blood_pressure"]))
        if m_bp:
            sys_bp = int(m_bp.group(1))

    hr_val = None
    if "heart_rate" in vitals_data:
        m_hr = re.search(r'(\d{2,3})', str(vitals_data["heart_rate"]))
        if m_hr:
            hr_val = int(m_hr.group(1))

    feature_vector = np.zeros((1, len(symptom_columns)), dtype=float)
    extracted_symptoms_payload = []
    total_severity_score = 0

    for sym in detected_symptoms:
        idx = symptom_columns.index(sym)
        weight = int(severity_map.get(sym, 1))
        feature_vector[0, idx] = weight
        total_severity_score += weight

        if weight >= 5:
            sev_label = "severe"
        elif weight >= 3:
            sev_label = "moderate"
        else:
            sev_label = "mild"

        extracted_symptoms_payload.append({
            "symptom_code": sym,
            "symptom_label": sym.replace('_', ' ').title(),
            "duration": default_duration,
            "severity": sev_label,
            "severity_weight": weight,
            "confidence": detected_map[sym]
        })

    # Safety Guard: If zero recognizable clinical symptoms exist in speech
    if len(detected_symptoms) == 0:
        return {
            "status": "warning",
            "analysis_reference": f"VOICE-AI-{datetime.now().strftime('%Y-%m-%d')}-{uuid.uuid4().hex[:4].upper()}",
            "consultation_id": str(consultation_id or uuid.uuid4()),
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "transcript_summary": transcript_text,
                "patient_location": location_data,
                "regional_outbreak_surveillance": {
                    "district": location_data["district"],
                    "province": location_data["province"],
                    "alert_level": location_data["alert_level"],
                    "outbreak_status": location_data["outbreak_status"],
                    "active_clusters": location_data["active_clusters"],
                    "regional_advisory": location_data["regional_advisory"]
                },
                "extracted_clinical_notes": {
                    "chief_complaint": transcript_text,
                    "patient_reported_allergies": allergy_data["patient_reported_allergies"],
                    "allergy_status": allergy_data["allergy_status"],
                    "allergy_contraindications": allergy_data["contraindication_warnings"],
                    "patient_current_medications": allergy_data["patient_current_medications"],
                    "vital_signs_mentioned": vitals_data
                },
                "extracted_symptoms": [],
                "primary_diagnosis": {
                    "condition_code": "UNCLASSIFIED_OUT_OF_SCOPE",
                    "condition_label": "Insufficient / Unrecognized Clinical Symptoms",
                    "icd_10_code": "R69",
                    "confidence": 0.0,
                    "severity_level": "Unknown",
                    "total_severity_score": 0,
                    "clinical_description": "The reported dialogue did not contain recognizable internal medicine symptoms or requires manual physician examination."
                },
                "differential_diagnoses": [],
                "recommended_precautions": ["Conduct manual clinical examination", "Review patient history directly"],
                "suggested_treatment_categories": ["Clinical Review Required"]
            }
        }

    # Predict Disease using Trained Random Forest & Clinical Symptom Coverage Fusion
    X_input = pd.DataFrame(feature_vector, columns=symptom_columns)
    raw_probs = model.predict_proba(X_input)[0]

    # Clinical Coverage Weighting with Vitals & Auscultation Priors
    reported_weights = {sym: int(severity_map.get(sym, 1)) for sym in detected_symptoms}
    total_reported_weight = sum(reported_weights.values()) or 1.0

    gastro_syms = {'acidity', 'stomach_pain', 'vomiting', 'nausea', 'abdominal_pain'}
    has_gastro = any(s in detected_symptoms for s in gastro_syms)

    non_specific_syms = {'fatigue', 'mild_fever', 'malaise', 'headache', 'lethargy', 'loss_of_appetite'}
    specific_reported = [s for s in detected_symptoms if s not in non_specific_syms]

    fused_scores = np.zeros(len(le.classes_))
    for idx, d_name in enumerate(le.classes_):
        d_clean = str(d_name).strip()
        disease_syms = DISEASE_PROFILES.get(d_clean, set())

        matching_symptoms = [s for s in detected_symptoms if s in disease_syms]
        # Zero-coverage filter: Disease MUST explain at least one reported symptom!
        # Prevents Random Forest diffuse noise from surfacing unrelated conditions (e.g. Hepatitis C, Varicose veins).
        if not matching_symptoms:
            fused_scores[idx] = 0.0
            continue

        explained_weight = sum(w for sym, w in reported_weights.items() if sym in disease_syms)
        coverage = explained_weight / total_reported_weight

        # Specificity filter: If specific symptoms are reported, diseases matching ONLY non-specific symptoms are penalized
        if specific_reported and not any(s in disease_syms for s in specific_reported):
            coverage *= 0.05

        # Multi-symptom coverage bonus: Higher proportion of patient's symptom set explained
        fraction_explained = len(matching_symptoms) / max(1, len(detected_symptoms))
        coverage = coverage * (0.4 + 0.6 * fraction_explained)

        # Acute Infection Rule: If patient reports high_fever, non-febrile diseases get penalized
        if "high_fever" in reported_weights and "high_fever" not in disease_syms:
            coverage *= 0.05

        # Respiratory vs GERD Clinical Discernment:
        # If cough/chest tightness is reported without ANY gastric/reflux symptom, GERD is penalized.
        if d_clean == "GERD" and not has_gastro and ("cough" in detected_symptoms or "chest_pain" in detected_symptoms):
            coverage *= 0.05

        # Stethoscope Auscultation Findings
        if has_wheezing:
            if d_clean == "Bronchial Asthma":
                coverage *= 3.0
            elif d_clean in ["Pneumonia", "Common Cold"]:
                coverage *= 1.3
        elif has_crackles:
            if d_clean == "Pneumonia":
                coverage *= 3.2
            elif d_clean in ["Bronchial Asthma", "Tuberculosis"]:
                coverage *= 1.4

        # Hypoxemia (SpO2 < 95%) Boosts Acute Respiratory Conditions
        if spo2_val and spo2_val < 95:
            if d_clean in ["Bronchial Asthma", "Pneumonia"]:
                coverage *= 1.8

        fused_scores[idx] = (raw_probs[idx] * 0.15) + (coverage * 0.85)

    # Normalize to probabilities
    sum_fused = np.sum(fused_scores)
    norm_probs = (fused_scores / sum_fused) if sum_fused > 0 else raw_probs

    # Select only valid candidates with positive symptom match
    ranked_indices = np.argsort(norm_probs)[::-1]
    valid_candidates = [i for i in ranked_indices if norm_probs[i] > 0]
    if not valid_candidates:
        valid_candidates = ranked_indices[:1]

    top_k = min(len(valid_candidates), 5)
    top_indices = valid_candidates[:top_k]
    top_k_probs = norm_probs[top_indices]
    scaled_probs = np.exp(top_k_probs * 6) / np.sum(np.exp(top_k_probs * 6))

    primary_idx = top_indices[0]
    primary_disease = le.inverse_transform([primary_idx])[0]
    primary_confidence = float(round(scaled_probs[0], 4))

    # Influenza detection override if classical triad is present
    if "high_fever" in detected_symptoms and "cough" in detected_symptoms and ("headache" in detected_symptoms or "chills" in detected_symptoms or "fatigue" in detected_symptoms):
        if primary_disease in ["Common Cold", "Dengue"] and scaled_probs[0] < 0.85:
            # High probability of Influenza presentation
            pass

    icd_info = ICD10_MAP.get(primary_disease, ("R69", primary_disease.upper().replace(' ', '_'), primary_disease))
    icd_10_code, condition_code, condition_label = icd_info

    diff_diagnoses = []
    for rank in range(1, top_k):
        if scaled_probs[rank] > 0.03:
            diff_idx = top_indices[rank]
            diff_disease = le.inverse_transform([diff_idx])[0]
            diff_icd = ICD10_MAP.get(diff_disease, ("R69", diff_disease.upper().replace(' ', '_'), diff_disease))
            diff_diagnoses.append({
                "condition_code": diff_icd[1],
                "condition_label": diff_icd[2],
                "icd_10_code": diff_icd[0],
                "confidence": float(round(scaled_probs[rank], 4)),
                "clinical_description": description_map.get(diff_disease, f"Potential clinical presentation matching {diff_icd[2]}.")
            })

    if total_severity_score >= 15:
        overall_severity = "Severe"
    elif total_severity_score >= 8:
        overall_severity = "Moderate"
    else:
        overall_severity = "Mild"

    precautions = []
    prec_row = prec_df[prec_df['Disease'] == primary_disease]
    if not prec_row.empty:
        for i in range(1, 5):
            val = str(prec_row.iloc[0].get(f'Precaution_{i}', '')).strip()
            if val and val != 'nan':
                precautions.append(val.capitalize())

    # If dengue suspected and in high risk outbreak district, append vital caution
    if condition_code == "DENGUE" or location_data["alert_level"] == "High Risk":
        if "Strictly avoid Aspirin and NSAIDs (use Paracetamol only)" not in precautions:
            precautions.insert(0, "Strictly avoid Aspirin and NSAIDs (use Paracetamol only)")

    # Auscultation & Vitals Clinical Alerts
    if has_wheezing:
        precautions.insert(0, "Auscultation Alert: Bilateral wheezing heard on stethoscope. Consider bronchodilator nebulization (Salbutamol) and steroid inhaler.")
    if has_crackles:
        precautions.insert(0, "Auscultation Alert: Coarse crepitations/crackles detected. Recommend urgent Chest X-Ray and inflammatory markers (CRP/FBC) to rule out consolidation.")
    if spo2_val and spo2_val < 95:
        precautions.insert(0, f"Critical Vitals Alert: Hypoxemia noted (SpO2: {spo2_val}%). Administer supplemental oxygen and monitor saturation continuously.")
    if sys_bp and sys_bp >= 140:
        precautions.insert(0, f"Vitals Warning: Elevated blood pressure detected ({vitals_data['blood_pressure']}). Monitor cardiovascular risk and avoid stimulants.")
    if hr_val and hr_val > 100:
        precautions.insert(0, f"Clinical Note: Tachycardia observed ({hr_val} bpm). Check hydration status, fever curve, and infection markers.")

    suggested_treatments = SUGGESTED_TREATMENTS.get(primary_disease, [
        "Symptomatic management as clinically assessed",
        "Adequate fluid intake and rest",
        "Physician consultation if symptoms persist > 48 hours"
    ])

    return {
        "status": "success",
        "analysis_reference": f"VOICE-AI-{datetime.now().strftime('%Y-%m-%d')}-{uuid.uuid4().hex[:4].upper()}",
        "consultation_id": str(consultation_id or uuid.uuid4()),
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "transcript_summary": transcript_text,
            "patient_location": location_data,
            "clinical_vitals": vitals_data,
            "stethoscope_findings": vitals_data.get("stethoscope_auscultation", "Normal Vesicular (Clear)"),
            "regional_outbreak_surveillance": {
                "district": location_data["district"],
                "province": location_data["province"],
                "alert_level": location_data["alert_level"],
                "outbreak_status": location_data["outbreak_status"],
                "active_clusters": location_data["active_clusters"],
                "regional_advisory": location_data["regional_advisory"]
            },
            "extracted_clinical_notes": {
                "chief_complaint": transcript_text,
                "patient_reported_allergies": allergy_data["patient_reported_allergies"],
                "allergy_status": allergy_data["allergy_status"],
                "allergy_contraindications": allergy_data["contraindication_warnings"],
                "patient_current_medications": allergy_data["patient_current_medications"],
                "vital_signs_mentioned": vitals_data,
                "stethoscope_findings": vitals_data.get("stethoscope_auscultation", "Normal Vesicular (Clear)"),
                "doctor_inquiries_asked": dialogue_info.get("doctor_questions", []) if dialogue_info else []
            },
            "extracted_symptoms": extracted_symptoms_payload,
            "primary_diagnosis": {
                "condition_code": condition_code,
                "condition_label": condition_label,
                "icd_10_code": icd_10_code,
                "confidence": primary_confidence,
                "severity_level": overall_severity,
                "total_severity_score": total_severity_score,
                "clinical_description": description_map.get(primary_disease, "Clinical description available upon doctor evaluation.")
            },
            "differential_diagnoses": diff_diagnoses,
            "recommended_precautions": precautions,
            "suggested_treatment_categories": suggested_treatments,
            "clinical_dialogue_turns": dialogue_info.get("dialogue", []) if dialogue_info else [],
            "doctor_questions": dialogue_info.get("doctor_questions", []) if dialogue_info else [],
            "negated_symptoms_excluded": dialogue_info.get("negated_symptoms", []) if dialogue_info else []
        }
    }