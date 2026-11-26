import re


def tokenize_sinhala_sentence(raw_text):
    """
    සිංහල කථන සායනික සාකච්ඡාව (Doctor-Patient Speech) තනි තනි වාක්‍ය සහ දෙබස් පියවර වලට කඩයි.
    Punctuation නැති කථන අඛණ්ඩ ශබ්ද පවා ස්වයංක්‍රීයව හඳුනාගෙන වෙන් කරයි.
    """
    if not raw_text or not isinstance(raw_text, str):
        return []

    text = raw_text

    # 1. Punctuation marks
    text = re.sub(r'[?!\n.]+', ' |SPLIT| ', text)

    # 2. Sinhala Conjunction delimiters
    text = re.sub(r'\s+(?:ඒත්|නමුත්|හැබැයි|ඒ වුණාට|ඒ උනාට|ඒ වගේම|ඊට අමතරව|ඒ නිසා|ඒක නිසා|අනික|මීට අමතරව)\s+', ' |SPLIT| ', text)

    # 3. Doctor discourse markers before questions or symptoms (e.g. 'එතකොට', 'හරි', 'හොඳයි')
    text = re.sub(r'\s+(?=(?:එතකොට|එහෙනම්|එහෙමනම්)\s+)', ' |SPLIT| ', text)
    text = re.sub(r'\s+(?:හරි|හොඳයි|හා)\s+(?=[^|]+(?:ද|ද\?|\?))', ' |SPLIT| ', text)

    # 4. Spoken Doctor Question verbs ending in 'ද' / 'ද?'
    q_verbs = r'(?:තියෙනවද|තිබ්බද|ආවද|ගියාද|වුණාද|දැනුණද|වෙනවද|වැඩිවෙනවද|අඩුවෙනවද|එනවද|කැස්සද|අමාරුද|බැලුවද|බිව්වද|පුළුවන්ද|පුලුවන්ද|කරාද|ගත්තද|නැද්ද|එහෙමද|නේද)(?:\s+ඔයාට)?'
    text = re.sub(rf'({q_verbs})\s+', r'\1 |SPLIT| ', text)

    # 5. Spoken Question-to-Answer boundaries (e.g., 'තිබ්බද ඔයාට නෑ' -> 'තිබ්බද ඔයාට |SPLIT| නෑ')
    text = re.sub(r'((?:තිබ්බද|ගියාද|තියෙනවද|වුණාද|ආවද|කැස්සද|අමාරුද|බැලුවද|බිව්වද)(?:\s+ඔයාට)?)\s+(?=(?:නෑ|නැහැ|ඔව්)(?:[,\s]|$))', r'\1 |SPLIT| ', text)

    # 6. Doctor examination imperatives followed by another action or pause
    text = re.sub(r'(\b(?:පෙන්නන්නකෝ|පෙන්නන්නකො|පෙන්නන්න|දිව පෙන්නන්න|ඇස් අරින්න|කට අරින්න|කැහැලා පෙන්නන්න|කැහැල පෙන්නන්න))\s+', r'\1 |SPLIT| ', text)

    sentences = [s.strip() for s in text.split('|SPLIT|') if s.strip()]
    return sentences



DOCTOR_INDICATORS = [
    "මොකක්ද", "කොහොමද", "කවද්ද", "කොහෙද", "තියෙනවද", "වුණාද", "ගියාද", "තිබ්බද", "ආවද", "දැනුණද",
    "වාඩිවෙන්න", "දිව පෙන්නන්න", "හුස්ම ගන්න", "ඇස් අරින්න", "කට අරින්න", "බෙහෙත් බිව්වද", 
    "බෙහෙත් ගත්තද", "බැලුවද", "අමාරුද", "මොනවද අමාරු", "මොකද වෙලා තියෙන්නේ",
    "කොච්චර කල්ද", "ඇලජි තියෙනවද", "කැස්සක් තියෙනවද", "උණ බැලුවද", "හොදට හුස්ම ගන්න",
    "පරීක්ෂා කරමු", "බෙහෙත් ලියන්නම්", "රෙස්ට් කරන්න", "ලෙසට බිව්වද", "නැවතුණාද", "ඔයාට", "ඔබට",
    "වැඩිවෙනවද", "අඩුවෙනවද", "වෙනවද", "එනවද", "පුළුවන්ද", "පුලුවන්ද", "කරාද", "ගත්තද",
    "පෙන්නන්නකෝ", "පෙන්නන්නකො", "පෙන්නන්න", "කැහැලා පෙන්නන්න", "කැහැල පෙන්නන්න", "අහන්න", "අහින්න", "අහලා", "ඉන්න", "බලන්න",
    "තිබ්බනම්", "තියෙනවනම්", "වුණානම්", "ආවනම්", "එතකොට"
]

