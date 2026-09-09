import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [deletingCode, setDeletingCode] = useState(null);
  const userId = localStorage.getItem('userId');
  const userName = localStorage.getItem('userName');
  const token = localStorage.getItem('token');

  const headers = { Authorization: `Bearer ${token}` };

  const deleteSession = async (sessionCode) => {
    if (!window.confirm(`Are you sure you want to delete session ${sessionCode}? All associated activity logs will be permanently removed.`)) {
      return;
    }

    setActionError('');
    setDeletingCode(sessionCode);
    try {
      await axios.delete(`${API}/sessions/${sessionCode}`, { headers });
      setSessions((prev) => prev.filter((s) => s.sessionCode !== sessionCode));
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete session';
      setActionError(msg);
      setTimeout(() => setActionError(''), 5000);
    } finally {
      setDeletingCode(null);
    }
  };

  useEffect(() => {
    if (!token) return;

    setHistoryLoading(true);
    axios.get(`${API}/sessions/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setSessions(res.data || []))
      .catch(() => alert('Failed to load your sessions'))
      .finally(() => setHistoryLoading(false));
  }, [token]);

  if (!token) { navigate('/login'); return null; }

  const createSession = async () => {
    if (!title || !problem) return alert('Fill in both fields');
    setLoading(true);
    try {
      const res = await axios.post(`${API}/sessions`, {
        title,
        problemStatement: problem,
        createdBy: parseInt(userId)
      }, { headers });

      const newSession = res.data;
      setSessions(prev => [newSession, ...prev]);
      setTitle('');
      setProblem('');
    } catch {
      alert('Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const initials = (userName || 'IN')
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen text-white pb-16 relative">
      {/* Top Navbar */}
      <header className="max-w-5xl mx-auto px-4 pt-6">
        <nav className="glass rounded-[24px] px-6 py-3.5 flex items-center justify-between shadow-xl">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <span className="grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-mint via-cyan to-violet shadow-[0_0_14px_rgba(76,229,232,0.35)] transition-transform group-hover:scale-105">
              <svg className="w-4 h-4" viewBox="0 0 20 22" fill="none">
                <path d="M10 1 18.5 4.7v5.7c0 4.7-3.6 8.6-8.5 10C5.1 19 1.5 15.1 1.5 10.4V4.7L10 1Z" stroke="#071014" strokeWidth="1.5" />
                <path d="m5.7 10.6 2.7 2.7 5.8-6" stroke="#071014" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display font-bold text-lg tracking-tight">InterviewShield</span>
          </Link>

          <div className="flex items-center gap-3.5">
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-white/60 text-xs">Logged in as</span>
              <span className="text-white font-medium text-xs">{userName || 'Interviewer'}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet to-cyan grid place-items-center font-display font-bold text-xs text-white shadow-md">
              {initials}
            </div>
            <button
              onClick={logout}
              className="button-ghost px-3.5 py-1.5 text-xs text-white/70 hover:text-white"
            >
              Logout
            </button>
          </div>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-8">
        {/* Create Session Card */}
        <section className="glass rounded-[28px] p-6 sm:p-8 mb-10 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-mint text-[11px] font-bold uppercase tracking-widest mb-1">New Assessment</div>
              <h2 className="font-display font-bold text-2xl tracking-tight text-white">Create Interview Session</h2>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Session Title
              </label>
              <input
                type="text"
                placeholder="e.g. Senior Frontend Engineer — Technical Screen"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:border-mint focus:ring-1 focus:ring-mint transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Problem Statement
              </label>
              <textarea
                placeholder="Describe the coding challenge, requirements, constraints, and test scenarios..."
                value={problem}
                onChange={e => setProblem(e.target.value)}
                rows={4}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:border-mint focus:ring-1 focus:ring-mint resize-none transition-all"
              />
            </div>

            <button
              onClick={createSession}
              disabled={loading}
              className="button-primary w-full sm:w-auto px-8 py-3 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              {loading ? 'Creating Session...' : 'Create Session ↗'}
            </button>
          </div>
        </section>

        {/* My Sessions List */}
        <section>
          <div className="flex items-baseline justify-between mb-5 px-1">
            <h2 className="font-display font-bold text-2xl tracking-tight text-white">My Sessions</h2>
            <span className="text-white/50 text-xs font-medium">
              {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} total
            </span>
          </div>

          {actionError && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs flex items-center justify-between animate-[fadeIn_0.3s_ease-out]">
              <span>⚠️ {actionError}</span>
              <button
                onClick={() => setActionError('')}
                className="text-red-400/60 hover:text-red-300 ml-3 text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {historyLoading ? (
            <div className="glass rounded-2xl p-12 text-center text-white/40 text-sm">
              Loading your interview sessions...
            </div>
          ) : sessions.length > 0 ? (
            <div className="space-y-3.5">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className="glass rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-white/35 hover:-translate-y-0.5"
                >
                  <div className="space-y-2">
                    <div className="font-display font-semibold text-lg text-white">
                      {session.title}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 font-mono text-cyan">
                        <span>Code:</span>
                        <strong className="font-bold tracking-wider">{session.sessionCode}</strong>
                      </span>

                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-mint/10 border border-mint/20 text-mint font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-mint" />
                        {session.status || 'Active'}
                      </span>

                      <span className="text-white/50">
                        Candidate: {session.candidateName || (session.candidateId ? `#${session.candidateId}` : 'Awaiting join')}
                      </span>
                    </div>

                    <div className="text-white/40 text-[11px]">
                      Created: {session.createdAt ? new Date(session.createdAt).toLocaleString() : 'Recent'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <button
                      onClick={() => navigate(`/monitor/${session.sessionCode}`)}
                      className="button-primary px-4 py-2 text-xs font-semibold"
                    >
                      Open Monitor ↗
                    </button>
                    <button
                      onClick={() => deleteSession(session.sessionCode)}
                      disabled={deletingCode === session.sessionCode}
                      className="px-3 py-2 text-xs font-semibold rounded-xl text-red-400/80 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all disabled:opacity-50"
                      title="Delete this session"
                    >
                      {deletingCode === session.sessionCode ? 'Deleting...' : 'Delete ✕'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass rounded-[24px] p-16 text-center border border-white/10">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 grid place-items-center mx-auto mb-3 text-white/40">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <p className="text-white/60 text-sm font-medium mb-1">No sessions created yet</p>
              <p className="text-white/40 text-xs">Create your first interview session above to get started.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
