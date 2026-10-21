import os
import json
import tempfile
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .predict_voice import analyze_patient_consultation


# Auto-configure FFmpeg for Windows from imageio_ffmpeg
try:
    import shutil
    import imageio_ffmpeg
    src_ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    ffmpeg_dir = os.path.dirname(src_ffmpeg)
    target_ffmpeg = os.path.join(ffmpeg_dir, "ffmpeg.exe")
    if not os.path.exists(target_ffmpeg):
        shutil.copyfile(src_ffmpeg, target_ffmpeg)
    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
    print(f"[Whisper] FFmpeg successfully configured at: {target_ffmpeg}")
except Exception as e:
    print(f"[Whisper FFmpeg Warning] Could not configure ffmpeg: {e}")

# Global cached Whisper model instance (loads once into memory)
_CACHED_WHISPER_MODEL = None

def get_whisper_model():
    global _CACHED_WHISPER_MODEL
    if _CACHED_WHISPER_MODEL is None:
        import whisper
        print("[Whisper ASR] Loading Whisper 'base' model into memory (one-time initialization)...")
        _CACHED_WHISPER_MODEL = whisper.load_model("base")
        print("[Whisper ASR] Model loaded and ready for transcription!")
    return _CACHED_WHISPER_MODEL


@csrf_exempt
def analyze_voice_consultation_api(request):
    """
    POST Endpoint: /api/consultation/analyze-voice/
    රෝගියා කියන විස්තරය (Text හෝ Audio) ලබාගෙන රෝග ලක්ෂණ සහ ලෙඩේ Predict කර
    රන්සරගේ Component 2 වෙත යවන JSON Payload එක ලබා දෙයි.
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Only POST requests are allowed."}, status=405)

    try:
        transcript_text = ""
        patient_id = 12
        doctor_id = 2

        patient_location = None

        # 1. Audio File එකක් එවා ඇත්නම් (Multipart Form-Data)
        if 'audio' in request.FILES:
            audio_file = request.FILES['audio']
            patient_id = request.POST.get('patient_id', 12)
            doctor_id = request.POST.get('doctor_id', 2)
            patient_location = request.POST.get('location', request.POST.get('patient_location', None))

            file_ext = os.path.splitext(getattr(audio_file, 'name', 'audio.webm'))[1] or ".webm"
            print(f"[Whisper ASR] Received audio file: {audio_file.name} ({audio_file.size} bytes)")

            with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
                for chunk in audio_file.chunks():
                    tmp.write(chunk)
                tmp_path = tmp.name

            try:
                print(f"[Whisper ASR] Starting transcription on: {tmp_path}")
                asr_model = get_whisper_model()
                # fp16=False ensures optimal execution on Windows CPU
                result = asr_model.transcribe(tmp_path, fp16=False)
                transcript_text = result.get("text", "").strip()
                print(f"[Whisper ASR] Transcription successful: \"{transcript_text}\"")
            except ImportError:
                return JsonResponse({
                    "status": "error",
                    "message": "Whisper is not installed. Please run: pip install openai-whisper"
                }, status=500)
            except Exception as e:
                err_str = str(e)
                print(f"[Whisper ASR Error] {err_str}")
                return JsonResponse({
                    "status": "error",
                    "message": f"Whisper failed: {err_str}. Tip: run 'pip install imageio-ffmpeg' for audio decoding."
                }, status=500)
            finally:
                if os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except Exception:
                        pass

        # 2. කෙලින්ම Text / JSON එවා ඇත්නම්
        else:
            body = json.loads(request.body.decode('utf-8'))
            transcript_text = body.get("transcript", "").strip()
            patient_id = body.get("patient_id", 12)
            doctor_id = body.get("doctor_id", 2)
            patient_location = body.get("location", body.get("patient_location", None))

        if not transcript_text:
            return JsonResponse({
                "status": "warning",
                "message": "No clear speech detected in audio recording. Please speak clearly into the microphone.",
                "payload": {
                    "transcript_summary": "No speech detected in recording.",
                    "extracted_symptoms": [],
                    "primary_diagnosis": {
                        "condition_code": "NO_SPEECH_DETECTED",
                        "condition_label": "No Speech Detected",
                        "confidence": 0.0,
                        "severity_level": "None",
                        "total_severity_score": 0,
                        "clinical_description": "The audio recording was silent or too brief. Please speak clearly into the microphone."
                    },
                    "differential_diagnoses": [],
                    "recommended_precautions": ["Ensure microphone is active and not muted", "Speak clearly into the microphone"],
                    "extracted_clinical_notes": {
                        "chief_complaint": "No speech detected",
                        "patient_reported_allergies": []
                    }
                }
            }, status=200)

        # AI Model එකෙන් රෝග ලක්ෂණ වෙන් කර JSON Payload එක සෑදීම
        analysis_result = analyze_patient_consultation(
            transcript_text=transcript_text,
            patient_id=patient_id,
            doctor_id=doctor_id,
            patient_location=patient_location
        )

        return JsonResponse(analysis_result, status=200)

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
def rank_medicines_api(request):
    """
    GET / POST Endpoint: /api/consultation/rank-medicines/
    Target conditions 6 සඳහා ML පදනම් කරගත් ඖෂධ Ranking & Recommendation දත්ත ලබා දෙයි.
    """
    try:
        from .medicine_ranker import rank_medicines_for_patient

        condition = "Influenza"
        age = 30
        severity = "moderate"
        allergies = []
        red_flags = []

        if request.method == "POST":
            try:
                body = json.loads(request.body.decode("utf-8")) if request.body else {}
            except Exception:
                body = {}
            condition = body.get("condition", request.POST.get("condition", condition))
            age = int(body.get("age", request.POST.get("age", age)) or 30)
            severity = body.get("severity", request.POST.get("severity", severity))
            allergies = body.get("allergies", [])
            red_flags = body.get("red_flags", [])
        else:
            condition = request.GET.get("condition", condition)
            age = int(request.GET.get("age", age) or 30)
            severity = request.GET.get("severity", severity)
            raw_allergies = request.GET.get("allergies", "")
            if raw_allergies:
                allergies = [a.strip() for a in raw_allergies.split(",") if a.strip()]
            raw_red_flags = request.GET.get("red_flags", "")
            if raw_red_flags:
                red_flags = [r.strip() for r in raw_red_flags.split(",") if r.strip()]

        result = rank_medicines_for_patient(
            condition=condition,
            age=age,
            severity=severity,
            allergies=allergies,
            red_flags=red_flags
        )
        return JsonResponse(result, status=200)

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)