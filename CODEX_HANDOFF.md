# CODEX_HANDOFF.md — CodeLock Developer Hand-Off Guide

> **Notice for Codex / Future AI Agents & Developers:**
> This handoff document is comprehensive, fully grounded in the actual codebase, and provides everything necessary to continue development safely without access to prior conversation history.
> **Do not modify application code or delete legacy components without following the explicit verification paths described here.**

---

## 1. Project Overview

### What is CodeLock?
**CodeLock** (formerly *InterviewShield*) is an **AI-Powered Remote Technical Interview Platform**. It provides an end-to-end environment for real-time technical assessments featuring:
1. Candidate live code mirroring (Monaco editor).
2. Direct peer-to-peer audio/video calling (WebRTC).
3. Proctoring / integrity monitoring (tab-switching compatibility, blur/focus tracking, and fullscreen enforcement).
4. AI Copilot for interviewers during the interview.
5. Post-interview automated audio transcription, speaker diarization, and structured technical/behavioral assessment reports powered by Google Gemini.

### Major User Flows

#### Interviewer Flow:
1. **Auth:** Register or log in at `/login` (role: `INTERVIEWER`).
2. **Dashboard:** Land on `/dashboard`. Create a new interview session by specifying title and problem statement. A unique 6-character alphanumeric session code (e.g., `AB12CD`) is generated.
3. **Session Management:** View created sessions under `/dashboard` (fetched from `GET /api/sessions/mine`).
4. **Pre-Interview Setup:** Clicking "Monitor Session" navigates to `/monitor/{sessionCode}/setup`.
   - Browser compatibility validation.
   - Live camera and microphone permissions and hardware check.
   - Session photo capture.
   - Upon completion, calls `POST /api/sessions/{sessionCode}/ready` with `role: "interviewer"` and Base64 photo.
5. **Monitoring Room:** Interviewer enters `/monitor/{sessionCode}`.
   - Read-only live code mirror of candidate's Monaco editor.
   - WebRTC live audio/video connection with candidate.
   - Live activity alerts panel (focus loss and fullscreen exit) backed by durable REST logs.
   - AI Copilot side-panel for real-time assistant queries.
   - Real-time audio recording of the conversation.
6. **Session Completion & Report:**
   - Interviewer clicks "End Session"; finalized audio is first uploaded to `POST /api/sessions/{sessionCode}/process-audio`, then the session is ended.
   - Spring retains failed recordings in private filesystem storage for an owner-only retry and forwards jobs through configurable `AI_BASE_URL`.
   - Interviewer views the AI-generated transcript and structured report (`GET /api/sessions/{sessionCode}/ai-report`).

#### Candidate Flow:
1. **Auth:** Register or log in at `/login` (role: `CANDIDATE`).
2. **Join Session:** From `/dashboard`, input 6-character session code and click "Join Session".
   - Client probes session existence via `GET /api/sessions/{sessionCode}` and stores authorization token and join key (`interviewshield:join:{userId}:{sessionCode}`) in storage.
3. **Pre-Interview Setup:** Navigates to `/interview/{sessionCode}/setup` (in regular windowed mode, NOT fullscreen).
   - Compatibility checks, mic/cam hardware validation, and session reference photo capture.
   - Calls `POST /api/sessions/{sessionCode}/ready` with `role: "candidate"` and Base64 photo.
   - Clicks "Enter Interview as Candidate" which **initiates full-screen mode** synchronously in response to the user gesture and transitions to `/interview/{sessionCode}`.
4. **Interview Environment:**
   - Fullscreen Monaco code editor with multi-language selector (default JavaScript).
   - Local code execution / output evaluation panel.
   - WebRTC peer-to-peer call with interviewer.
   - Proctoring hooks: leaving fullscreen or switching tabs triggers alerts sent via WebSocket and persisted to backend database.

---

## 2. Current Tech Stack

