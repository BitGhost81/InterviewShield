import os
import json
import base64
import urllib.request
import urllib.error
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

def process_audio_payload(req_data):
    load_dotenv(override=True)
    if env_path.exists():
        load_dotenv(env_path, override=True)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return 500, {"error": "GEMINI_API_KEY is not configured."}

    audio_base64 = req_data.get("audio_base64")
    mime_type = req_data.get("mime_type", "audio/webm")
    context = req_data.get("context", {})

    if not audio_base64:
        print("[INTERVIEW_AI] ERROR: No audio data in payload")
        return 400, {"error": "No audio data provided."}

    print(f"[INTERVIEW_AI] Audio received: base64 length={len(audio_base64)}, mime_type={mime_type}")

    # Audio size check (~20MB base64 limit check for single request)
    if len(audio_base64) > 25 * 1024 * 1024:
        print(f"[INTERVIEW_AI] ERROR: Audio too large ({len(audio_base64)} bytes base64)")
        return 400, {"error": "Audio recording exceeds supported gemini-3.5-transcribe limit."}

    # Step 1: Transcription & Diarization using gemini-3.5-transcribe
    transcribe_model = os.getenv("GEMINI_TRANSCRIBE_MODEL", "gemini-3.5-transcribe")
    transcribe_url = f"https://generativelanguage.googleapis.com/v1beta/models/{transcribe_model}:generateContent?key={api_key}"

    transcribe_payload = json.dumps({
        "contents": [{
            "parts": [
                {
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": audio_base64
                    }
                }
            ]
        }],
        "generationConfig": {
            "audioTranscriptionConfig": {
                "diarization": True
            }
        }
    }).encode("utf-8")

    headers = {"Content-Type": "application/json"}
    raw_transcript = ""

    try:
        print(f"[INTERVIEW_AI] Step 1: Sending transcription request to {transcribe_model}...")
        req = urllib.request.Request(transcribe_url, data=transcribe_payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw_response = resp.read().decode("utf-8")
            res_data = json.loads(raw_response)
            # Log raw response structure for diagnosis (truncate large text fields)
            print(f"[INTERVIEW_AI] Raw response keys: {list(res_data.keys())}")
            candidates = res_data.get("candidates", [])
            if candidates:
                print(f"[INTERVIEW_AI] candidates[0] keys: {list(candidates[0].keys())}")
                if "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    print(f"[INTERVIEW_AI] Number of parts: {len(parts)}")
                    for i, part in enumerate(parts):
                        print(f"[INTERVIEW_AI] part[{i}] keys: {list(part.keys())}")
                        if "text" in part:
                            text_preview = part["text"][:200].replace("\n", "\\n")
                            print(f"[INTERVIEW_AI] part[{i}].text preview: {text_preview}...")
                    if parts and "text" in parts[0]:
                        raw_transcript = parts[0]["text"].strip()
        print(f"[INTERVIEW_AI] Transcription complete: transcript length={len(raw_transcript)}")
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="ignore")
        print(f"[INTERVIEW_AI] ERROR: {transcribe_model} HTTP Error {err.code}: {err_body}")
        return 502, {"error": f"Transcription model gemini-3.5-transcribe failed with HTTP {err.code}"}
    except Exception as exc:
        print(f"[INTERVIEW_AI] ERROR: {transcribe_model} request failed: {exc}")
        return 502, {"error": f"Transcription failed: {exc}"}

    if not raw_transcript:
        print("[INTERVIEW_AI] ERROR: Empty transcript returned from Gemini")
        return 502, {"error": "Failed to extract transcript from Gemini audio response."}

    # Step 2: Role Identification & Structured Report using gemini-2.5-flash
    report_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    report_url = f"https://generativelanguage.googleapis.com/v1beta/models/{report_model}:generateContent?key={api_key}"

    ctx_info = []
    if context.get("title"):
        ctx_info.append(f"Session Title/Topic: {context.get('title')}")
    if context.get("problem_statement"):
        ctx_info.append(f"Problem Statement: {context.get('problem_statement')}")
    if context.get("candidate_name"):
        ctx_info.append(f"Candidate Name: {context.get('candidate_name')}")

    report_prompt = f"""You are an AI interview analysis system for InterviewShield.
Below is a raw diarized transcript with 'Speaker 1' and 'Speaker 2'.

INTERVIEW CONTEXT:
{"\n".join(ctx_info) if ctx_info else "Technical Interview"}

RAW DIARIZED TRANSCRIPT:
{raw_transcript}

TASK:
1. Map Speaker 1 and Speaker 2 to 'Interviewer' and 'Candidate' based on who asks technical questions vs who provides answers/code explanations.
2. Produce a clean structured final transcript formatting each dialogue turn as "Interviewer: ..." or "Candidate: ...". Do not invent statements.
3. Generate a concise interview report. Do NOT make an autonomous hire/reject decision or output fake numerical scores.

Return ONLY a valid JSON object with EXACTLY this structure:
{{
  "transcript": "formatted final transcript string",
  "summary": "concise interview summary",
  "strengths": ["strength 1", "strength 2"],
  "areas_for_improvement": ["area 1", "area 2"],
  "topics_discussed": ["topic 1", "topic 2"],
  "overall_observations": "overall technical and behavioral observations"
}}
"""

    report_payload = json.dumps({
        "contents": [{"parts": [{"text": report_prompt}]}],
        "generationConfig": {"response_mime_type": "application/json"}
    }).encode("utf-8")

    try:
        print(f"[INTERVIEW_AI] Step 2: Sending report generation request to {report_model}...")
        req = urllib.request.Request(report_url, data=report_payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            candidates = res_data.get("candidates", [])
            reply_text = ""
            if candidates and "content" in candidates[0]:
                parts = candidates[0]["content"].get("parts", [])
                if parts and "text" in parts[0]:
                    reply_text = parts[0]["text"].strip()

            print(f"[INTERVIEW_AI] Report model response length: {len(reply_text)}")
            result_json = json.loads(reply_text)
            final_transcript = result_json.get("transcript", raw_transcript)
            report_dict = {
                "summary": result_json.get("summary", ""),
                "strengths": result_json.get("strengths", []),
                "areas_for_improvement": result_json.get("areas_for_improvement", []),
                "topics_discussed": result_json.get("topics_discussed", []),
                "overall_observations": result_json.get("overall_observations", "")
            }

            print(f"[INTERVIEW_AI] SUCCESS: transcript={len(final_transcript)} chars, report keys={list(report_dict.keys())}")
            return 200, {
                "transcript": final_transcript,
                "report": report_dict
            }
    except Exception as exc:
        print(f"[INTERVIEW_AI] ERROR: Report generation failed: {exc}")
        return 502, {"error": f"Report generation failed: {exc}"}
