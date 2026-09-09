import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Link, Navigate } from 'react-router-dom';


// Backend integration 
import LandingPage from './LandingPage';
import MonitorPage from './MonitorPage';
import InterviewPage from './InterviewPage';
import Dashboard from './Dashboard';
import Auth from './Auth';
import { probeRealtimeJoin } from './realtime/realtimeClient';


import CursorLight from './components/CursorLight';

// Join Page Component
function JoinPage() {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('userId');

  const handleJoin = async (e) => {
    e.preventDefault();
    const code = sessionId.trim().toUpperCase();
    if (!code || !token) return;

    setJoining(true);
    setError('');

    try {
      await probeRealtimeJoin({
        sessionCode: code,
        role: 'candidate',
        userId,
        token,
      });

      sessionStorage.setItem(
        `interviewshield:join:${userId}:${code}`,
        JSON.stringify({ sessionCode: code, role: 'candidate', joinedAt: Date.now() })
      );
      navigate(`/interview/${code}`);
    } catch (joinError) {
      if (joinError?.code === 'session_occupied') {
        setError('Session already has a candidate.');
      } else {
        setError(joinError?.message || 'Unable to join this session.');
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center px-6 py-12 relative">
      <div className="max-w-md w-full animate-[fadeIn_0.5s_ease-out]">
        {/* Back link */}
        <Link to="/" className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-8 text-sm font-medium">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>

        {/* Join Card */}
        <div className="glass rounded-[28px] p-8 sm:p-10 shadow-2xl">
          {/* Title */}
          <div className="text-center mb-8">
            <div className="inline-grid place-items-center w-12 h-12 rounded-xl bg-gradient-to-br from-mint via-cyan to-violet shadow-[0_0_20px_rgba(76,229,232,0.35)] mb-4">
              <svg className="w-6 h-6" viewBox="0 0 20 22" fill="none">
                <path d="M10 1 18.5 4.7v5.7c0 4.7-3.6 8.6-8.5 10C5.1 19 1.5 15.1 1.5 10.4V4.7L10 1Z" stroke="#071014" strokeWidth="1.5" />
                <path d="m5.7 10.6 2.7 2.7 5.8-6" stroke="#071014" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold font-display tracking-tight mb-2">Join a Session</h1>
            <p className="text-sm text-gray-400">
              Enter your 6-character session code to start your interview.
            </p>
          </div>

          {/* Join Form */}
          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Session Code
              </label>
              <input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                placeholder="ABCDEF"
                maxLength={6}
                className="w-full px-4 py-3.5 bg-white/5 border border-white/15 rounded-xl text-2xl font-mono tracking-widest text-center text-white placeholder-gray-600 focus:outline-none focus:border-mint focus:ring-1 focus:ring-mint transition-all"
                autoFocus
              />
            </div>

            {error && (
              <div className="text-red-400 text-xs text-center py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/20">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={sessionId.length < 6 || joining}
              className="button-primary w-full py-3.5 text-sm font-semibold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {joining ? 'Checking session...' : 'Join Session ↗'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function CandidateInterviewRoute() {
  const { sessionCode } = useParams();
  const userId = localStorage.getItem('userId');
  const joinKey = `interviewshield:join:${userId}:${sessionCode}`;

  if (!sessionStorage.getItem(joinKey)) {
    return <Navigate to="/join" replace />;
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
        <Route path="/join" element={<JoinPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/monitor/:sessionCode" element={<MonitorPage />} />
        <Route path="/interview/:sessionCode" element={<CandidateInterviewRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
