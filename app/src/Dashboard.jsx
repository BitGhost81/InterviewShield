import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = 'http://192.168.1.9:8081/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const userId = localStorage.getItem('userId');
  const userName = localStorage.getItem('userName');
  const token = localStorage.getItem('token');
  if (!token) { navigate('/login'); return null; }

  const headers = { Authorization: `Bearer ${token}` };

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
    } catch (err) {
      alert('Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.clear();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white">

      {/* Navbar */}
      <nav className="bg-gray-900 border-b border-gray-800 px-8 py-4 flex items-center justify-between">
        <div className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          InterviewShield
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">👋 {userName}</span>
          <span className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-full text-xs font-medium">INTERVIEWER</span>
          <button onClick={logout} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">
            Logout
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Create Session */}
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 mb-10">
          <h2 className="text-2xl font-bold mb-6">Create Interview Session</h2>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Session title (e.g. Java Backend Interview)"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Problem statement (e.g. Write a function to reverse a linked list...)"
              value={problem}
              onChange={e => setProblem(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button
              onClick={createSession}
              disabled={loading}
              className="w-full py-3 bg-white text-black rounded-xl font-semibold hover:bg-gray-100 transition-all disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </div>

        {/* Active Sessions */}
        {sessions.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Active Sessions</h2>
            <div className="space-y-4">
              {sessions.map(session => (
                <div key={session.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-lg">{session.title}</div>
                    <div className="text-gray-400 text-sm mt-1">{session.problemStatement.substring(0, 80)}...</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-mono font-bold text-blue-400">{session.sessionCode}</div>
                      <div className="text-gray-500 text-xs">Session Code</div>
                    </div>
                    <button
                      onClick={() => navigate(`/monitor/${session.sessionCode}`)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      Monitor
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {sessions.length === 0 && (
          <div className="text-center text-gray-500 py-20">
            No sessions yet. Create one above.
          </div>
        )}
      </div>
    </div>
  );
}