PATIENT_INDICATORS = [
    "ඩොක්ටර්", "දොස්තර", "මට", "මගේ", "මම", "අමාරුයි", "කැක්කුමයි", "රිදෙනවා", 
    "ඔව්", "නෑ", "නැහැ", "දවස්", "ඊයේ ඉඳන්", "රෑ ඉඳන්", "ඇඟට පණ නෑ", "බෑ", 
    "කන්න බෑ", "වමනෙ දැම්මා", "සෙම එනවා", "නැගිටින්න බෑ", "මහත්තයෝ", "හිටියේ",
    "අමාරුවක්", "කැක්කුමක්", "වේදනාවක්", "තියෙනවා", "අපහසුයි", "අමාරුවෙන්", "හිතාගන්න බෑ"
]

def classify_speaker(sentence, previous_speaker=None):
    """
    වාක්‍යයක ඇති වචන රටාව සහ Dialogue Turn Flow අනුව 
    කතා කරන්නේ Doctor ද Patient ද යන්න තීරණය කරයි.
    """
    s_clean = sentence.strip()

    # 1. Explicit tags if present
    if s_clean.startswith("ඩොක්ටර්:") or s_clean.startswith("Doctor:") or s_clean.startswith("වෛද්‍යවරයා:"):
        return "doctor"
    if s_clean.startswith("රෝගියා:") or s_clean.startswith("Patient:"):
        return "patient"

    doc_score = sum(1 for word in DOCTOR_INDICATORS if word in s_clean)
    pat_score = sum(1 for word in PATIENT_INDICATORS if word in s_clean)

    # Doctor questions: ANY question particle / verb in sentence
    q_matches = len(re.findall(r'(?:ද|ද\?|\?)\b', s_clean))
    doc_score += q_matches * 3

    # Doctor questions ending sentence
    if re.search(r'(?:ද|ද\?|\?)(?:\s+ඔයාට)?\s*$', s_clean):
        doc_score += 3

    # Doctor physical examination instructions & imperatives
    if re.search(r'(?:පෙන්නන්නකෝ|පෙන්නන්නකො|පෙන්නන්න|අරින්න|අරින්නකෝ|අහන්න|අහින්න|ඉන්න|බලන්න|වාඩිවෙන්න)\b', s_clean):
        doc_score += 4

    # Doctor discourse starters (එතකොට, එහෙනම්, හරි)
    if s_clean.startswith("එතකොට") or s_clean.startswith("එහෙනම්") or s_clean.startswith("හරි"):
        doc_score += 3

    # Addressing the doctor ("ඩොක්ටර් ...", "දොස්තර මහත්තයා ...") is spoken by PATIENT
    if "ඩොක්ටර්" in s_clean or "දොස්තර" in s_clean or "මහත්තයෝ" in s_clean:
        pat_score += 3

    # First-person patient expressions ("මට", "මගේ", "මම", "අමාරුවක්", "කැක්කුමක්", "අමාරුවෙන්")
    if any(w in s_clean for w in ["මට", "මගේ", "මම", "හිටියේ", "අමාරුවක්", "කැක්කුමක්", "රිදෙනවා", "පණ නෑ", "අමාරුවෙන්"]):
        pat_score += 3

    if doc_score > pat_score:
        return "doctor"
    elif pat_score > doc_score:
        return "patient"
    else:
        # Default persistence: if previous speaker was patient, continue as patient unless clearly doctor!
        return previous_speaker if previous_speaker else "patient"



PURE_DENIAL_WORDS = [
    "නෑ", "නැහැ", "නැත", "එහෙම නෑ", "නෑ ඩොක්ටර්", "නෑ නෑ", 
    "ගියේ නෑ", "ආවේ නෑ", "නොවේ", "කිසිම කැක්කුමක් නෑ", "නැහැ ඩොක්ටර්"
]