| Layer | Technologies & Libraries | Port / Address |
|---|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS, React Router, Axios, Monaco Editor (`@monaco-editor/react`), Firebase Realtime Database SDK | `https://localhost:5173` |
| **Backend** | Spring Boot 3.2.5, Java 17/21, Spring Data JPA, Spring Security (Stateless JWT), MySQL Connector/J, jjwt (`0.11.5`), Jackson | `http://localhost:8081` |
| **Database** | MySQL 8.x | Port `3306` (configured via `DB_URL`) |
| **Realtime Server** | Node.js (ESM), `ws` library, Node native `https` & `crypto` | `wss://0.0.0.0:1234` |
| **Media / P2P** | WebRTC (`RTCPeerConnection`), Native Browser `MediaRecorder`, `AudioContext` | Peer-to-peer UDP/TCP (STUN: Google STUN) |
| **AI Service** | Python 3.10+, `ThreadingHTTPServer`, `python-dotenv`, Google Gemini REST APIs (`urllib.request`) | `http://127.0.0.1:8000` |
| **Gemini Models** | `gemini-3.5-transcribe` (audio transcription & diarization) + `gemini-2.5-flash` (copilot & structured evaluation) | Google Generative Language API |

---

## 3. Repository Structure

```
InterviewSheild/
├── .gitignore                         # Git ignore definitions
├── CODEX_HANDOFF.md                   # THIS DOCUMENT (Source of truth)
├── README.md                          # Project documentation
├── AI/                                # Python AI services
│   ├── gemini_copilot.py              # HTTP server (port 8000): /chat & /process-audio endpoints
│   ├── interview_ai.py                # Core Gemini transcription + analysis logic with retry
│   └── test_reliability.py            # Mocked AI retry/bounds tests
├── app/                               # React + Vite frontend
│   ├── index.html                     # Entry HTML (Branded "CodeLock")
│   ├── package.json                   # React 19 dependencies & scripts
│   ├── vite.config.js                 # Vite config (HTTPS, API reverse-proxy to :8081)
│   ├── ws-server.js                   # Node WebSocket server (port 1234, WSS)
│   ├── cert.pem / key.pem             # Local SSL certificates for HTTPS / WSS
│   └── src/
│       ├── App.jsx                    # Route configuration & backend-authoritative setup guards
│       ├── Auth.jsx                   # Login & registration forms
│       ├── Dashboard.jsx              # Session creation & joining dashboard
│       ├── InterviewPage.jsx          # Candidate interview IDE, proctoring & WebRTC integration
│       ├── MonitorPage.jsx            # Interviewer monitoring console, video call & AI report viewer
│       ├── SetupPage.jsx              # Pre-interview device check & photo capture flow
│       ├── LandingPage.jsx            # Product landing page
│       ├── components/                # Reusable UI components
│       │   ├── VideoCallPanel.jsx     # Floating WebRTC video UI with mute/camera toggles
│       │   ├── CursorLight.jsx        # Ambient UI mouse lighting effect
│       │   └── ...
│       ├── hooks/
│       │   └── useWebRTCCall.js       # WebRTC signaling, ICE handling & stereo audio recorder
│       └── realtime/
│           ├── messages.js            # WebSocket message type constants & URL resolver
│           └── realtimeClient.js      # Resilient WebSocket client factory & join probe
├── backend/                           # Spring Boot REST API
│   ├── pom.xml                        # Maven dependencies (Spring Boot 3.2.5, MySQL, jjwt)
│   └── src/
│       └── main/
│           ├── java/com/interviewshield/backend/
│           │   ├── BackendApplication.java
│           │   ├── controller/
│           │   │   ├── AuthController.java        # /api/auth/register, /api/auth/login
│           │   │   ├── SessionController.java     # /api/sessions/*, ready, readiness, process-audio
│           │   │   ├── ActivityLogController.java # /api/logs/* activity and integrity reports
│           │   │   └── FirebaseAuthController.java # owner/participant custom-token issuance
│           │   ├── dto/                           # Request/response DTOs
│           │   ├── model/
│           │   │   ├── User.java                  # User credentials & roles
│           │   │   ├── InterviewSession.java      # Session state, readiness & AI reports
│           │   │   └── ActivityLog.java           # Proctoring event log & photo data
│           │   ├── repository/                    # Spring Data JPA repositories
│           │   ├── security/
│           │   │   ├── JwtFilter.java             # Request authorization filter
│           │   │   ├── JwtUtil.java               # JWT creation & verification (HS256)
│           │   │   └── SecurityConfig.java        # Security filter chain & CORS rules
│           │   └── service/
│           │       ├── AuthService.java
│           │       ├── SessionService.java        # Session logic and readiness
│           │       ├── SessionAuthorizationService.java
│           │       ├── FirebaseTokenService.java
│           │       ├── AudioProcessingService.java
│           │       └── ActivityLogService.java
│           └── resources/
│               └── application.properties         # Database connection, port 8081, upload limits
└── firebase/                          # RTDB rules and emulator tests
```

