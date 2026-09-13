from __future__ import annotations

import tempfile
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

load_dotenv()

from ai_core.provider import GeminiProvider
from ai_core.schemas import *
from ai_core.service import InterviewAIService
from media.audio import WhisperTranscriber
from media.vision import VisionEventDetector
from motion_ai.ai_service import AIService as MotionAIService


app = FastAPI(title="InterviewShield AI Module", version="4.0.0")
_service: InterviewAIService | None = None
_motion_sessions: dict[str, MotionAIService] = {}


def service() -> InterviewAIService:
    global _service
    if _service is None:
        _service = InterviewAIService(GeminiProvider())
    return _service




def motion_service(session_id: str) -> MotionAIService:
    """Return the motion/phone/ML pipeline for an interview session."""
    if session_id not in _motion_sessions:
        _motion_sessions[session_id] = MotionAIService(default_fps=10.0)
    return _motion_sessions[session_id]


def _motion_events_to_interview_events(session_id: str, result: dict) -> list[InterviewEvent]:
    """Convert model-compatible motion events into the common AI event schema."""
    ts = int(float(result.get("timestamp", 0.0)) * 1000)
    events = []
    descriptions = {
        "FACE_MISSING": "No face was detected in the sampled frame.",
        "MULTIPLE_PERSON": "Multiple people were detected in the sampled frame.",
        "PHONE_VISIBLE": "A phone was detected and temporally confirmed across frames.",
        "LOOKING_AWAY": "Head orientation indicates looking away from the camera.",
    }
    confidence = {
        "FACE_MISSING": 0.85,
        "MULTIPLE_PERSON": 0.90,
        "PHONE_VISIBLE": 0.90,
        "LOOKING_AWAY": 0.60,
    }
    for event_type in result.get("events", []):
        if event_type in descriptions:
            events.append(
                InterviewEvent(
                    session_id=session_id,
                    timestamp_ms=max(0, ts),
                    source="video",
                    event_type=event_type.lower(),
                    description=descriptions[event_type],
                    confidence=confidence[event_type],
                    metadata={
                        "motion_pipeline": True,
                        "frame": result.get("frame"),
                    },
                )
            )
    return events


class AnalyzeRequest(BaseModel):
    context: InterviewContextV2
    question: str
    answer: str
    timestamp_ms: int | None = None
    answer_duration_ms: int | None = None


class TranscriptRequest(BaseModel):
    session_id: str
    segment: TranscriptSegment


@app.get("/health")
def health():
    return {"status": "ok", "service": "interviewshield-ai", "version": "4.0.0"}


@app.post("/session/start", response_model=InterviewContextV2)
def start(ctx: InterviewContextV2):
    return service().create_session(ctx)


@app.post("/events")
def add_event(event: InterviewEvent):
    try:
        service().add_event(event)
        return {"status": "accepted", "event_id": event.event_id}
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/transcript")
def add_transcript(req: TranscriptRequest):
    try:
        service().add_transcript(req.session_id, req.segment)
        return {"status": "accepted"}
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/analyze", response_model=TurnResult)
def analyze(req: AnalyzeRequest):
    try:
        ai = service()
        try:
            ai.get_context(req.context.session_id)
        except KeyError:
            ai.create_session(req.context)
        return ai.process_answer(
            req.context.session_id,
            req.question,
            req.answer,
            req.timestamp_ms,
            req.answer_duration_ms,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"AI analysis failed: {exc}") from exc