AFFIRMATION_WORDS = [
    "ඔව්", "ඔව් ඩොක්ටර්", "තියෙනවා", "ගියා", "දැම්මා", "ඇත්තටම", 
    "ඔව් තියෙනවා", "ගොඩක් රිදෙනවා", "පුපුරන්න වගේ"
]

AFFIRMATIVE_IDIOMS = [
    "පණ නෑ", "කන්න බෑ", "බඩගිනි නෑ", "නැගිටින්න බෑ", "ඉන්න බෑ", 
    "කෑම අප්පිරිය", "ඇඟට පණ නෑ"
]

def is_pure_denial(text):
    """රෝගියා තනි කෙටි වාක්‍යයකින් ප්‍රශ්නයක් සම්පූර්ණයෙන්ම ප්‍රතික්ෂේප කළේදැයි බලයි"""
    cleaned = text.strip()
    return cleaned in PURE_DENIAL_WORDS or cleaned.startswith("නෑ") or cleaned.startswith("නැහැ")

def is_affirmed(text):
    """රෝගියා රෝග ලක්ෂණයක් තහවුරු කළේදැයි බලයි (e.g. 'ඔව් ඩොක්ටර්')"""
    return any(aff in text for aff in AFFIRMATION_WORDS)

def check_symptom_negated(sentence, phrase):
    """
    වාක්‍යයක ඇති නිශ්චිත රෝග ලක්ෂණය (Symptom Phrase) ප්‍රතික්ෂේප කර ඇත්දැයි බලයි.
    'ඇඟට පණ නෑ' වැනි Affirmative idioms වල 'නෑ' තිබුණද ඒවා Positive ලෙස රැක ගනී.
    """
   
    for idiom in AFFIRMATIVE_IDIOMS:
        if idiom in phrase or (phrase in idiom and idiom in sentence):
            return False

    idx = sentence.find(phrase)
    if idx == -1:
        return False

    after_text = sentence[idx + len(phrase): idx + len(phrase) + 35]
    before_text = sentence[max(0, idx - 20): idx]

    # 1. Immediate negative particles after phrase (e.g. "නෑ", "නැහැ", "නැත", "නොවේ")
    # Supports Sinhala conjunction suffixes: 'ක්' (උණක් නෑ), 'ත්' (කැක්කුමත් නෑ), 'කුත්' (කැක්කුමකුත් නෑ), 'වත්' (උණවත් නෑ)
    neg_after = re.search(r'^(?:\s*(?:ක්|ත්|කුත්|වත්))?(?:\s*(?:නම්|නම්\s+ගියේ|ගියේ|ආවේ|එහෙම|කියලා\s*එකක්|තියෙනවා\s*කියලා\s*එකක්)?)\s*(?:නෑ|නැහැ|නැත|නැති|නොවේ)', after_text)
    
    # 2. Broader check in after_text if "නෑ" or "නැහැ" is present within 3 words after symptom
    if not neg_after:
        tokens_after = [w.strip(".,?!") for w in after_text.strip().split()[:4]]
        if any(w in ["නෑ", "නැහැ", "නැත", "නොවේ", "නැති"] for w in tokens_after):
            neg_after = True

    # 3. Negative particles before phrase (e.g. "නෑ ඩොක්ටර් වමනෙ")
    neg_before = re.search(r'(?:නෑ|නැහැ|නොවේ)\s*(?:ඩොක්ටර්\s*)?$', before_text)

    return bool(neg_after or neg_before)



DURATION_REGEX = r'(?:දවස්\s*(?:\d+|එකක්|දෙකක්|තුනක්|හතරක්|පහක්|හයක්|හතක්)\s*(?:ක්|තිස්සේ|ඉඳන්)?)|(?:ඊයේ\s*(?:රෑ\s*)?ඉඳන්)|(?:සතියක\s*ඉඳන්)|(?:පෙරේදා\s*ඉඳන්)'

def extract_duration(text):
    """රෝගියා ලෙඩේ තිබුණු කාලය පැවසුවහොත් එය extract කරයි"""
    match = re.search(DURATION_REGEX, text)
    return match.group(0).strip() if match else "Not specified"



