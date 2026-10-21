import pandas as pd
import numpy as np
import time
# pyrefly: ignore [missing-import]
import joblib
# pyrefly: ignore [missing-import]
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.neural_network import MLPClassifier
# pyrefly: ignore [missing-import]
from xgboost import XGBClassifier
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix, classification_report

# 1. Load Cleaned Dataset
print("Loading cleaned_clinical_dataset.csv...")
df = pd.read_csv("cleaned_clinical_dataset.csv")

# Metadata සහ Target හැර අනෙක් සියලුම columns යනු Symptom Features වේ
meta_cols = ['Disease', 'symptom_count', 'total_severity_score', 'severity_level']
unique_symptoms = [c for c in df.columns if c not in meta_cols]

print(f"Total Unique Diseases: {df['Disease'].nunique()}")
print(f"Total Unique Symptoms: {len(unique_symptoms)}")

# 2. Features (X) සහ Target (y) වෙන් කිරීම
X = df[unique_symptoms]

# Encode target labels (Diseases)
le = LabelEncoder()
y = le.fit_transform(df['Disease'])

# Split into Train & Test sets (80% Train, 20% Test)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"Training Samples: {len(X_train)}, Testing Samples: {len(X_test)}")

# 3. Define the 3 Research Models
models = {
    "Random Forest": RandomForestClassifier(n_estimators=100, random_state=42),
    "XGBoost": XGBClassifier(eval_metric='mlogloss', random_state=42),
    "MLP (Deep Neural Net)": MLPClassifier(hidden_layer_sizes=(128, 64), max_iter=300, random_state=42)
}

results = {}
best_model = None
best_f1 = 0.0
best_model_name = ""

print("\n--- Starting Model Training & Comparative Evaluation ---")
for name, model in models.items():
    start_time = time.time()
    model.fit(X_train, y_train)
    train_time = time.time() - start_time

    # Inference latency test
    inf_start = time.time()
    y_pred = model.predict(X_test)
    inf_latency = time.time() - inf_start

    acc = accuracy_score(y_test, y_pred)
    prec, rec, f1, _ = precision_recall_fscore_support(y_test, y_pred, average='weighted')

    results[name] = {
        "Accuracy": acc * 100,
        "Precision": prec * 100,
        "Recall": rec * 100,
        "F1-Score": f1 * 100,
        "Latency (s)": inf_latency
    }

    print(f"\n[{name}]")
    print(f"  Accuracy : {acc*100:.2f}%")
    print(f"  Precision: {prec*100:.2f}%")
    print(f"  Recall   : {rec*100:.2f}%")
    print(f"  F1-Score : {f1*100:.2f}%")
    print(f"  Latency  : {inf_latency:.4f}s")

    if f1 > best_f1:
        best_f1 = f1
        best_model = model
        best_model_name = name
        best_preds = y_pred

# 4. Save Confusion Matrix of the Best Model
cm = confusion_matrix(y_test, best_preds)
plt.figure(figsize=(14, 12))
sns.heatmap(cm, cmap="Blues", xticklabels=le.classes_, yticklabels=le.classes_)
plt.title(f"Confusion Matrix - {best_model_name}")
plt.xlabel("Predicted Disease")
plt.ylabel("Actual Disease")
plt.tight_layout()
plt.savefig("confusion_matrix.png", dpi=300)
print("\nSaved Confusion Matrix to 'confusion_matrix.png'")

# 5. Export Model Artifacts for Production Voice Pipeline
artifacts = {
    "model": best_model,
    "model_name": best_model_name,
    "label_encoder": le,
    "symptom_columns": unique_symptoms
}
joblib.dump(artifacts, "best_disease_model.joblib")
print(f"Saved winning model ({best_model_name}) to 'best_disease_model.joblib'!")