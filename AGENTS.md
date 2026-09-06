# InterviewShield Agent Guide

## Project Overview

InterviewShield is a full-stack web platform for remote technical interviews. Interviewers create interview sessions with a problem statement and a unique session code. Candidates join a session, write JavaScript in a Monaco editor, and submit code. The app currently logs suspicious activity such as tab switching and webcam snapshots, and interviewers can view reports.

## Repository Structure

- `app/`: React + Vite frontend.
- `app/src/`: Main frontend pages and UI logic.
- `app/ws-server.js`: Existing Node WebSocket server intended for Yjs collaborative editing. It is not currently wired into the React app.
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
- Firebase Realtime Database for current live code sync and live tab alerts
- Spring Boot 3.2.5
- Spring Security
- JWT authentication
- Spring Data JPA
- MySQL

Present but not meaningfully integrated into the app:

- `ws`
- `yjs`
- `y-websocket`
- `y-webrtc`
- `y-monaco`

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

The frontend currently uses Firebase for:

- live candidate code mirroring
- live tab-switch alerts

## Database and Environment Configuration

The backend expects these environment variables:

```text
DB_URL
DB_USER
DB_PASSWORD
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
- Do not remove Firebase, snapshots, or Yjs-related dependencies until replacement behavior exists and is verified.
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
- Firebase Realtime Database remains as a temporary fallback for code mirroring and tab-switch counts.
- Tab switches are persisted through REST and also sent as WebSocket alerts.
- WebRTC uses that WebSocket relay solely for session-scoped offer/answer/ICE signaling; media travels peer-to-peer.
- Webcam snapshots are still periodically captured and stored through REST logs as a legacy system.

Planned but NOT implemented yet:

- Removal of Firebase realtime sync after WebSocket behavior is manually verified.
- Removal of webcam snapshots after live video behavior is manually verified.

Planned architecture:

- Spring Boot + MySQL handle REST and durable data.
- WebSocket handles realtime messages.
- WebRTC handles camera and microphone media.
- WebSocket carries WebRTC signaling only, not video/audio.
- Candidate remains the only code editor; interviewer receives a read-only mirror.
- Yjs/CRDT/OT should not be used unless simultaneous multi-user editing becomes a concrete requirement.