COMMON_SINHALA_SYMPTOMS = {
    "high_fever": [
        "තද උණ", "උණ", "ඇඟ රස්නෙයි", "ඇඟ පිච්චෙනවා", "ගිනි රස්නෙයි", "උන", "උණක්", "උණ සහිත", "සහිත උණ", "විස", "දවස් තුනක් විස", "una", "thada una"
    ],
    "mild_fever": [
        "මද උණ", "පොඩි උණක්", "ඇඟේ රස්නයක්"
    ],
    "headache": [
        "ඔළුව කැක්කුම", "හිසරදය", "ඔළුව රිදෙනවා", "ඔලුව කැක්කුම", "ඔලුව රිදෙනවා", "හිස කැක්කුම", "ඔළුවේ අමාරුව", "ඔලුවේ අමාරුව", "ඔළුවේ කැක්කුම", "ඔලුවේ කැක්කුම", "ඔළුව අමාරුයි", "oluwa kakkuma"
    ],
    "vomiting": [
        "වමනය", "වමනෙ", "වමනෙ යනවා", "වමනෙ දැම්මා", "වමනෙ ගියා", "wamane"
    ],
    "nausea": [
        "ඔක්කාරය", "වමනෙ දාන්න වගේ", "කැරකිල්ල වගේ"
    ],
    "stomach_pain": [
        "බඩ රිදෙනවා", "බඩේ කැක්කුම", "බඩ කැක්කුම", "ගැස්ට්‍රික්", "බඩ අමාරුව", "බඩේ අමාරුව", "බඩ අමාරුවක්", "බඩේ අමාරුවක්", "බඩ අමාරුවකුත්", "බඩේ අමාරුවකුත්", "බඩේ වේදනාව", "බඩ දැවිල්ල", "bade kakkuma"
    ],
    "abdominal_pain": [
        "යටිබඩ රිදෙනවා", "යටිබඩ කැක්කුම"
    ],
    "cough": [
        "කැස්ස", "වියළි කැස්ස", "කැස්සයි", "කැස්සක්", "වියළි කැස්සක්", "හොඳටම කැස්ස", "කැසුම්", "කැසුකි", "කැසු", "කැහුම", "කැස", "කැහැලා", "kassa", "kassai"
    ],
    "breathlessness": [
        "හුස්ම ගන්න අමාරුයි", "හුස්ම ගැනීමේ අපහසුව", "ඇදුම", "මහන්සියි හුස්ම ගන්න"
    ],
    "throat_irritation": [
        "උගුර රිදෙනවා", "උගුර කනවා", "උගුරේ දැවිල්ල", "ගිලින්න අමාරුයි", "උගුරේ අමාරුව", "උගුර අමාරුයි"
    ],
    "runny_nose": [
        "හොටු දියර", "නාසයෙන් දියර ගැලීම", "පීනස", "හොටු", "නාසයෙන් සොටු දියර", "නාසයෙන් සොටු දීර්ඝත්", "සොටු දියර", "සොටු", "සොටු දීර්ඝත්"
    ],
    "congestion": [
        "නාසය හිරවීම", "හොටු හිරවීම", "නාසය බ්ලොක්"
    ],
    "continuous_sneezing": [
        "කිවිසුම් යාම", "කිවිසුම් යනවා දිගටම", "කිවිසුම්", "කිවිසුම", "කැරිසුම්", "විසුම්"
    ],
    "phlegm": [
        "සෙම", "කැස්ස එක්ක සෙම", "සෙම කැස්ස", "sema"
    ],
    "fatigue": [
        "මහන්සියි", "පණ නෑ", "අධික තෙහෙට්ටුව", "ඇඟට පණ නෑ", "තෙහෙට්ටුයි", "පැණ නෑ", "පැනා නෑ", "රැමට පැනා", "පණ නැහැ", "මහන්සියක්"
    ],
    "muscle_pain": [
        "ඇඟපත රිදිල්ල", "ඇඟ රිදෙනවා", "ඇඟපත වේදනාව", "ඇඟ කැක්කුම", "ඇඟේ අමාරුව", "ඇඟපත අමාරුව", "ඇඟේ කැක්කුම", "ඇඟේ වේදනාව", "ඇඟපත කැක්කුම"
    ],
    "joint_pain": [
        "හන්දිපත් රුදාව", "හන්දි රිදෙනවා", "දණහිස් කැක්කුම", "හන්දිපත් කැක්කුම", "හන්දි අමාරුව", "හන්දිපත් අමාරුව", "හන්දි කැක්කුම", "දණහිස් අමාරුව"
    ],
    "back_pain": [
        "කොන්ද රිදෙනවා", "කොන්දේ කැක්කුම", "කොන්ද කැක්කුම", "කොන්දේ අමාරුව", "කොන්ද අමාරුව", "කොන්දෙ අමාරුව", "කොන්දේ අමාරුවක්", "කොන්ද අමාරුවක්", "කොන්දේ වේදනාව", "කොන්දෙ කැක්කුම"
    ],
    "chills": [
        "සීතලයි", "සීතල ගැහීම", "සීතල", "seethalai"
    ],
    "shivering": [
        "වෙවුලුම", "වෙවුලනවා", "ගැහෙනවා"
    ],
    "diarrhoea": [
        "බඩ බුරුල්", "දියර මළපහ", "බඩ යනවා", "bada yanawa"
    ],
    "loss_of_appetite": [
        "කෑම අප්පිරියාව", "කන්න බෑ", "බඩගිනි නෑ", "කෑම කන්න ප්‍රිය නෑ", "කෑම අප්පිරියයි"
    ],
    "itching": [
        "ඇඟ කැසීම", "කැසිල්ල", "ඇඟ කසනවා", "කැසීම"
    ],
    "skin_rash": [
        "පලු දැමීම", "බිබිලි", "සමේ ලප", "පලු දාලා", "රතු ලප"
    ],
    "dizziness": [
        "කැරකිල්ල", "කරකැවිල්ල", "හිස කරකැවිල්ල"
    ],
    "chest_pain": [
        "පපුව රිදෙනවා", "පපුවේ කැක්කුම", "පපුවේ තද ගතිය", "පපුව දැවිල්ල", "තද ගතියක්", "තද ගතියකුත්", "තද ගතිය", "පපුව තද වීම"
    ],
    "yellowish_skin": [
        "සම කහ වීම", "කහ පැහැවීම", "සම කහ වෙලා", "කහ පාට සම"
    ],
    "yellowing_of_eyes": [
        "ඇස් කහ වීම", "ඇස් කහ පාටයි", "ඇස් කහ පාට"
    ]
}

