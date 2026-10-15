# CodeLock local setup

## Prerequisites

- Java 17 and MySQL 8
- Node.js and npm
- Python 3.10+ with `python-dotenv`
- `mkcert` for local HTTPS/WSS certificates
- A Firebase project with Authentication initialized and Realtime Database enabled
- A Gemini API key for real AI requests

## 1. Database and backend environment

Create the database:

```sql
CREATE DATABASE interviewshield;
```

Set these in the environment that launches Spring Boot:

```text
DB_URL=jdbc:mysql://localhost:3306/interviewshield
DB_USER=root
DB_PASSWORD=<mysql-password>
JWT_SECRET=<random-secret-of-at-least-32-UTF-8-bytes>
FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_SERVICE_ACCOUNT_PATH=<absolute-path-outside-repository>
AI_BASE_URL=http://127.0.0.1:8000
AUDIO_STORAGE_DIR=<absolute-private-persistent-directory>
```

Use the exact same `JWT_SECRET` for Spring and the Node relay. Never put it in a `VITE_*` variable or commit it. Protect `AUDIO_STORAGE_DIR`; it temporarily contains failed interview recordings. Spring runs on port `8081` and updates the local schema through the existing Hibernate configuration.

Start the backend:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

## 2. Firebase browser configuration

Copy `app/.env.example` to ignored `app/.env.local` and set the five `VITE_FIREBASE_*` values from the same Firebase project. These values identify the web app; service-account credentials remain server-side.

In Firebase Console:

1. Initialize Authentication. No sign-in provider is required for custom tokens.
2. Add the local/deployment hostname to authorized domains when needed.
3. Publish `firebase/database.rules.json` to the actual Realtime Database instance.
4. Keep the database default-deny. Do not restore public read/write rules.

See `PHASE_1B.md` for the complete access model and verification procedure.

## 3. Local TLS and frontend

From the repository root, run `setup.bat` once to generate ignored certificates in `app/` for localhost and the active LAN address. Then:

```powershell
cd app
npm install
npm run dev
```

Vite serves HTTPS on port `5173` and proxies `/api` to Spring. Optional frontend values are documented in `app/.env.example`, including the realtime URL and STUN/TURN settings.

## 4. Realtime relay

Start this from a second shell with the same `JWT_SECRET` used by Spring:

```powershell
cd app
npm run realtime
```

The relay uses WSS on port `1234` by default. `API_BASE_URL` can override its Spring API base, and `REALTIME_PORT` can override the relay port.

## 5. Python AI service

Set `GEMINI_API_KEY` outside source control, then start:

```powershell
cd AI
python gemini_copilot.py
```

The service listens on `127.0.0.1:8000` by default. Existing `GEMINI_TRANSCRIBE_MODEL` and `GEMINI_MODEL` overrides remain optional; do not change models as part of setup.

## 6. Local verification

Use separate interviewer and candidate browsers. Verify setup/photos, fullscreen, code sync and Firebase fallback, live integrity updates, reconnect, WebRTC media, end-session audio upload, AI retry, and completed-session reopening. The automated test commands are documented in the phase handoff files.
