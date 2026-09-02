import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Link, Navigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';


// Backend integration 
import LandingPage from './LandingPage';
import MonitorPage from './MonitorPage';
import InterviewPage from './InterviewPage';
import Dashboard from './Dashboard';
import Auth from './Auth';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyC2uS-fcWCYzMyQqCy72EkBl8CWdoLCpus",
  authDomain: "collab-editor-44d5f.firebaseapp.com",
  databaseURL: "https://collab-editor-44d5f-default-rtdb.firebaseio.com",
  projectId: "collab-editor-44d5f",
  storageBucket: "collab-editor-44d5f.firebasestorage.app",
  messagingSenderId: "679361511798",
  appId: "1:679361511798:web:ad5885e20b9784cebd7a57"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function initializeRealtimeSync(editor, roomId) {
  const docRef = ref(db, `documents/${roomId}`);

  let suppress = false;

  // Listen for remote changes
  onValue(docRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const remote = data.content || "";
    const local = editor.getValue();

    if (remote !== local) {
      suppress = true;
      const pos = editor.getPosition();
      editor.setValue(remote);
      if (pos) editor.setPosition(pos);
      suppress = false;
    }
  });

  // Push local edits
  editor.onDidChangeModelContent(() => {
    if (suppress) return;
    const content = editor.getValue();
    set(docRef, { content });
  });
}


// Utility function to generate random session ID
const generateSessionId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};





// Join Page Component
function JoinPage() {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState('');
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    setFadeIn(true);
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    if (sessionId.trim()) {
     navigate(`/interview/${sessionId.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white flex flex-col items-center justify-center px-6">
      <div className={`max-w-2xl w-full transition-all duration-1000 ${fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* Back link */}
        <Link to="/" className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-12">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>

        {/* Title */}
        <h1 className="text-5xl font-bold mb-4">Join a Session</h1>
        <p className="text-xl text-gray-400 mb-12">
          Enter the session ID shared with you to start collaborating.
        </p>

        {/* Join Form */}
        <form onSubmit={handleJoin} className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-10 shadow-2xl">
            <label className="block text-sm font-medium text-gray-400 mb-3">
              Session ID
            </label>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value.toUpperCase())}
              placeholder="Enter 6-character code"
              maxLength={6}
              className="w-full px-6 py-4 bg-gray-950 border border-gray-700 rounded-xl text-3xl font-mono tracking-wider text-center focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={sessionId.length < 6}
            className="w-full px-10 py-5 bg-white text-black rounded-2xl font-semibold text-lg hover:bg-gray-100 transition-all duration-300 hover:scale-105 shadow-2xl shadow-white/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Join Session
          </button>
        </form>
      </div>
    </div>
  );
}

// Main App Component with Router
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/monitor/:sessionCode" element={<MonitorPage />} />
        <Route path="/interview/:sessionCode" element={<InterviewPage />} />
        
        
      </Routes>
    </BrowserRouter>
  );
}