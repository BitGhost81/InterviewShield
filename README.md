# 🛡️ InterviewShield

**A web platform for conducting secure, monitored technical interviews remotely.**

InterviewShield is a full-stack web application designed to make remote technical interviews more secure and transparent.

Interviewers can create an interview session with a unique code and problem statement. Candidates join the session, solve the problem using a built-in Monaco code editor, and run their code directly in the browser.

While the interview is happening, InterviewShield monitors candidate activity such as tab switching and immediately alerts the interviewer. The interviewer can also see the candidate's code being updated in real time and communicate through a built-in video call.

After the interview, the interviewer receives a detailed report containing the candidate's risk score, suspicious activity timeline, and submitted code.

---

## ✨ Features

- 👤 **Role-based authentication** — Separate Interviewer and Candidate roles
- 🔑 **Interview sessions** — Create sessions with unique 6-character codes
- 💻 **Monaco Code Editor** — Professional in-browser coding environment
- ▶️ **Code execution** — Run JavaScript and view console output
- 🔄 **Real-time code synchronization** — Interviewer can watch candidate code changes live
- 🚨 **Tab-switch detection** — Detects and logs candidate tab switching
- 📢 **Live alerts** — Interviewers receive suspicious-activity alerts instantly
- 🎥 **Built-in video calling** — Peer-to-peer video communication using WebRTC
- 📊 **Risk scoring** — Automatically calculates a candidate risk score
- 📋 **Interview reports** — View complete post-interview activity
- 💾 **Code export** — Download submitted code
- 🖨️ **Printable reports** — Generate a printable version of the interview report

---

## 🏗️ How It Works

### 1. Interviewer creates a session
The interviewer logs in, creates an interview session, and provides a coding problem.

### 2. Candidate joins
The candidate enters the unique session code and joins the interview.

### 3. Interview begins
The candidate solves the problem using the built-in code editor while communicating with the interviewer through video.

### 4. Activity is monitored
InterviewShield tracks events such as tab switching and sends live alerts to the interviewer.

### 5. Interviewer monitors remotely
The interviewer can simultaneously:

- Watch the candidate's code in real time
- Receive activity alerts
- View the candidate's risk score
- Communicate through video

### 6. Interview report
After the session, the interviewer receives a report containing the candidate's activity timeline, risk score, and final submitted code.

---

## 🧩 Project Structure

```text
InterviewShield/
│
├── app/                         # React frontend
│   ├── src/
│   ├── public/
│   └── package.json
│
├── backend/                     # Spring Boot backend
│   ├── src/
│   ├── pom.xml
│   └── ...
│
├── README.md                    # Project documentation
└── SETUP.md                     # Installation and setup guide