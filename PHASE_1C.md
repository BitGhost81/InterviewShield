# Phase 1C: retained audio and interview reliability

This change is local only. No Firebase rules, services, or application deployments have been published.

## Configuration and restart

- Set Spring's `AUDIO_STORAGE_DIR` to an absolute, persistent, private directory owned by the backend service account. The development default is `./data/recordings`, relative to Spring's working directory. Do not put this directory under a web server's public root. On Linux use an owner-only directory (mode 700) and service umask 077; on Windows restrict its ACL to the service account and administrators. Recordings contain both participants' voices.
- Keep the same directory across backend restarts. For a future single AWS instance, use persistent storage, not an ephemeral container filesystem. Back up MySQL and retained files consistently; apply the same seven-day expiry to any recording backups. There is no recording download/public URL endpoint.
- Spring uses `AI_BASE_URL` for both Copilot and `/process-audio`; default `http://127.0.0.1:8000`. Python remains a private service. Existing Gemini model environment variables and credentials are unchanged.
- Restart Spring, Python, the Node realtime service, and Vite after applying the change.
- In Firebase Console, select the existing project and actual Realtime Database, open **Rules**, replace the rules with `firebase/database.rules.json`, and publish. The only schema addition is optional positive-integer `lastLogId` on an authorized candidate's alert record. It announces a committed REST activity log, including fullscreen/submission events. Existing identity checks, leases, read-only interviewer access and default deny remain intact. Do not delete existing data or enable public access. Old rules reject this marker; the WebSocket notification still works but fallback report refresh will warn/fail until rules are republished.

## Database and storage changes

Five nullable metadata columns are added to `sessions`: `recording_file` (varchar 255), `recording_mime` (varchar 255), `recording_expires_at` (datetime(6)), `processing_started_at` (datetime(6)), and `processing_token` (varchar 255). Existing `spring.jpa.hibernate.ddl-auto=update` adds them on startup; verify startup succeeds and inspect the actual MySQL table. No audio blobs are stored in MySQL and no existing data is deleted. For an environment that disables automatic schema updates, add these columns through its normal migration process before starting this version. Back up the database first. A real MySQL schema upgrade has not been exercised by the automated tests.

Audio is saved under a random filename before processing is accepted. The maximum raw upload is 18 MiB (multipart request limit 19 MiB); Python accepts the corresponding base64 data within a bounded 26 MiB JSON body. Browser recording requests 32 kbps audio, but actual size depends on browser support and interview length. Oversized audio requires an explicit decision to end without transcription.

Failed audio is retained for seven days from upload, not extended by retry. Successful transcript/report persistence deletes its audio. Maintenance runs every minute while Spring is running, recovers processing leases older than 15 minutes, and removes expired recordings. Files left by interrupted transactions/deletion failures are removed when unreferenced and older than one hour. An active job may finish shortly after retention expiry; it is bounded by the 12-minute Spring AI request timeout. When the service is stopped, deletion resumes at startup maintenance. Disk usage still needs operational monitoring; a minimum-free-space guard is not an overall quota.

Two backend jobs can run simultaneously; excess jobs keep their saved recording and become explicitly retryable. Database locking and per-attempt tokens prevent simultaneous retries and stale completions. Restarted/stuck jobs become retryable after the 15-minute lease expires. This filesystem/job design assumes a single backend instance. Moving to multiple backend instances would require coordinated file storage and job ownership.

Only the owning interviewer can upload, inspect AI status/history, or POST `/api/sessions/{code}/retry-audio`, including after the session ends. Legacy failed sessions without a retained recording cannot be retried. The report response retains its existing fields and adds `audioAvailable`, `retryAvailable`, `audioExpiresAt`, and `processingState`.

## Behavior

- End Session waits for the recorder's final data/stop event and upload acknowledgement before ending the session; it does not wait for Gemini. Failed uploads leave the page open so End Session can retry the same finalized blob. Do not navigate away before the upload is saved. Browser refresh before upload still loses in-memory audio.
- The interviewer records; candidate media/signaling remains unchanged. Reconnecting replaces the remote audio source without discarding previously recorded chunks. Teardown releases recording sources, tracks and audio context.
- Integrity reports refresh after persisted-activity notifications, Firebase history changes and presence/reconnect events. Notifications trigger a REST reread rather than adding counts. Requests are coalesced and serialized; no new integrity polling is introduced. Existing AI status polling remains.
- Activity lists use creation timestamp then database ID. The final code submission is deterministic, including tied timestamps. Risk scoring is unchanged. Duration is labeled **Logged Activity Span**, because it measures first-to-last logged activity rather than wall-clock interview duration.
- Python keeps its three transcription attempts and Gemini models. Numeric Retry-After delays are bounded to 30 seconds; private audio/transcript/upstream error bodies are not logged.

## Automated verification

- Backend: Phase1AAuthorizationTests, Phase1AHttpTests, Phase1BFirebaseTests, Phase1BFirebaseHttpTests, Phase1CAudioTests, Phase1CReportTests (32 tests).
- Frontend/relay: `node --test tests/*.test.mjs` in `app` (20 tests), production Vite build, ESLint on frontend sources and Node relay with Node globals.
- Firebase: `npm test` in `firebase` (8 emulator rules tests; demo project only).
- Python: `python -m unittest test_reliability.py` and `python -m py_compile interview_ai.py gemini_copilot.py` in `AI` (3 tests; mocked Gemini).
- Full `npm run lint` currently treats the Node relay as browser code and reports seven pre-existing `process`/`Buffer` no-undef errors. Its configuration is left unchanged; frontend lint and relay lint with explicit Node globals are checked separately.