def find_symptoms_in_text(text):

    detected = []
    text_lower = text.lower()
    for symptom_key, phrases in COMMON_SINHALA_SYMPTOMS.items():
        for phrase in phrases:
            if phrase in text_lower:
                detected.append((symptom_key, phrase))
                break
    return detected



def parse_clinical_dialogue(transcript):
    
    sentences = tokenize_sinhala_sentence(transcript)

    dialogue_turns = []
    confirmed_positive = set()
    negated = set()
    duration = "Not specified"

    prev_speaker = None
    last_doctor_symptoms = []

    for s in sentences:
        speaker = classify_speaker(s, prev_speaker)
        prev_speaker = speaker

        dialogue_turns.append({"speaker": speaker, "text": s})

        
        dur = extract_duration(s)
        if dur != "Not specified" and duration == "Not specified":
            duration = dur

        detected_matches = find_symptoms_in_text(s)
        detected_sym_keys = [sym_key for sym_key, _ in detected_matches]

        if speaker == "doctor":
         
            last_doctor_symptoms = detected_sym_keys

        elif speaker == "patient":
            
            if is_pure_denial(s):
                for sym in last_doctor_symptoms:
                    negated.add(sym)

            
            for sym_key, phrase in detected_matches:
                if check_symptom_negated(s, phrase):
                    negated.add(sym_key)
                else:
                    confirmed_positive.add(sym_key)

          
            if is_affirmed(s):
                for sym in last_doctor_symptoms:
                    confirmed_positive.add(sym)

          
            last_doctor_symptoms = []

   
    final_positive = [sym for sym in confirmed_positive if sym not in negated]

    patient_speech = " ".join([t["text"] for t in dialogue_turns if t["speaker"] == "patient"])
    doctor_speech = " ".join([t["text"] for t in dialogue_turns if t["speaker"] == "doctor"])
    doctor_questions = [t["text"] for t in dialogue_turns if t["speaker"] == "doctor"]

    return {
        "dialogue": dialogue_turns,
        "positive_symptoms": final_positive,
        "negated_symptoms": list(negated),
        "duration": duration,
        "patient_speech_combined": patient_speech,
        "doctor_speech_combined": doctor_speech,
        "doctor_questions": doctor_questions
    }


