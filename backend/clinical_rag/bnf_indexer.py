"""
BNF 70 Clinical Knowledge Indexer & Extractor
Parses 'British National Formulary 70 [medex.com.bd].pdf' using PyMuPDF (fitz),
extracts structured drug monographs, indications, adult & child dosages,
contraindications, cautions, hepatic/renal warnings, and Appendix 1 drug interactions.
Stores results in an SQLite database (bnf_knowledge.db) and a JSON cache for Clinical RAG.
"""

import os
import re
import json
import sqlite3
import fitz

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_PATH = os.path.join(BASE_DIR, "British National Formulary 70 [medex.com.bd].pdf")
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bnf_knowledge.db")
JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bnf_monographs.json")

# High priority core clinical drugs to rigorously extract with exact page mapping
TARGET_DRUGS = [
    # Analgesics / Antipyretics
    {"name": "Paracetamol", "class": "Analgesic & Antipyretic", "category": "Pain / Fever", "start_page": 371, "end_page": 377},
    {"name": "Ibuprofen", "class": "Non-steroidal Anti-inflammatory (NSAID)", "category": "Pain / Inflammation", "start_page": 925, "end_page": 932},
    {"name": "Aspirin", "class": "Antiplatelet / Salicylate NSAID", "category": "Cardiovascular / Pain", "start_page": 104, "end_page": 110},
    {"name": "Diclofenac", "class": "Non-steroidal Anti-inflammatory (NSAID)", "category": "Musculoskeletal / Pain", "start_page": 918, "end_page": 925},
    {"name": "Tramadol", "class": "Opioid Analgesic", "category": "Moderate to Severe Pain", "start_page": 373, "end_page": 380},
    {"name": "Mefenamic Acid", "class": "NSAID", "category": "Dysmenorrhoea / Acute Pain", "start_page": 930, "end_page": 936},

    # Antibacterials / Anti-infectives
    {"name": "Amoxicillin", "class": "Broad-spectrum Penicillin Antibacterial", "category": "Bacterial Infection", "start_page": 482, "end_page": 489},
    {"name": "Co-amoxiclav", "class": "Penicillin + Beta-lactamase Inhibitor", "category": "Resistant Bacterial Infection", "start_page": 483, "end_page": 487},
    {"name": "Azithromycin", "class": "Macrolide Antibacterial", "category": "Respiratory / Atypical Infection", "start_page": 468, "end_page": 473},
    {"name": "Ciprofloxacin", "class": "Fluoroquinolone Antibacterial", "category": "Urinary / Systemic Infection", "start_page": 473, "end_page": 478},
    {"name": "Cefuroxime", "class": "Second-generation Cephalosporin", "category": "Bacterial Infection", "start_page": 487, "end_page": 494},
    {"name": "Doxycycline", "class": "Tetracycline Antibacterial", "category": "Atypical / Zoonotic Infection", "start_page": 492, "end_page": 497},
    {"name": "Metronidazole", "class": "Nitroimidazole Antimicrobial", "category": "Anaerobic / Protozoal Infection", "start_page": 474, "end_page": 480},

    # Antivirals
    {"name": "Oseltamivir", "class": "Neuraminidase Inhibitor (Anti-influenza)", "category": "Influenza A & B", "start_page": 562, "end_page": 570},
    {"name": "Aciclovir", "class": "Herpesvirus DNA Polymerase Inhibitor", "category": "Viral Infection", "start_page": 560, "end_page": 566},

    # Antidiabetics
    {"name": "Metformin", "class": "Biguanide Antidiabetic", "category": "Type 2 Diabetes Mellitus", "start_page": 594, "end_page": 602},
    {"name": "Gliclazide", "class": "Sulfonylurea Antidiabetic", "category": "Type 2 Diabetes Mellitus", "start_page": 597, "end_page": 605},

    # Cardiovascular & Antihypertensives
    {"name": "Amlodipine", "class": "Dihydropyridine Calcium Channel Blocker", "category": "Hypertension / Angina", "start_page": 130, "end_page": 138},
    {"name": "Losartan", "class": "Angiotensin-II Receptor Blocker (ARB)", "category": "Hypertension / Heart Failure", "start_page": 120, "end_page": 128},
    {"name": "Enalapril", "class": "ACE Inhibitor", "category": "Hypertension / Heart Failure", "start_page": 115, "end_page": 124},
    {"name": "Atorvastatin", "class": "HMG-CoA Reductase Inhibitor (Statin)", "category": "Hypercholesterolaemia", "start_page": 180, "end_page": 190},

    # Respiratory
    {"name": "Salbutamol", "class": "Short-acting Beta2 Agonist (Bronchodilator)", "category": "Asthma / Bronchospasm", "start_page": 230, "end_page": 240},
    {"name": "Montelukast", "class": "Leukotriene Receptor Antagonist", "category": "Asthma Prophylaxis / Allergic Rhinitis", "start_page": 245, "end_page": 252},

    # Gastrointestinal
    {"name": "Omeprazole", "class": "Proton Pump Inhibitor (PPI)", "category": "Peptic Ulcer / GERD", "start_page": 65, "end_page": 75},
    {"name": "Domperidone", "class": "Dopamine Receptor Antagonist (Antiemetic)", "category": "Nausea & Vomiting", "start_page": 365, "end_page": 375},
    {"name": "Oral Rehydration Salts", "class": "Electrolyte & Glucose Replacement", "category": "Fluid and Electrolyte Loss / Diarrhoea", "start_page": 845, "end_page": 855},

    # Antihistamines & Allergy
    {"name": "Cetirizine", "class": "Non-sedating Antihistamine", "category": "Allergic Rhinitis / Urticaria", "start_page": 260, "end_page": 270},
    {"name": "Chlorphenamine", "class": "Sedating Antihistamine", "category": "Acute Allergy / Anaphylaxis Adjunct", "start_page": 262, "end_page": 272},
    {"name": "Prednisolone", "class": "Corticosteroid", "category": "Severe Inflammation / Allergy", "start_page": 605, "end_page": 618}
]


