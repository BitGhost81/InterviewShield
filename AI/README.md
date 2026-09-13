# InterviewShield — Merged AI Module

This project merges the **InterviewShield AI intelligence module** with the
**motion + phone detection + trained ML pipeline** into one FastAPI service.

## Unified architecture

Frontend / existing WebRTC app
        |
        +--> `/vision/frame`       -> conservative OpenCV face observations
        |
        +--> `/motion/frame`       -> MediaPipe + YOLO phone + temporal tracker
        |                              + 16-feature state tracker + trained ML
        |
        +--> `/audio/transcribe`   -> optional Faster-Whisper adapter
        |
        +--> `/events`             -> normalized platform/browser events
        |
        +--> `/transcript`         -> transcript segments
        |
        +--> `/analyze`            -> answer analysis + next question
        |
        +--> `/report/{session}`   -> final interviewer-side report

## What was merged

### Interview intelligence
- Gemini-backed structured answer analysis
- Adaptive next-question generation
- JD / resume / role grounding
- Transcript ingestion
- Evidence-based assistance indicators
- SQLite session persistence
- Final structured interview report
- Deterministic fallbacks when the LLM is temporarily unavailable

### Motion / detection pipeline
- MediaPipe face landmark detection
- Face missing detection
- Multiple-person detection
- Head orientation and movement
- YOLO phone detection
- Temporal phone confirmation
- Event normalization
- 16-feature session tracking
- Existing `cheating_model_v2.pkl` prediction

## Important design decision

The two systems now share the same `InterviewEvent` schema at the API boundary.
Motion events are converted into that common schema and stored in the same
interview session used by the intelligence engine.

The trained ML model remains separate from the LLM intelligence layer:
its prediction is an evidence signal, while the final interview report still
states that behavioral events and model outputs are not proof of cheating.

## Run

Install dependencies:

```bash
pip install -r requirements.txt
```

Create a `.env` file in the project root (copy `.env.example`) and add your Gemini API key:

```env
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.5-flash-lite
LLM_MAX_RETRIES=1
```

The API loads `.env` automatically at startup. Do not commit or share `.env`.

Then start the API:

```bash
python -m uvicorn api:app --reload
```

Then open:

`http://127.0.0.1:8000/docs`

On Windows PowerShell, use:

```powershell
$env:GEMINI_API_KEY="your_key"
python -m uvicorn api:app --reload
```

## Main endpoints

### Interview intelligence
- `GET /health`
- `POST /session/start`
- `POST /analyze`
- `POST /next-question`
- `POST /events`
- `POST /transcript`
- `POST /vision/frame`
- `POST /audio/transcribe`
- `POST /report/{session_id}`

### Motion + phone + ML
- `POST /motion/session/start`
- `POST /motion/frame`
- `GET /motion/session/status/{session_id}`
- `POST /motion/session/end`

## Motion frame flow

```text
image bytes
    ↓
OpenCV decode
    ↓
RGB frame
    ├── MediaPipe face/head detection
    └── RGB → BGR → YOLO phone detection
                         ↓
                  PhoneTracker
                         ↓
               EventNormalizer
                         ↓
                  StateTracker
                         ↓
                  16 features
                         ↓
              cheating_model_v2.pkl
```

## Session integration

For a real interview, use the same `session_id` for both the intelligence
session and motion session:

1. `POST /session/start`
2. `POST /motion/session/start`
3. Repeatedly send `/motion/frame`
4. Send transcripts to `/transcript`
5. Send browser/platform events to `/events`
6. Send each question + answer to `/analyze`
7. At the end call `/motion/session/end`
8. Call `/report/{session_id}`

The motion events are also forwarded into the common interview event store.

## Model files

The merged project includes:

- `models/face_landmarker.task`
- `models/yolo11n.pt`
- `models/cheating_model_v2.pkl`

Do not delete or rename these files unless the corresponding paths in the
motion pipeline are updated.

## Safety / interpretation

The system produces observable evidence and model signals. It does **not**
prove that a candidate cheated, and it does not inspect arbitrary desktop
processes. Human verification remains necessary for consequential decisions.
