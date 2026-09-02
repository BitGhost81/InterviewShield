import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    setFadeIn(true);
  }, []);

  const features = [
    {
      icon: '🎯',
      title: 'Live Code Editor',
      desc: 'Monaco-powered editor with real-time sync. Both interviewer and candidate see the same code instantly.'
    },
    {
      icon: '👁️',
      title: 'Tab Switch Detection',
      desc: 'Every time a candidate leaves the interview tab, it is logged with a timestamp and flagged instantly.'
    },
    {
      icon: '📸',
      title: 'Webcam Monitoring',
      desc: 'Periodic snapshots are taken silently during the interview and stored for post-session review.'
    },
    {
      icon: '📊',
      title: 'Risk Scoring',
      desc: 'Automated risk score calculated from suspicious activity. Helps interviewers make informed decisions.'
    },
    {
      icon: '🖥️',
      title: 'Live Code View',
      desc: "Interviewer sees the candidate's code updating in real time without the candidate knowing."
    },
    {
      icon: '📄',
      title: 'Full Session Report',
      desc: 'Complete post-session report with timeline, snapshots, submitted code, and downloadable review.'
    }
  ];

  const steps = [
    { role: 'Interviewer', color: 'blue', steps: ['Register as Interviewer', 'Create a session with problem statement', 'Share the 6-digit session code', 'Monitor candidate live', 'Review full report after session'] },
    { role: 'Candidate', color: 'purple', steps: ['Register as Candidate', 'Enter the session code from interviewer', 'Allow webcam access', 'Write and run your solution', 'Submit code when done'] }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white">

      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse delay-700"></div>
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-gray-800/50">
        <div className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          InterviewShield
        </div>
        <button
          onClick={() => navigate('/login')}
          className="px-6 py-2 bg-white text-black rounded-xl font-semibold text-sm hover:bg-gray-100 transition-all"
        >
          Get Started
        </button>
      </nav>

      {/* Hero */}
      <div className={`relative z-10 flex flex-col items-center justify-center text-center px-6 py-24 transition-all duration-1000 ${fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-600/30 rounded-full text-blue-400 text-sm font-medium mb-8">
          <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
          AI-Powered Interview Proctoring Platform
        </div>

        <h1 className="text-6xl md:text-7xl font-bold mb-6 tracking-tight leading-tight">
          Conduct Interviews.
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Ensure Integrity.
          </span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mb-12 leading-relaxed">
          InterviewShield combines a real-time collaborative code editor with intelligent proctoring.
          Tab switch detection, webcam monitoring, and automated risk scoring — all in one platform.
        </p>

        <div className="flex gap-4">
          <button
            onClick={() => navigate('/login')}
            className="px-8 py-4 bg-white text-black rounded-2xl font-semibold text-lg hover:bg-gray-100 transition-all hover:scale-105 shadow-2xl shadow-white/20"
          >
            Get Started Free
          </button>
          <button
            onClick={() => document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' })}
            className="px-8 py-4 bg-gray-800 text-white rounded-2xl font-semibold text-lg hover:bg-gray-700 transition-all border border-gray-700"
          >
            See How It Works
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-4xl font-bold text-center mb-4">Everything You Need</h2>
        <p className="text-gray-400 text-center mb-12">Built for technical interviews that demand integrity</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-600 transition-all">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div id="how-it-works" className="relative z-10 max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-4xl font-bold text-center mb-4">How It Works</h2>
        <p className="text-gray-400 text-center mb-12">Simple for both interviewers and candidates</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {steps.map((s, i) => (
            <div key={i} className={`bg-gray-900 border ${s.color === 'blue' ? 'border-blue-600/30' : 'border-purple-600/30'} rounded-3xl p-8`}>
              <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium mb-6 ${s.color === 'blue' ? 'bg-blue-600/20 text-blue-400' : 'bg-purple-600/20 text-purple-400'}`}>
                {s.role}
              </div>
              <div className="space-y-4">
                {s.steps.map((step, j) => (
                  <div key={j} className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${s.color === 'blue' ? 'bg-blue-600/20 text-blue-400' : 'bg-purple-600/20 text-purple-400'}`}>
                      {j + 1}
                    </div>
                    <span className="text-gray-300">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="relative z-10 text-center px-6 py-24">
        <h2 className="text-4xl font-bold mb-4">Ready to Get Started?</h2>
        <p className="text-gray-400 mb-8">Join interviewers who trust InterviewShield for fair technical hiring</p>
        <button
          onClick={() => navigate('/login')}
          className="px-10 py-4 bg-white text-black rounded-2xl font-semibold text-lg hover:bg-gray-100 transition-all hover:scale-105 shadow-2xl shadow-white/20"
        >
          Start Your First Interview →
        </button>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800 px-8 py-6 text-center text-gray-500 text-sm">
        InterviewShield — Minor Project II | SISTec Bhopal | CSE 2026
      </footer>
    </div>
  );
}