@app.post("/copilot/questions", response_model=CopilotQuestions)
def copilot_questions(req: AnalyzeRequest):
    """Call once per completed candidate response, not on every transcript update."""
    try:
        ai = service()
        try:
            ai.get_context(req.context.session_id)
        except KeyError:
            ai.create_session(req.context)
        return ai.suggest_copilot_questions(
            req.context.session_id,
            req.question,
            req.answer,
            req.timestamp_ms,
            req.answer_duration_ms,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Copilot question generation failed: {exc}") from exc


@app.post("/next-question", response_model=NextQuestion)
def next_question(req: AnalyzeRequest):
    try:
        ai = service()
        cached = ai.latest_result(req.context.session_id)
        if cached:
            return cached.next_question

        try:
            ai.get_context(req.context.session_id)
        except KeyError:
            ai.create_session(req.context)

        result = ai.process_answer(
            req.context.session_id,
            req.question,
            req.answer,
            req.timestamp_ms,
            req.answer_duration_ms,
        )
        return result.next_question
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Next-question generation failed: {exc}") from exc


@app.post("/vision/frame")
async def vision_frame(
    session_id: str,
    timestamp_ms: int | None = None,
    image: UploadFile = File(...),
):
    try:
        detector = VisionEventDetector()
        events = detector.analyze_frame(
            session_id,
            await image.read(),
            timestamp_ms,
        )
        for event in events:
            service().add_event(event)
        return {"events": [event.model_dump() for event in events]}
    except Exception as exc:
        raise HTTPException(400, f"Vision processing failed: {exc}") from exc


@app.post("/audio/transcribe")
def transcribe_audio(
    session_id: str,
    speaker: str = "unknown",
    audio: UploadFile = File(...),
):
    temp_path: str | None = None
    try:
        suffix = Path(audio.filename or "audio.wav").suffix or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(audio.file.read())
            temp_path = tmp.name

        segments = WhisperTranscriber().transcribe(temp_path, speaker=speaker)
        for segment in segments:
            service().add_transcript(session_id, segment)
        return {"segments": [segment.model_dump() for segment in segments]}
    except Exception as exc:
        raise HTTPException(400, f"Audio transcription failed: {exc}") from exc
    finally:
        if temp_path:
            try:
                Path(temp_path).unlink(missing_ok=True)
            except OSError:
                pass


@app.post("/report/{session_id}", response_model=FinalInterviewReportV2)
def report(session_id: str):
    try:
        return service().report(session_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/motion/session/start")
def motion_session_start(session_id: str):
    """Initialize the motion + phone + trained ML pipeline."""
    if not session_id.strip():
        raise HTTPException(400, "session_id is required")
    if session_id in _motion_sessions:
        return {"status": "already_started", "session_id": session_id}
    _motion_sessions[session_id] = MotionAIService(default_fps=10.0)
    return {"status": "started", "session_id": session_id}


@app.post("/motion/frame")
async def motion_frame(
    session_id: str,
    timestamp: float | None = None,
    image: UploadFile = File(...),
):
    """Process one RGB image through face, phone, tracking and ML prediction."""
    if not session_id.strip():
        raise HTTPException(400, "session_id is required")
    try:
        raw = await image.read()
        if not raw:
            raise ValueError("Empty image.")
        detector = motion_service(session_id)

        import numpy as np
        import cv2
        arr = np.frombuffer(raw, dtype=np.uint8)
        frame_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame_bgr is None:
            raise ValueError("Invalid image bytes.")
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

        result = detector.process_frame(frame_rgb, timestamp=timestamp)
        events = _motion_events_to_interview_events(session_id, result)
        for event in events:
            service().add_event(event)

        return {"result": result, "events": [e.model_dump() for e in events]}
    except Exception as exc:
        raise HTTPException(400, f"Motion processing failed: {exc}") from exc


@app.get("/motion/session/status/{session_id}")
def motion_session_status(session_id: str):
    try:
        return motion_service(session_id).get_status()
    except Exception as exc:
        raise HTTPException(404, f"Motion session unavailable: {exc}") from exc


@app.post("/motion/session/end")
def motion_session_end(session_id: str):
    detector = _motion_sessions.pop(session_id, None)
    if detector is None:
        raise HTTPException(404, "Motion session not found")
    try:
        return detector.get_session_result()
    except Exception as exc:
        raise HTTPException(500, f"Motion session finalization failed: {exc}") from exc
