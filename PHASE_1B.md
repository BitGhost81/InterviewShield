# Phase 1B: secure Firebase fallback and history

Firebase is retained. Node WebSocket remains primary for live code, presence and
signaling. No Firebase Console changes have been published by this implementation.

## How authorization works

The browser calls `POST /api/sessions/{code}/firebase-token` with its existing
CodeLock JWT. Spring checks Phase 1A admission for candidates or ownership for
interviewers. Firebase Admin signs a custom token whose UID is the authenticated
database user ID; additional claims restrict it to one session and participant
role. The response is `Cache-Control: no-store`.

Firebase Authentication exchanges that custom token for Firebase credentials.
Each mounted room uses a separate Firebase app with memory-only authentication;
credentials are not stored in localStorage and do not leak across browser tabs.
No service-account material is sent to the browser.

The rules enforce an absolute five-minute authorization lease, checked using
Firebase server time. The browser requests a new authorized custom token before
expiry. Firebase's automatic ID-token refresh does **not** extend this lease.
If Spring/JWT authorization is unavailable or revoked, access expires within
five minutes. Candidate access is additionally bounded by the three-hour session
expiry. Ending/deleting a session prevents further candidate renewal; an already
issued lease can remain usable for up to five minutes. Immediate revocation would
require a server-maintained ACL and is outside this minimal lease implementation.
Owner interviewers can continue reading historical session data.

Candidates can read only their session document and their own alert record, and
write only those locations during their lease. Only the owning interviewer can
obtain an interviewer token to read session-wide alerts; interviewer writes are
denied. Root access and all unspecified paths are denied. Rules do not make
client-side focus reporting tamper-proof; REST logs remain the durable report path.

## Required manual setup (do this before relying on Firebase)

1. Open Firebase Console and select the **existing** project used by CodeLock.
   Verify the project ID and the exact Realtime Database instance/URL. Export a
   backup of existing RTDB data and copy its currently published rules first.
2. Open **Authentication** and initialize Firebase Authentication if needed.
   Custom-token sign-in does not require enabling anonymous, email/password or
   Google providers. Keep anonymous sign-in disabled. Under Authentication settings
   add the app's localhost/deployment hostname to Authorized domains as applicable.
3. In **Project settings > General > Your apps**, select/register the Web app.
   Copy its public configuration into ignored `app/.env.local`:

   ```ini
   VITE_FIREBASE_API_KEY=<web-api-key>
   VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=<exact-RTDB-instance-URL>
   VITE_FIREBASE_PROJECT_ID=<project-id>
   VITE_FIREBASE_APP_ID=<web-app-id>
   ```

   These are public identifiers, not privileged credentials. Restart Vite after
   editing; production builds require these values at build time. Ensure API key
   restrictions permit Firebase Authentication/Identity Toolkit and token refresh
   for the intended web origins; do not loosen database rules to troubleshoot.
4. In **Project settings > Service accounts > Firebase Admin SDK**, generate a
   private key for a server service account in this project. Store the downloaded
   JSON **outside this repository**, with file access restricted to the backend
   service user. Never copy it into `app`, a `VITE_*` variable, screenshots or logs.
   Set these process environment variables before starting Spring:

   ```powershell
   $env:FIREBASE_PROJECT_ID = '<same-project-id>'
   $env:FIREBASE_SERVICE_ACCOUNT_PATH = 'C:\private\codelock-service-account.json'
   ```

   Keep the existing `JWT_SECRET`, DB settings, and Node configuration. A root
   `.env` is not loaded automatically by Java. For local signing with a private
   key, do not grant additional database-admin permissions just to make token
   creation work. Restrict service-account privileges and protect/revoke the key
   through Google IAM. The Admin SDK is used for signing only, not RTDB data writes.
5. In **Realtime Database > the verified instance > Rules**, replace the entire
   rules document with `firebase/database.rules.json`, then **Publish**. Check that
   the published rules match this file; do not leave parent `.read: true` or
   `.write: true` grants. This publication must be coordinated with the new backend
   and frontend; old clients cannot access the database under these rules.
6. Existing `{content: ...}` documents and accumulated alert records remain in
   place. The first authorized backup adds revision/writer/timestamp metadata.
   Do not delete legacy history. If a record contains extra experimental fields,
   archive it before selectively removing those fields: new writes deliberately
   validate only the documented schema.