---

## 4. Architecture & Communication Flows

```
                                  ┌────────────────────────────────┐
                                  │   MySQL Database (Port 3306)   │
                                  └───────────────▲────────────────┘
                                                  │
                                          JPA / Hibernate
                                                  │
┌──────────────────────────┐  HTTP / REST ┌───────┴───────────────┐  HTTP / JSON  ┌──────────────────────────┐
│   Browser (React Vite)   ├─────────────►│ Spring Boot (Port 8081)├─────────────►│  Python AI (Port 8000)   │
│   Candidate / Interviewer│◄─────────────┤ Sessions / Auth / Logs│◄─────────────┤  Gemini 3.5 / 2.5        │
└─────────────┬────────────┘              └───────────────────────┘               └──────────────────────────┘
              │                                                                                 │
              │ WebSocket (WSS)                                                                 │ Google API
              ▼                                                                                 ▼
┌──────────────────────────┐              Direct Media P2P (UDP/TCP)              ┌──────────────────────────┐
│  WS Relay (Port 1234)    │      ┌─────────────────────────────────────────┐     │    Google Gemini API     │
│  Session-Isolated Relay  │      │ Candidate Camera ◄──► Interviewer Camera│     │    GenerativeLanguage    │
└──────────────────────────┘      └─────────────────────────────────────────┘     └──────────────────────────┘
```

1. **REST API Path:**
   - Frontend communicates with Spring Boot via `/api/*` (proxied in Vite dev mode to `http://localhost:8081`).
   - JWT token included in `Authorization: Bearer <token>`.
2. **Realtime WebSocket Path:**
   - Both clients connect to `wss://<host>:1234` using native browser `WebSocket` managed by `realtimeClient.js`.
   - The relay checks session validity and JWT signature before admitting participants.
3. **WebRTC Media Path:**
   - Signaling (SDP offer/answer and ICE candidates) is relayed through WebSocket messages (`webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`).
   - Media flows directly peer-to-peer via `RTCPeerConnection`.
4. **AI Audio & Report Path:**
   - The interviewer's browser records combined audio using `MediaStreamDestination` + `MediaRecorder`.
   - On session end, audio is sent as `multipart/form-data` to Spring Boot (`POST /api/sessions/{code}/process-audio`).
   - Spring Boot saves the recording privately, claims a bounded background job, and sends it to Python at configured `AI_BASE_URL`.
   - Python invokes Gemini transcription (`gemini-3.5-transcribe`), then feeds the transcript into Gemini evaluation (`gemini-2.5-flash`), returning structured JSON. Spring Boot persists the result to `InterviewSession` (`aiTranscript`, `aiReportJson`, `aiStatus = "COMPLETED"`).

---

## 5. Environment Variables & Configuration

### Root / AI Service (`.env`)
```ini
GEMINI_API_KEY=AIzaSy...               # Google Gemini API key
GEMINI_MODEL=gemini-2.5-flash          # Model for copilot and structured report
GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe # Model for audio transcription/diarization
```

