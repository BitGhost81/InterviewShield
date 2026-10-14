import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';

// Backend integration 
import LandingPage from './LandingPage';
import MonitorPage from './MonitorPage';
import InterviewPage from './InterviewPage';
import Dashboard from './Dashboard';
import Auth from './Auth';
import SetupPage from './SetupPage';

import CursorLight from './components/CursorLight';

const API = import.meta.env.VITE_API_URL || '/api';

function InterviewerSetupRoute() {
  const { sessionCode } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (userRole !== 'INTERVIEWER') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <SetupPage
      sessionCode={sessionCode}
      role="interviewer"
      onComplete={() => navigate(`/monitor/${sessionCode}`, { replace: true })}
    />
  );
}

function InterviewerMonitorRoute() {
  const { sessionCode } = useParams();
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole');
  const [readyCheck, setReadyCheck] = useState('checking'); // 'checking' | 'ready' | 'not_ready'

  useEffect(() => {
    if (!token || userRole !== 'INTERVIEWER') return;

    // Verify authoritative readiness with backend endpoint
    axios.get(`${API}/sessions/${sessionCode}/readiness`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (res.data?.interviewerReady) {
          sessionStorage.setItem(`codelock:setup:${sessionCode}:interviewer`, '1');
          setReadyCheck('ready');
        } else {
          sessionStorage.removeItem(`codelock:setup:${sessionCode}:interviewer`);
          setReadyCheck('not_ready');
        }
      })
      .catch(() => {
        sessionStorage.removeItem(`codelock:setup:${sessionCode}:interviewer`);
        setReadyCheck('not_ready');
      });
  }, [sessionCode, token, userRole]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (userRole !== 'INTERVIEWER') {
    return <Navigate to="/dashboard" replace />;
  }

  if (readyCheck === 'checking') {
    return (
      <div className="min-h-screen bg-ink text-white flex items-center justify-center">
        <div className="text-white/60 text-sm">Verifying setup status...</div>
      </div>
    );
  }

  if (readyCheck === 'not_ready') {
    return <Navigate to={`/monitor/${sessionCode}/setup`} replace />;
  }

  return <MonitorPage />;
}

function CandidateSetupRoute() {
  const { sessionCode } = useParams();
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('token');
  const joinKey = `interviewshield:join:${userId}:${sessionCode}`;

  if (!token || !sessionStorage.getItem(joinKey)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <SetupPage
      sessionCode={sessionCode}
      role="candidate"
      onComplete={() => navigate(`/interview/${sessionCode}`, { replace: true })}
    />
  );
}

function CandidateInterviewRoute() {
  const { sessionCode } = useParams();
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('token');
  const joinKey = `interviewshield:join:${userId}:${sessionCode}`;
  const [readyCheck, setReadyCheck] = useState('checking'); // 'checking' | 'ready' | 'not_ready'

  useEffect(() => {
    if (!token || !sessionStorage.getItem(joinKey)) return;

    // Verify authoritative readiness with backend endpoint
    axios.get(`${API}/sessions/${sessionCode}/readiness`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (res.data?.candidateReady) {
          sessionStorage.setItem(`codelock:setup:${sessionCode}:candidate`, '1');
          setReadyCheck('ready');
        } else {
          sessionStorage.removeItem(`codelock:setup:${sessionCode}:candidate`);
          setReadyCheck('not_ready');
        }
      })
      .catch(() => {
        sessionStorage.removeItem(`codelock:setup:${sessionCode}:candidate`);
        setReadyCheck('not_ready');
      });
  }, [sessionCode, token, joinKey]);

  if (!token || !sessionStorage.getItem(joinKey)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (readyCheck === 'checking') {
    return (
      <div className="min-h-screen bg-ink text-white flex items-center justify-center">
        <div className="text-white/60 text-sm">Verifying device readiness...</div>
      </div>
    );
  }

  if (readyCheck === 'not_ready') {
    return <Navigate to={`/interview/${sessionCode}/setup`} replace />;
  }

  return <InterviewPage />;
}

// Main App Component with Router
export default function App() {
  return (
    <BrowserRouter>
      <CursorLight />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/join" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/monitor/:sessionCode/setup" element={<InterviewerSetupRoute />} />
        <Route path="/monitor/:sessionCode" element={<InterviewerMonitorRoute />} />
        <Route path="/interview/:sessionCode/setup" element={<CandidateSetupRoute />} />
        <Route path="/interview/:sessionCode" element={<CandidateInterviewRoute />} />
      </Routes>
    </BrowserRouter>
  );
}