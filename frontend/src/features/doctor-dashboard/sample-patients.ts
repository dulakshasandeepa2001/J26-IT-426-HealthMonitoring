// Existing dashboard demonstration data. These are not clinical records.

export interface PastMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface PastPrescription {
  id: string;
  date: string;
  doctor: string;
  clinic: string;
  diagnosis: string;
  medicines: PastMedication[];
  notes?: string;
  receiptNumber: string;
}

export interface Patient {
  id: string;
  token: string;
  name: string;
  age: number;
  gender: string;
  bloodGroup: string;
  allergies: string[];
  complaint: string;
  labHistory: string[];
  time: string;
  pastPrescriptions: PastPrescription[];
}

export const SAMPLE_QUEUE: Patient[] = [
  {
    id: "PAT-101",
    token: "#01",
    name: "Kasun Perera",
    age: 34,
    gender: "Male",
    bloodGroup: "O+",
    allergies: ["Penicillin", "Aspirin"],
    complaint: "High fever (>38.5°C), persistent dry cough, body aches for 3 days.",
    labHistory: ["FBC (Platelets: 165,000 /μL - Borderline)", "Dengue NS1 Antigen: Negative (Day 2)", "CRP: 18 mg/L"],
    time: "09:15 AM",
    pastPrescriptions: [
      {
        id: "RX-2026-881",
        receiptNumber: "REC-0881",
        date: "14 Aug 2026",
        doctor: "Dr. Nimal Silva",
        clinic: "MediTrack Outpatient Clinic",
        diagnosis: "Acute Bronchitis",
        medicines: [
          { name: "Azithromycin 500mg", dosage: "1 Tablet", frequency: "OD (Once daily)", duration: "3 Days" },
          { name: "Salbutamol Inhaler 100mcg", dosage: "2 Puffs", frequency: "PRN (When needed)", duration: "As required" },
          { name: "Cetirizine 10mg", dosage: "1 Tablet", frequency: "Nocte (At bedtime)", duration: "5 Days" }
        ],
        notes: "Advised chest X-ray if persistent coughing exceeds 10 days. Ensure oral rehydration."
      },
      {
        id: "RX-2026-412",
        receiptNumber: "REC-0412",
        date: "02 May 2026",
        doctor: "Dr. K. Perera",
        clinic: "General Medical OPD",
        diagnosis: "Viral Pharyngitis",
        medicines: [
          { name: "Paracetamol 500mg", dosage: "2 Tablets", frequency: "TDS (Every 8h)", duration: "3 Days" },
          { name: "Chlorpheniramine 4mg", dosage: "1 Tablet", frequency: "BD (Twice daily)", duration: "3 Days" }
        ],
        notes: "Warm saline gargle 3 times a day. Rest recommended."
      },
      {
        id: "RX-2026-105",
        receiptNumber: "REC-0105",
        date: "10 Jan 2026",
        doctor: "Dr. S. Jayasinghe",
        clinic: "ENT Specialized Unit",
        diagnosis: "Seasonal Allergic Rhinitis",
        medicines: [
          { name: "Montelukast 10mg", dosage: "1 Tablet", frequency: "Nocte", duration: "14 Days" },
          { name: "Fluticasone Nasal Spray", dosage: "1 Spray/nostril", frequency: "BD", duration: "1 Month" }
        ],
        notes: "Avoid dust allergens and air conditioner draft."
      }
    ]
  },
  {
    id: "PAT-102",
    token: "#02",
    name: "Nimali Fernando",
    age: 28,
    gender: "Female",
    bloodGroup: "A+",
    allergies: ["Sulfa Drugs"],
    complaint: "Throbbing frontal headache, sinus pressure, nasal congestion.",
    labHistory: ["Past Blood Pressure: 118/76 mmHg", "No chronic conditions recorded"],
    time: "09:30 AM",
    pastPrescriptions: [
      {
        id: "RX-2026-620",
        receiptNumber: "REC-0620",
        date: "20 Jul 2026",
        doctor: "Dr. R. Silva",
        clinic: "MediTrack General Clinic",
        diagnosis: "Acute Frontal Sinusitis",
        medicines: [
          { name: "Amoxicillin-Clavulanate 625mg", dosage: "1 Tablet", frequency: "BD (Twice daily)", duration: "5 Days" },
          { name: "Pseudoephedrine 30mg", dosage: "1 Tablet", frequency: "TDS", duration: "4 Days" }
        ],
        notes: "Steam inhalation recommended twice daily."
      },
      {
        id: "RX-2026-190",
        receiptNumber: "REC-0190",
        date: "15 Feb 2026",
        doctor: "Dr. W.G. Dulaksha",
        clinic: "MediTrack Outpatient Clinic",
        diagnosis: "Tension Headache",
        medicines: [
          { name: "Paracetamol 500mg", dosage: "1-2 Tablets", frequency: "PRN (As needed)", duration: "3 Days" },
          { name: "Vitamin B-Complex", dosage: "1 Tablet", frequency: "OD", duration: "1 Month" }
        ],
        notes: "Improve sleep hygiene and reduce screen exposure."
      }
    ]
  },
  {
    id: "PAT-103",
    token: "#03",
    name: "Mohamed Rizwan",
    age: 52,
    gender: "Male",
    bloodGroup: "B+",
    allergies: ["None known"],
    complaint: "Routine Type-2 Diabetes follow up, mild peripheral numbness.",
    labHistory: ["HbA1c: 7.2% (Last month)", "FBS: 138 mg/dL", "Serum Creatinine: 1.0 mg/dL"],
    time: "09:45 AM",
    pastPrescriptions: [
      {
        id: "RX-2026-904",
        receiptNumber: "REC-0904",
        date: "28 Aug 2026",
        doctor: "Dr. C. Fernando",
        clinic: "Endocrine & Diabetes Care Center",
        diagnosis: "T2DM Regular Review",
        medicines: [
          { name: "Metformin 500mg", dosage: "1 Tablet", frequency: "BD (After meals)", duration: "3 Months" },
          { name: "Glimepiride 1mg", dosage: "1 Tablet", frequency: "Mane (Morning)", duration: "3 Months" }
        ],
        notes: "Strict dietary carbohydrate moderation. Fasting lipid profile due next visit."
      },
      {
        id: "RX-2026-550",
        receiptNumber: "REC-0550",
        date: "12 Jun 2026",
        doctor: "Dr. W.G. Dulaksha",
        clinic: "MediTrack OPD",
        diagnosis: "Diabetic Neuropathy Early Signs",
        medicines: [
          { name: "Pregabalin 50mg", dosage: "1 Capsule", frequency: "Nocte (Night)", duration: "1 Month" },
          { name: "Methylcobalamin 500mcg", dosage: "1 Tablet", frequency: "OD", duration: "1 Month" }
        ],
        notes: "Foot care examination performed. No active ulcers."
      }
    ]
  },
  {
    id: "PAT-104",
    token: "#04",
    name: "Anusha Kumari",
    age: 41,
    gender: "Female",
    bloodGroup: "AB+",
    allergies: ["Ibuprofen"],
    complaint: "Joint stiffness and knee inflammation, worsens in the morning.",
    labHistory: ["ESR: 32 mm/hr", "Uric Acid: 5.4 mg/dL"],
    time: "10:00 AM",
    pastPrescriptions: [
      {
        id: "RX-2026-912",
        receiptNumber: "REC-0912",
        date: "05 Sep 2026",
        doctor: "Dr. D. Liyanage",
        clinic: "Rheumatology & Joint Care",
        diagnosis: "Osteoarthritis (Bilateral Knees)",
        medicines: [
          { name: "Paracetamol 1000mg", dosage: "2 Tablets", frequency: "TDS PRN", duration: "7 Days" },
          { name: "Glucosamine Sulfate 1500mg", dosage: "1 Sachet", frequency: "OD with water", duration: "2 Months" },
          { name: "Topical Diclofenac Gel", dosage: "Apply thin layer", frequency: "TDS", duration: "1 Tube" }
        ],
        notes: "Avoid high-impact exercises. Daily gentle quadriceps stretches advised."
      },
      {
        id: "RX-2026-380",
        receiptNumber: "REC-0380",
        date: "18 Apr 2026",
        doctor: "Dr. Nimal Silva",
        clinic: "MediTrack General OPD",
        diagnosis: "Hyperuricemia Check",
        medicines: [
          { name: "Colchicine 0.5mg", dosage: "1 Tablet", frequency: "BD", duration: "3 Days" },
          { name: "Allopurinol 100mg", dosage: "1 Tablet", frequency: "OD", duration: "1 Month" }
        ],
        notes: "Increase water intake to at least 2.5 Liters daily. Reduce red meat."
      }
    ]
  }
];