### Backend (`application.properties` & System Environment)
```properties
DB_URL=jdbc:mysql://localhost:3306/interviewshield?createDatabaseIfNotExist=true&useSSL=false
DB_USER=root
DB_PASSWORD=your_password
server.port=8081
ai.base-url=http://127.0.0.1:8000
spring.servlet.multipart.max-file-size=100MB
spring.servlet.multipart.max-request-size=100MB
```

### Frontend (`app/.env` or Vite Env)
```ini
VITE_API_URL=/api
VITE_REALTIME_URL=wss://localhost:1234
VITE_STUN_URL=stun:stun.l.google.com:19302
# Optional TURN server for restricted NAT/firewalls:
# VITE_TURN_URL=turn:turn.example.com:3478
# VITE_TURN_USERNAME=user
# VITE_TURN_CREDENTIAL=pass
```

### WebSocket Server (`app/ws-server.js` defaults)
```ini
REALTIME_PORT=1234
API_BASE_URL=http://localhost:8081/api
JWT_SECRET=interviewshield-secret-key-2026-very-long-string
```

---

## 6. How to Run & Verify the Application

### Prerequisites
- Node.js 18+ (tested on Node 20+)
- JDK 17 or 21
- Maven 3.8+
- MySQL 8.x running locally
- Python 3.10+
- Valid SSL certificate pair (`app/cert.pem` and `app/key.pem`) for local HTTPS/WSS

### Startup Sequence

#### 1. Start MySQL
Ensure MySQL service is running on port 3306 and database user has access.

#### 2. Start Backend (Spring Boot)
```powershell
cd c:\Users\bitGhost\.codex\worktrees\c623\InterviewSheild\backend
$env:DB_URL="jdbc:mysql://localhost:3306/interviewshield?createDatabaseIfNotExist=true&useSSL=false"
$env:DB_USER="root"
$env:DB_PASSWORD="your_password"
mvn spring-boot:run
```
*Health check:* `http://localhost:8081/api/sessions` returns 401 Unauthorized (confirming server is active).

#### 3. Start Realtime WebSocket Server
```powershell
cd c:\Users\bitGhost\.codex\worktrees\c623\InterviewSheild\app
npm run realtime
```
*Expected log:* `Secure realtime WebSocket server running on port 1234 (wss://0.0.0.0:1234)`.

#### 4. Start Python AI Copilot & Transcription Service
```powershell
cd c:\Users\bitGhost\.codex\worktrees\c623\InterviewSheild\AI
python gemini_copilot.py
```
*Expected log:* `Gemini Copilot service running on http://127.0.0.1:8000 (threaded)`.

#### 5. Start Frontend
```powershell
cd c:\Users\bitGhost\.codex\worktrees\c623\InterviewSheild\app
npm run dev
```
*Access frontend at:* `https://localhost:5173`. Accept the self-signed certificate in the browser.

---

## 7. Realtime WebSocket Relay Deep Dive (`app/ws-server.js`)

### Protocol & Message Types
Defined in `app/src/realtime/messages.js`:
- `join_session`: Authenticates connection and joins session room.
- `presence`: Broadcasts participant connectivity status (`candidateConnected`, `interviewerConnected`).
- `code_snapshot`: Candidate sends complete code editor buffer.
- `code_delta`: Candidate sends incremental edits.
- `code_resync`: Interviewer requests a full snapshot from candidate.
- `fullscreen_exit` / `fullscreen_restore`: Candidate proctoring events.
- `focus_lost` / `focus_return`: Candidate browser blur/focus events.
- `webrtc_offer` / `webrtc_answer` / `webrtc_ice_candidate`: WebRTC signaling between participants.
- `leave_session`: Graceful exit.
- `error`: Server-to-client errors.