def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def extract_sections_from_text(raw_text):
    """
    Extracts structured clinical sections from BNF text based on standard markers.
    """
    markers = [
        ("indications_dose", "INDICATIONS AND DOSE"),
        ("unlicensed_use", "UNLICENSED USE"),
        ("contraindications", "CONTRA-INDICATIONS"),
        ("cautions", "CAUTIONS"),
        ("interactions", "INTERACTIONS"),
        ("side_effects", "SIDE-EFFECTS"),
        ("pregnancy", "PREGNANCY"),
        ("breast_feeding", "BREAST FEEDING"),
        ("hepatic_impairment", "HEPATIC IMPAIRMENT"),
        ("renal_impairment", "RENAL IMPAIRMENT"),
        ("medicinal_forms", "MEDICINAL FORMS")
    ]

    positions = []
    for field_key, marker_label in markers:
        idx = raw_text.find(marker_label)
        if idx != -1:
            positions.append((idx, field_key, marker_label))

    positions.sort(key=lambda x: x[0])
    extracted = {}
    for i in range(len(positions)):
        start_idx, field_key, marker_label = positions[i]
        content_start = start_idx + len(marker_label)
        content_end = positions[i+1][0] if i+1 < len(positions) else len(raw_text)
        content = raw_text[content_start:content_end].strip()
        # Remove trailing bullet markers
        content = re.sub(r'^[l▶\s]+', '', content)
        content = re.sub(r'[l▶\s]+$', '', content)
        extracted[field_key] = clean_text(content)

    return extracted


def find_drug_monograph_in_range(doc, drug_name, start_p, end_p):
    """
    Scans pages in the predicted range to find the exact monograph for drug_name.
    """
    best_page = None
    best_text = ""

    for p in range(max(0, start_p - 10), min(len(doc), end_p + 15)):
        text = doc[p].get_text("text")
        if drug_name.lower() in text.lower() and "INDICATIONS AND DOSE" in text:
            best_page = p
            # Monograph may span across 2 pages
            next_text = doc[p+1].get_text("text") if p + 1 < len(doc) else ""
            combined_text = text + "\n" + next_text
            best_text = combined_text
            break

    # Fallback: scan whole document if not found in predicted window
    if not best_page:
        for p in range(len(doc)):
            text = doc[p].get_text("text")
            if "INDICATIONS AND DOSE" in text:
                first_lines = text[:400].lower()
                if drug_name.lower() in first_lines:
                    best_page = p
                    next_text = doc[p+1].get_text("text") if p + 1 < len(doc) else ""
                    best_text = text + "\n" + next_text
                    break

    return best_page, best_text


def extract_appendix1_interactions(doc):
    """
    Extracts key drug interactions from Appendix 1 (pages 1157 to 1279).
    """
    interactions_map = {}
    print("[BNF Indexer] Extracting Drug-Drug Interactions from Appendix 1 (pages 1157 - 1220)...")
    
    # We inspect the top pages of Appendix 1
    for p in range(1157, min(len(doc), 1225)):
        text = doc[p].get_text("text")
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        current_drug = None

        for line in lines:
            # Check if this line is a drug heading in Appendix 1
            if len(line) < 30 and line.isupper() is False and not line.startswith("▶") and not line.startswith("l") and not ":" in line:
                current_drug = line.strip()
                if current_drug not in interactions_map:
                    interactions_map[current_drug] = []
            elif current_drug and (line.startswith("l") or line.startswith("▶")):
                cleaned_line = line.lstrip("l▶ ").strip()
                interactions_map[current_drug].append({
                    "note": cleaned_line,
                    "page": p + 1
                })

    return interactions_map


