# 🔒 CodeLock

**AI-Powered Remote Technical Interview Platform**

CodeLock is a full-stack web application designed to make remote technical interviews secure, seamless, and insightful.

Interviewers can create an interview session with a unique code and problem statement. Candidates join the session, pass a pre-interview device check, solve the problem using a built-in Monaco code editor, and run their code directly in the browser.

While the interview is happening, CodeLock monitors candidate integrity (window focus loss and fullscreen exit events) and immediately alerts the interviewer. The interviewer can also see the candidate's keystrokes in real time via an authoritative code mirror, communicate through peer-to-peer WebRTC video calling, and consult an integrated AI Copilot.

After the session, CodeLock generates a detailed report containing candidate activity logs, risk scoring, submitted code, and AI-powered speech-to-text transcriptions and assessments.

---

## ✨ Features

- 👤 **Role-based authentication** — Separate Interviewer and Candidate roles
- 🔑 **Interview sessions** — Create sessions with unique 6-character codes
- 🛠️ **Pre-interview device check** — Browser compatibility, camera & mic verification, and session photo capture
- 💻 **Monaco Code Editor** — Professional in-browser coding environment with syntax highlighting
- ▶️ **Code execution** — Run JavaScript safely and view console output
- 🔄 **Real-time code synchronization** — Interviewer watches candidate code changes live
- 🔒 **Fullscreen & Focus integrity** — Detects fullscreen exits and window focus loss
- 📢 **Live alerts** — Interviewers receive integrity alerts instantly
- 🎥 **Built-in video calling** — Peer-to-peer video & audio communication using WebRTC (STUN/TURN ready)
- 🤖 **AI Copilot & Transcription** — AI assistant for interviewers and automated interview assessment reports
- 📊 **Risk scoring** — Defensible, automated integrity risk scoring based on activity events
- 📋 **Comprehensive reports** — View post-interview timeline, AI insights, and final submitted code
- 💾 **Secure fallback/history** — Firebase RTDB uses short-lived custom-token access for code recovery and integrity history
- 🔁 **Retryable AI processing** — Failed recordings are retained privately for an owner-only retry window

---

## 🏗️ How It Works

### 1. Interviewer creates a session
The interviewer logs in, creates an interview session with a title, and receives a 6-character session code.

### 2. Pre-interview setup & device check
Both the interviewer and candidate pass through a device check before entering the interview:
- Browser capability verification
- Camera and microphone access test with live preview and mic meter
- Session reference photo capture

### 3. Candidate joins & interview begins
The candidate enters the session code, completes the device check, and enters the locked interview environment.

### 4. Live synchronization & integrity monitoring
CodeLock synchronizes code keystrokes in real time, monitors fullscreen and window focus state, and facilitates live WebRTC video communication.

### 5. Session report & AI analysis
After the interview ends, CodeLock generates an integrity report and processes the interview recording with AI speech-to-text and assessment models.

---

## 🧩 Project Structure

```text
CodeLock/
│
├── app/                         # React + Vite frontend
│   ├── src/                     # React components, pages, hooks, realtime client
│   └── package.json
│
├── backend/                     # Spring Boot backend (REST API, auth, JPA)
│   ├── src/
│   └── pom.xml
│
├── AI/                          # Python AI processing service (transcription & analysis)
│
├── firebase/                    # Realtime Database rules and emulator tests
│
├── README.md                    # Project documentation
└── SETUP.md                     # Installation and setup guide
```

## Architecture

- Spring Boot and MySQL own authentication, authorization, sessions, readiness, activity logs, reports, and recording metadata.
- The authenticated Node WebSocket relay is primary for candidate-authoritative code mirroring, presence, integrity notifications, and WebRTC signaling.
- Firebase RTDB remains an authenticated fallback for Monaco recovery and persistent alert history.
- WebRTC carries peer-to-peer media. TURN can be configured for restrictive networks.
- The interviewer records mixed call audio. Spring stores failed recordings in a private filesystem directory for explicit retry and forwards processing to the Python/Gemini service.

See [SETUP.md](SETUP.md) for current environment variables and local startup instructions. Phase-specific security and reliability details are in [PHASE_1A.md](PHASE_1A.md), [PHASE_1B.md](PHASE_1B.md), and [PHASE_1C.md](PHASE_1C.md).