### Authorization & Session Lifecycle
- Clients pass JWT in the `join_session` payload.
- Server validates JWT signature using HMAC-SHA256 (`JWT_SECRET`) and checks expiration.
- Server verifies session status via backend REST call (`verifySessionExists` -> `GET /api/sessions/{code}`).
- Rooms are held in memory: `Map<sessionCode, { candidate: WebSocket, interviewer: WebSocket }>`.
- Candidate slots are single-occupancy; duplicate candidate join attempts are rejected with `session_occupied`.
- Disconnections cleanly update presence via `broadcastPresence(sessionCode)`.
- When interviewer ends session, `handleSessionEnded` checks backend status, calls `notifyAndCloseSession` to notify all active peers, cleans up sockets, and deletes room.

---

## 8. WebRTC & Media Pipeline (`useWebRTCCall.js`)

- **Initiator:** The candidate is designated as the caller (`isInitiator = true`), creating the WebRTC offer when presence confirms the interviewer is connected.
- **Signaling:** Relayed transparently through `ws-server.js`.
- **ICE Handling:** ICE candidates arriving before remote description are queued in `queuedCandidatesRef` and flushed immediately upon setting remote description.
- **Audio Recording Pipeline:**
  - `AudioContext` and `createMediaStreamDestination()` combine local audio track and remote audio track into a single mixed stream.
  - `MediaRecorder` records audio chunks at 1000ms intervals (`audio/webm` or `audio/ogg`).
  - On interview conclusion, `stopRecording()` safely gathers all chunks into a Blob with a 3-second safeguard timeout.

---

## 9. Backend & Database Design

### JPA Entities

