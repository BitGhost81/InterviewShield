import React from 'react';
import { BrowserRouter, Routes, Route, useParams, Navigate } from 'react-router-dom';

// Backend integration 
import LandingPage from './LandingPage';
import MonitorPage from './MonitorPage';
import InterviewPage from './InterviewPage';
import Dashboard from './Dashboard';
import Auth from './Auth';

import CursorLight from './components/CursorLight';

function InterviewerMonitorRoute() {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (userRole !== 'INTERVIEWER') {
    return <Navigate to="/dashboard" replace />;
  }

  return <MonitorPage />;
}

function CandidateInterviewRoute() {
  const { sessionCode } = useParams();
  const userId = localStorage.getItem('userId');
  const joinKey = `interviewshield:join:${userId}:${sessionCode}`;

  if (!sessionStorage.getItem(joinKey)) {
    return <Navigate to="/dashboard" replace />;
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
        <Route path="/monitor/:sessionCode" element={<InterviewerMonitorRoute />} />
        <Route path="/interview/:sessionCode" element={<CandidateInterviewRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