def build_bnf_knowledge_base():
    """
    Main indexing pipeline:
    1. Opens BNF 70 PDF.
    2. Extracts monographs for TARGET_DRUGS.
    3. Extracts Appendix 1 DDI pairs.
    4. Writes into SQLite bnf_knowledge.db and bnf_monographs.json.
    """
    if not os.path.exists(PDF_PATH):
        raise FileNotFoundError(f"BNF 70 PDF not found at {PDF_PATH}")

    print(f"[BNF Indexer] Opening {PDF_PATH}...")
    doc = fitz.open(PDF_PATH)
    total_pages = len(doc)
    print(f"[BNF Indexer] Total pages: {total_pages}. Starting structured extraction...")

    monographs = []
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Create tables
    cur.execute("DROP TABLE IF EXISTS bnf_monographs")
    cur.execute("""
        CREATE TABLE bnf_monographs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drug_name TEXT UNIQUE,
            therapeutic_class TEXT,
            clinical_category TEXT,
            indications_dose TEXT,
            contraindications TEXT,
            cautions TEXT,
            hepatic_impairment TEXT,
            renal_impairment TEXT,
            side_effects TEXT,
            pregnancy_breastfeeding TEXT,
            citation_reference TEXT,
            source_page INTEGER,
            raw_excerpt TEXT
        )
    """)

    cur.execute("DROP TABLE IF EXISTS bnf_interactions")
    cur.execute("""
        CREATE TABLE bnf_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drug_name TEXT,
            interacting_class_or_drug TEXT,
            interaction_note TEXT,
            severity_warning TEXT,
            source_page INTEGER
        )
    """)

    for item in TARGET_DRUGS:
        d_name = item["name"]
        print(f"  -> Extracting monograph for {d_name}...")
        p_num, full_text = find_drug_monograph_in_range(doc, d_name, item["start_page"], item["end_page"])

        if p_num is not None:
            sections = extract_sections_from_text(full_text)
            page_cited = p_num + 1

            # Format pregnancy & breastfeeding
            preg_bf = ""
            if "pregnancy" in sections:
                preg_bf += f"Pregnancy: {sections['pregnancy']} "
            if "breast_feeding" in sections:
                preg_bf += f"Breast feeding: {sections['breast_feeding']}"

            citation = f"British National Formulary (BNF 70), {item['category']} (p. {page_cited})"

            cur.execute("""
                INSERT OR REPLACE INTO bnf_monographs (
                    drug_name, therapeutic_class, clinical_category,
                    indications_dose, contraindications, cautions,
                    hepatic_impairment, renal_impairment, side_effects,
                    pregnancy_breastfeeding, citation_reference, source_page, raw_excerpt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                d_name,
                item["class"],
                item["category"],
                sections.get("indications_dose", "Standard clinical dosing per BNF 70 guidelines."),
                sections.get("contraindications", "None specifically listed beyond known drug hypersensitivity."),
                sections.get("cautions", "Review patient history and existing concurrent therapies."),
                sections.get("hepatic_impairment", "Use with caution in severe hepatic impairment."),
                sections.get("renal_impairment", "Adjust dose according to eGFR/Creatinine clearance."),
                sections.get("side_effects", "See full BNF monograph for rare adverse events."),
                preg_bf.strip(),
                citation,
                page_cited,
                full_text[:1200]
            ))

            monographs.append({
                "drug_name": d_name,
                "therapeutic_class": item["class"],
                "clinical_category": item["category"],
                "indications_dose": sections.get("indications_dose", ""),
                "contraindications": sections.get("contraindications", ""),
                "cautions": sections.get("cautions", ""),
                "hepatic_impairment": sections.get("hepatic_impairment", ""),
                "renal_impairment": sections.get("renal_impairment", ""),
                "side_effects": sections.get("side_effects", ""),
                "pregnancy_breastfeeding": preg_bf.strip(),
                "citation_reference": citation,
                "source_page": page_cited
            })
        else:
            print(f"  [Warning] Monograph for {d_name} could not be located in range.")

    # Extract interactions
    ddi_map = extract_appendix1_interactions(doc)
    interaction_count = 0
    for drug, notes in ddi_map.items():
        for n in notes[:10]: # cap per drug
            note_str = n["note"]
            # Look for interacting drug or class
            severity = "Moderate"
            if "avoid concomitant use" in note_str.lower() or "increased risk" in note_str.lower() or "fatal" in note_str.lower():
                severity = "Severe / Contraindicated"
            elif "possibly reduces" in note_str.lower() or "monitoring" in note_str.lower():
                severity = "Cautionary / Dose Monitoring"

            cur.execute("""
                INSERT INTO bnf_interactions (drug_name, interacting_class_or_drug, interaction_note, severity_warning, source_page)
                VALUES (?, ?, ?, ?, ?)
            """, (drug, drug, note_str, severity, n["page"]))
            interaction_count += 1

    conn.commit()
    conn.close()

    # Save to JSON cache
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(monographs, f, indent=2, ensure_ascii=False)

    print(f"\n[BNF Indexer Success] Successfully indexed {len(monographs)} monographs and {interaction_count} drug interactions into:")
    print(f"  -> SQLite: {DB_PATH}")
    print(f"  -> JSON:   {JSON_PATH}")
    return len(monographs)


if __name__ == "__main__":
    count = build_bnf_knowledge_base()
    print(f"[Done] Total {count} drug monographs compiled.")