7. Verify the **published** rules, not only the local file: unauthenticated reads
   of `/documents/<test-session>` and `/alerts/<test-session>` must return permission
   denied. With disposable test sessions, verify owner/candidate access, other-user
   rejection, cross-session rejection, read-only interviewer access, and lease expiry.
   Do not use a real interview to test destructive or invalid writes. Never paste
   custom/ID tokens or private keys into shared command history or reports.

Missing/incorrect configuration fails closed for Firebase and displays a warning;
it never restores anonymous access. Existing WS/REST paths continue to work.

## Reliability and lifecycle

- Candidate snapshots are saved to RTDB at most once per 300ms burst even while
  WS works, using serialized transactions and monotonically increasing revisions.
- Initial recovery runs once per connection and will not replace any candidate
  code typed while it was pending. Later RTDB values never edit the candidate's
  editor. A competing/stale writer aborts rather than rebasing old code over new.
- A last edit inside the debounce window may not be backed up before an abrupt
  tab/browser close. The current editor is never replaced to hide a backup error.
- Code backups have a 200,000-character validation limit. Larger editor buffers
  remain usable through the existing editor/WS path but display a backup failure.
- Atomic increments retain focus-loss totals. Initial authentication gaps queue
  focus events in memory. Counts are merged monotonically on both pages. Firebase
  history cannot replace WebSocket away/fullscreen/return flags.
- Queued, unacknowledged focus events require the page to remain open to retry;
  an abrupt close while offline cannot guarantee their delivery to RTDB. Already
  persisted history is retained. REST logging behavior is unchanged.
- Firebase auth refresh/expiry/retry timers, code debounce/recovery timers,
  subscriptions and Monaco change subscriptions are disposed on page leave.
- A warning indicates failed recovery, history writes or authentication. No new
  media, AI, TURN, JWT or Node protocol behavior is introduced.

## Non-paid verification

```powershell
cd backend
mvn "-Dtest=Phase1AAuthorizationTests,Phase1AHttpTests,Phase1BFirebaseTests,Phase1BFirebaseHttpTests" test
cd ..\app
node --test tests/firebase-reliability.test.mjs tests/ws-authorization.test.mjs
node node_modules/eslint/bin/eslint.js src
npm run build
cd ..\firebase
npm ci
npm test
```

Rules tests use localhost and the `demo-codelock` emulator project, never your live
database. Emulator tooling needs Java and a supported Node version (Node 22 is a
safe choice for the pinned CLI). No Gemini or paid API calls are made by tests.
If Windows leaves an emulator process after CLI shutdown, stop only that verified
test emulator before rerunning; do not stop other application Java processes.

## Candidate + interviewer manual regression

Use separate browsers/profiles, two different candidate identities, two interviewer
identities and two sessions. Verify create/join/setup/photos/fullscreen, WS live
code, camera/audio, Copilot and reports retain their current flow. Specifically:

1. Candidate types with WS connected; confirm Firebase document continues updating.
2. Disconnect only interviewer WS; fallback should show recent candidate code.
3. Refresh candidate; stored code recovers. Type immediately during slow Firebase
   authentication/read; delayed recovery must not replace those new edits.
4. Trigger focus loss/return and fullscreen exit/restore; Firebase history updates
   must not clear live flags. Refresh both sides and trigger another event; totals
   must increase from the previous total, not restart or double-count.
5. Interrupt Firebase/network and reconnect. Test token renewal for more than five
   minutes. Block renewal: access must fail after the current lease, with a warning.
6. Leave/rejoin repeatedly and test React StrictMode: no duplicate listeners,
   increments or leftover Firebase connections. A duplicate candidate writer must
   not overwrite newer data; it should warn and preserve its local buffer.
7. Other candidates/interviewers and unauthenticated requests cannot access session
   data; forged candidate IDs and unrelated paths are denied.
8. End the interview; owner can still read historical alerts; candidate cannot renew
   Firebase access. Check the documented maximum five-minute existing-lease window.
9. Verify existing audio upload/transcript/report behavior separately; these tests
   do not exercise paid Gemini processing.
