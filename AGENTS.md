# CodeLock Agent Guide

## Project Overview

CodeLock is a full-stack web platform for remote technical interviews. Interviewers create sessions with a problem statement and unique code. Candidates complete readiness checks, join one assigned session, use Monaco, and submit code. The platform provides live video/audio, integrity monitoring, durable reports, and retryable AI transcription and assessment.

## Repository Structure

- `app/`: React + Vite frontend.
- `app/src/`: Main frontend pages and UI logic.
- `app/ws-server.js`: Authenticated Node WebSocket relay for code sync, presence, integrity notifications, and WebRTC signaling.
- `backend/`: Spring Boot backend.
- `backend/src/main/java/com/interviewshield/backend/`: Controllers, DTOs, models, repositories, services, and security.
- `backend/src/main/resources/application.properties`: Backend environment and database config.
- `backend/src/test/`: Minimal backend test coverage.

## Important Technologies

Currently used:

- React 19
- Vite
- Tailwind CSS
- Monaco editor through `@monaco-editor/react`
- Axios for REST calls
- Native `ws` WebSocket relay for primary realtime behavior
- Firebase Realtime Database for authenticated code fallback and alert history
- WebRTC and browser MediaRecorder for interview media and interviewer recording
- Spring Boot 3.2.5
- Spring Security
- JWT authentication
- Spring Data JPA
- MySQL

## Current Frontend/Backend Communication

The frontend calls the backend REST API at:

```text
http://localhost:8081/api
```

The backend handles:

- authentication
- session creation and lookup
- activity log persistence
- report generation

The frontend uses the Node relay for primary realtime code, presence, integrity notifications, and WebRTC signaling. It uses authenticated Firebase access for:

- persistent candidate code fallback/recovery
- accumulated integrity alert history

## Database and Environment Configuration

The backend expects these environment variables:

```text
DB_URL
DB_USER
DB_PASSWORD
JWT_SECRET
FIREBASE_PROJECT_ID
FIREBASE_SERVICE_ACCOUNT_PATH
AI_BASE_URL
AUDIO_STORAGE_DIR
```

Example local database URL:

```text
jdbc:mysql://localhost:3306/interviewshield
```

The backend runs on port `8081`.

The realtime relay runs separately on port `1234`:

```text
cd app
npm run realtime
```

## Existing Constraints

- Do not assume Firebase, WebSocket, or WebRTC behavior without checking the current code.
- Frontend code is JavaScript/JSX, not TypeScript.
- The backend currently returns many responses as `Map<String, Object>`.
- Error response keys are inconsistent in some places and should be handled carefully.
- The app currently stores auth data in `localStorage`.
- Existing behavior should be preserved unless a task explicitly calls for changing it.
- Avoid introducing new libraries unless there is a clear need.

## Security and Privacy-Sensitive Areas

Be careful when touching:

- JWT generation and validation
- password handling
- authorization checks
- webcam/camera/microphone access
- activity logging
- submitted code storage and display
- browser-based code execution with `new Function`
- Firebase credentials/config
- future WebSocket session isolation
- future WebRTC signaling

Do not log tokens, passwords, webcam data, submitted code, or private user data unnecessarily.

## Rules for Making Changes

- Read relevant files before editing.
- Keep changes small and scoped.
- Do not rewrite working code for style alone.
- Prefer existing project patterns unless there is a clear maintainability problem.
- Preserve REST API response shapes unless intentionally migrating them.
- Avoid mixing durable data responsibilities with realtime-only responsibilities.
- Preserve Firebase fallback/history and its custom-token authorization unless a task explicitly changes that architecture.
- If adding realtime code later, keep WebSocket message types explicit and session-scoped.

## Testing Expectations

Current tests are minimal. Before risky refactors, prefer adding focused backend tests around:

- auth success/failure
- session lookup
- activity log creation
- report/risk calculation

For frontend changes, manually verify:

- login/register
- interviewer session creation
- candidate join
- code editor behavior
- tab-switch logging
- report display

When WebSocket/WebRTC work begins, also verify:

- candidate/interviewer same-session isolation
- reconnect behavior
- duplicate browser tabs
- camera/microphone permission denial
- cleanup on page leave

## Realtime Architecture Status

Current implemented realtime behavior:

- An authenticated, session-isolated Node WebSocket relay at `app/ws-server.js` is used by the React app for candidate-authoritative code synchronization and presence.
- Firebase Realtime Database remains an authenticated fallback for code recovery and durable alert counts.
- Tab switches are persisted through REST and also sent as WebSocket alerts.
- WebRTC uses that WebSocket relay solely for session-scoped offer/answer/ICE signaling; media travels peer-to-peer.
- The interviewer records mixed interview audio; failed AI processing retains private filesystem audio for an owner-only retry window.

Current architecture:

- Spring Boot + MySQL handle REST and durable data.
- WebSocket handles realtime messages.
- WebRTC handles camera and microphone media.
- WebSocket carries WebRTC signaling only, not video/audio.
- Candidate remains the only code editor; interviewer receives a read-only mirror.
- Yjs/CRDT/OT is not used because editing is candidate-authoritative rather than collaborative.
