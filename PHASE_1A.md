# Phase 1A: participant authorization and JWT configuration

Both Spring Boot and the Node relay now require the **same** `JWT_SECRET`
environment variable (at least 32 UTF-8 bytes). Use a randomly generated secret,
keep it outside source control, and set it in both processes' environments before
starting them. There is no hardcoded fallback. A root `.env` file is not
automatically loaded by Java or Node. Never put this secret in a `VITE_*` variable.
Changing it requires users to sign in again.

The existing candidate WebSocket join probe calls the new authenticated backend
`POST /api/sessions/{code}/participation` through the relay. The backend assigns
the candidate from the authenticated user, using a database row lock. The response
contains `id`, `role`, and `status`; existing REST success responses are unchanged.
The relay uses this validated ID for presence, message sender IDs and candidate
alert IDs, ignoring browser-provided IDs.

One candidate identity is assigned per session, including while disconnected.
The same candidate can reconnect and repeat setup. A different candidate needs a
new session. Knowing an unclaimed session code remains the invitation mechanism.
Duplicate active candidate sockets remain rejected by the relay.

The existing Hibernate `ddl-auto=update` configuration adds a nullable
`candidate_id` column and a `version` column (default 0) to `sessions` on backend
startup. Version checking prevents concurrent readiness/AI writes from silently
overwriting participant assignment; conflicting updates return 409 for retry.
Back up existing data before applying this schema change. Pre-existing sessions have no verified
candidate assignment: their first authenticated admission clears unbound
candidate readiness/photo and requires setup again. Existing logs, reports and
interviewer photos are retained; subsequent reconnects preserve readiness/photos.
Restart backend and relay together and rejoin active interviews after upgrading.

Candidate logging/submission and readiness require assigned participation. Log
candidate IDs come from authentication. Readiness requires the matching role;
interviewer operations require ownership. Final audio upload and AI report access
remain allowed for the owner after session end. Copilot requires the existing
`context.session_id` and validates ownership before forwarding to Python.

Firebase behavior, media/recording, Gemini models and AI processing are unchanged.
Firebase rules/security are a separate deployment gate; these fixes do not secure
direct RTDB access.

## Local verification (no paid API calls)

- Backend: `mvn "-Dtest=Phase1AAuthorizationTests,Phase1AHttpTests" test`
- Relay: `node --test tests/ws-authorization.test.mjs` (run from `app`; uses local
  certificates and a local stub backend, with TLS verification disabled only in tests)
- Frontend: `npm run build` and `node node_modules/eslint/bin/eslint.js src`
- Manually verify two browsers: create/join, device checks/photos, fullscreen,
  code sync, focus alerts, reconnect, duplicate candidate rejection, end session,
  and owner report access. Actual AI processing is not exercised by these tests.