#### `InterviewSession` (`sessions` table)
- `id` (Long, PK)
- `sessionCode` (String, unique 6 chars)
- `title` (String, max 150 chars)
- `problemStatement` (TEXT)
- `createdBy` (Long, user ID of interviewer)
- `status` (`ACTIVE`, `ENDED`, `EXPIRED`)
- `aiStatus` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`)
- `aiTranscript` (LONGTEXT)
- `aiReportJson` (LONGTEXT)
- `candidateReady` (boolean, default false)
- `interviewerReady` (boolean, default false)
- `candidatePhoto` (LONGTEXT Base64)
- `interviewerPhoto` (LONGTEXT Base64)
- `createdAt` (LocalDateTime)

#### `User` (`users` table)
- `id` (Long, PK)
- `name` (String)
- `email` (String, unique)
- `password` (String, BCrypt hashed)
- `role` (`INTERVIEWER` or `CANDIDATE`)
- `createdAt` (LocalDateTime)

#### `ActivityLog` (`activity_logs` table)
- `id` (Long, PK)
- `sessionCode` (String)
- `candidateId` (Long)
- `eventType` (String, e.g. `TAB_SWITCH`, `FOCUS_LOST`, `FULLSCREEN_EXIT`, `CODE_SUBMIT`)
- `eventData` (TEXT event metadata or submitted code)
- `createdAt` (LocalDateTime)

### Key REST Endpoints
- `POST /api/auth/register` — Create user.
- `POST /api/auth/login` — Authenticate and receive JWT.
- `POST /api/sessions` — Create session (Interviewer only).
- `GET /api/sessions/mine` — List interviewer's sessions.
- `GET /api/sessions/{code}` — Get session info.
- `POST /api/sessions/{code}/ready` — Submit participant readiness and photo.
- `GET /api/sessions/{code}/readiness` — Query readiness status and candidate photo.
- `POST /api/sessions/{code}/end` — Mark session ended.
- `POST /api/sessions/{code}/process-audio` — Submit recorded audio for AI report generation (Async 202).
- `POST /api/sessions/{code}/retry-audio` — Retry retained audio processing (owning interviewer only).
- `GET /api/sessions/{code}/ai-report` — Retrieve generated transcript and evaluation.
- `POST /api/logs` — Record candidate activity with server-derived identity.
- `GET /api/logs/{code}` — Fetch ordered activity logs for the owning interviewer.
- `GET /api/logs/{code}/{candidateId}` — Fetch the deterministic integrity report.

---

## 10. AI Service Pipeline (`AI/interview_ai.py` & `AI/gemini_copilot.py`)

### Endpoints
1. `POST /chat` — Live Copilot assistant for interviewer with contextual prompts.
2. `POST /process-audio` — Audio processing workflow:
   - **Step 1:** Sends audio to `gemini-3.5-transcribe` with speaker diarization enabled. Implements an exponential backoff retry loop (up to 3 attempts for transient HTTP 429/5xx errors).
   - **Step 2:** Formats transcript and invokes `gemini-2.5-flash` to map `Speaker 1`/`Speaker 2` to `Interviewer`/`Candidate` and generate structured JSON evaluation (`summary`, `strengths`, `areas_for_improvement`, `topics_discussed`, `overall_observations`).

---

## 11. Implemented Foundation

Phases 1A-1C added authenticated participant identity, Firebase custom-token access, retryable audio processing, automatic integrity report updates, and recording/report reliability. See the phase documents for configuration and verification details. Earlier UI and setup work includes:

1. **Rebranding to CodeLock:**
   - Full user-facing rebrand from *InterviewShield* to **CodeLock** (Subtitle: *AI-Powered Remote Technical Interview Platform*).
   - Updated `LandingPage.jsx`, `Dashboard.jsx`, `Auth.jsx`, `SetupPage.jsx`, `InterviewPage.jsx`, `MonitorPage.jsx`, `index.html`, and `README.md`.
   - Internal technical identifiers (`com.interviewshield.backend`, DB table names, API paths) intentionally preserved for stability.
2. **Pre-Interview Device Check & Photo Flow (`SetupPage.jsx`):**
   - Implemented 3-step setup: (1) System & browser checks, (2) Live camera & microphone audio meter test, (3) Session photo capture.
   - Fixed camera stream reuse across steps without re-requesting permissions.
   - Removed aggressive image-darkness heuristics to eliminate false-positive warnings.
3. **Backend-Authoritative Readiness State:**
   - Added `candidateReady`, `interviewerReady`, `candidatePhoto`, and `interviewerPhoto` fields to `InterviewSession`.
   - Added `POST /api/sessions/{code}/ready` and `GET /api/sessions/{code}/readiness` endpoints.
   - Added route guards in `App.jsx` (`/monitor/{code}`, `/interview/{code}`) checking backend readiness.
4. **Candidate Fullscreen Timing Correction:**
   - Removed premature fullscreen request on "Join Session" in `Dashboard.jsx`.
   - Candidate remains in normal windowed mode through setup, entering fullscreen synchronously upon clicking "Enter Interview as Candidate" in `SetupPage.jsx`.
5. **WebSocket Server Crash Fix on Session End:**
   - In `app/ws-server.js`, patched `notifyAndCloseSession` to filter peers with `[room.candidate, room.interviewer].filter(Boolean)`.
   - Added null guards in `sendError` and `closeSocket` to prevent crashes when peers are already disconnected.
6. **Gemini Transcribe Rate-Limit Resilience:**
   - In `AI/interview_ai.py`, added an exponential retry loop with jitter and `Retry-After` header support for `gemini-3.5-transcribe` calls.
7. **WebRTC TURN/STUN Configuration:**
   - Updated `useWebRTCCall.js` to read `VITE_STUN_URL`, `VITE_TURN_URL`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL`.

---

## 12. Security & Proctoring Implementation

- **Stateless JWT:** 24-hour expiration signed with HMAC-SHA256. Role claim verified in Spring Security filter and WebSocket handshake.
- **Proctoring Telemetry:**
  - `visibilitychange` and window `blur`/`focus` listeners detect tab-switching.
  - `fullscreenchange` detects candidate leaving fullscreen.
  - Events are immediately transmitted to the interviewer over WebSocket and persisted to MySQL via `POST /api/logs`.