No paid API requests, real two-browser media tests, real MySQL migration, or deployment are part of these automated checks.

## Manual regression checklist

1. Use two accounts/browsers. Verify login, owner-only session controls, candidate readiness/photos, one candidate, code sync/Firebase recovery, presence, fullscreen and Copilot.
2. Open the integrity report while active. Switch focus once, return, exit/restore fullscreen and submit code twice. Confirm automatic report/risk/latest-code updates, immediate away/fullscreen flags and no duplicate counts; refresh/reconnect and confirm counts persist. Repeat with WebSocket temporarily disconnected to exercise Firebase report notifications.
3. Speak on both sides, reconnect the candidate, speak again, then End Session immediately after speaking. Verify the final words and both sides of the reconnected conversation are included. Check no recording continues after leaving; candidate does not create a recorder. Deny recording/media permissions and confirm a clear warning and usable end-session decision.
4. Point AI_BASE_URL at an unavailable local service and restart Spring. End an interview, confirm upload is saved, session ends and AI fails. Close/reopen its completed monitor from the dashboard: history remains and Retry AI report is available. Restore the AI service/config and restart Spring, then explicitly retry without reupload. Confirm success and removal of the retained file. Real successful transcription uses your Gemini quota.
5. Double-click retry or issue concurrent requests: only one job runs. Candidate/other interviewer retry/upload/status requests must be forbidden. A Spring restart during processing must preserve the file and offer retry after lease expiry.
6. Simulate upload failure: End Session must not silently lose audio/end early. Retry while keeping the page open. Check the over-limit decision, unavailable/expired audio status, seven-day cleanup, and completed-session access after reopening.

## Changed files

The complete file inventory follows (generated from the working tree for this change).

<!-- inventory -->
- [.gitignore](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/.gitignore)
- [AI/gemini_copilot.py](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/AI/gemini_copilot.py)
- [AI/interview_ai.py](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/AI/interview_ai.py)
- [AI/test_reliability.py](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/AI/test_reliability.py)
- [PHASE_1C.md](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/PHASE_1C.md)
- [app/src/InterviewPage.jsx](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/src/InterviewPage.jsx)
- [app/src/MonitorPage.jsx](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/src/MonitorPage.jsx)
- [app/src/hooks/useRealtimeSession.js](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/src/hooks/useRealtimeSession.js)
- [app/src/hooks/useWebRTCCall.js](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/src/hooks/useWebRTCCall.js)
- [app/src/media/audioRecorder.js](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/src/media/audioRecorder.js)
- [app/src/realtime/messages.js](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/src/realtime/messages.js)
- [app/src/realtime/realtimeClient.js](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/src/realtime/realtimeClient.js)
- [app/src/realtime/reportRefresh.js](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/src/realtime/reportRefresh.js)
- [app/tests/phase1c-reliability.test.mjs](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/tests/phase1c-reliability.test.mjs)
- [app/tests/ws-authorization.test.mjs](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/tests/ws-authorization.test.mjs)
- [app/ws-server.js](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/ws-server.js)
- [backend/src/main/java/com/interviewshield/backend/BackendApplication.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/main/java/com/interviewshield/backend/BackendApplication.java)
- [backend/src/main/java/com/interviewshield/backend/controller/AiCopilotController.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/main/java/com/interviewshield/backend/controller/AiCopilotController.java)
- [backend/src/main/java/com/interviewshield/backend/controller/AuthorizationExceptionHandler.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/main/java/com/interviewshield/backend/controller/AuthorizationExceptionHandler.java)
- [backend/src/main/java/com/interviewshield/backend/controller/SessionController.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/main/java/com/interviewshield/backend/controller/SessionController.java)
- [backend/src/main/java/com/interviewshield/backend/model/InterviewSession.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/main/java/com/interviewshield/backend/model/InterviewSession.java)
- [backend/src/main/java/com/interviewshield/backend/repository/ActivityLogRepository.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/main/java/com/interviewshield/backend/repository/ActivityLogRepository.java)
- [backend/src/main/java/com/interviewshield/backend/security/SecurityConfig.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/main/java/com/interviewshield/backend/security/SecurityConfig.java)
- [backend/src/main/java/com/interviewshield/backend/service/ActivityLogService.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/main/java/com/interviewshield/backend/service/ActivityLogService.java)
- [backend/src/main/java/com/interviewshield/backend/service/AudioProcessingService.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/main/java/com/interviewshield/backend/service/AudioProcessingService.java)
- [backend/src/main/java/com/interviewshield/backend/service/SessionService.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/main/java/com/interviewshield/backend/service/SessionService.java)
- [backend/src/main/resources/application.properties](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/main/resources/application.properties)
- [backend/src/test/java/com/interviewshield/backend/Phase1AAuthorizationTests.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/test/java/com/interviewshield/backend/Phase1AAuthorizationTests.java)
- [backend/src/test/java/com/interviewshield/backend/Phase1AHttpTests.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/test/java/com/interviewshield/backend/Phase1AHttpTests.java)
- [backend/src/test/java/com/interviewshield/backend/Phase1CAudioTests.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/test/java/com/interviewshield/backend/Phase1CAudioTests.java)
- [backend/src/test/java/com/interviewshield/backend/Phase1CReportTests.java](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/backend/src/test/java/com/interviewshield/backend/Phase1CReportTests.java)
- [firebase/database.rules.json](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/firebase/database.rules.json)
- [firebase/tests/rules.test.mjs](C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/firebase/tests/rules.test.mjs)