- **CORS & Network Policy:** Local private IPs and localhost whitelisted in `SecurityConfig.java`. Must be scoped down before public deployment.

---

## 13. Known Limitations & Technical Debt

1. **Session-Scoped In-Memory WS State:**
   - `ws-server.js` stores rooms in an in-memory `Map`. Does not scale horizontally across multiple Node processes without a Redis Pub/Sub adapter.
2. **Single-Instance Recording Storage:**
   - Retryable audio is stored on the Spring host filesystem. Multiple backend instances would require coordinated storage and job ownership.
3. **Browser-Based Code Execution:**
   - Candidate code execution uses browser-side `new Function(...)` or eval, without an isolated sandboxed runner.
4. **Local TLS Discovery:**
   - Vite and the relay scan the app directory for local certificates. Production should terminate HTTPS/WSS through the deployment proxy and use explicit service configuration.

---

## 14. Legacy Cleanup Candidates & Plan

Firebase is active architecture, not a cleanup candidate. It provides authenticated code recovery and persistent alert history. The `firebase` browser SDK and Firebase Admin dependency must remain.

Yjs/CRDT packages were removed in Phase 2A after repository-wide reference checks confirmed that the native `ws` relay and React application never imported them.

Questionable compatibility paths should remain until their consumers are verified. This includes the legacy `TAB_SWITCH` report calculation and both POST/PUT support for the end-session endpoint.

---

## 15. Testing & Verification Guide

### Manual E2E Testing Checklist

1. **Interviewer Setup & Session Creation:**
   - Log in as interviewer -> Create session -> Copy session code.
   - Click "Monitor Session" -> Complete setup (camera, mic meter, photo) -> Enter Monitor Room.
2. **Candidate Join & Setup:**
   - In separate browser (or incognito), log in as candidate.
   - Enter session code on `/dashboard` -> Verify setup page opens in normal window.
   - Verify camera preview, mic meter, and photo capture.
   - Click "Enter Interview as Candidate" -> Verify browser requests and enters fullscreen.
3. **Live Sync & Proctoring:**
   - Candidate types in Monaco editor -> Verify code instantly mirrors on interviewer's screen.
   - Candidate switches tabs -> Verify alert appears on interviewer's monitor and log is created.
   - Candidate presses ESC to exit fullscreen -> Verify fullscreen warning overlay appears.
4. **WebRTC Media:**
   - Verify two-way video and audio between candidate and interviewer.
   - Test microphone and camera mute toggles on `VideoCallPanel.jsx`.
5. **Session End & AI Report:**
   - Interviewer clicks "End Session".
   - Verify both sockets close cleanly without errors on `ws-server.js`.
   - Verify Spring Boot accepts audio (`202 Accepted`) and Python AI service generates transcript and report.
   - Verify report renders on interviewer's monitor page.

---

## 16. Deployment & Environment Considerations

- **HTTPS / WSS Requirement:** Browsers mandate secure origins (`https://` and `wss://`) for `getUserMedia()` and WebRTC. For local development, valid self-signed certificates must be present in `app/cert.pem` and `app/key.pem`.
- **CORS in Production:** Update `SecurityConfig.java` to restrict allowed origins to the production domain.
- **STUN/TURN Servers:** For public networks behind symmetric NATs or corporate firewalls, configure `VITE_TURN_URL`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL`.

---

## 17. Git state

Development continues on `feature/realtime-code-sync`. Always inspect the live branch, HEAD, and working tree instead of relying on a commit hash recorded in documentation.

---

## 18. Immediate Next Steps for Codex / Future Agents

1. Keep Firebase fallback/history, WebSocket authorization, WebRTC, audio retention/retry, and report calculations covered during future changes.
2. Prepare the documented single-instance deployment with persistent MySQL and recording storage, HTTPS/WSS, process supervision, logs, health checks, and TURN.
3. Treat horizontal scaling and sandboxed code execution as separate architecture projects rather than cleanup work.
