import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

export default function Auth() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CANDIDATE' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const body = isLogin
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password, role: form.role };

      const res = await axios.post(`${API}${endpoint}`, body);
      const data = res.data;

      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.id);
      localStorage.setItem('userName', data.name);
      localStorage.setItem('userRole', data.role);

      if (data.role === 'INTERVIEWER') {
        navigate('/dashboard');
      } else {
        navigate('/join');
      }
    } catch {
      setError('Invalid credentials or request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white flex flex-col justify-between relative">
      {/* Top Brand Bar */}
      <nav className="p-6 sm:px-10 flex items-center justify-between relative z-10">
        <Link to="/" className="inline-flex items-center gap-3 group">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-mint via-cyan to-violet shadow-[0_0_18px_rgba(76,229,232,0.4)] transition-transform group-hover:scale-105">
            <svg className="w-5 h-5" viewBox="0 0 20 22" fill="none">
              <path d="M10 1 18.5 4.7v5.7c0 4.7-3.6 8.6-8.5 10C5.1 19 1.5 15.1 1.5 10.4V4.7L10 1Z" stroke="#071014" strokeWidth="1.5" />
              <path d="m5.7 10.6 2.7 2.7 5.8-6" stroke="#071014" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-display font-bold text-xl tracking-tight">InterviewShield</span>
        </Link>
      </nav>

      {/* Main Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="glass rounded-[28px] w-full max-w-[420px] p-8 sm:p-10 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-7">
            <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight mb-2 text-white">
              {isLogin ? 'Welcome Back' : 'Create an Account'}
            </h1>
            <p className="text-white/60 text-xs sm:text-sm">
              {isLogin
                ? 'Sign in to access your interview workspace'
                : 'Join InterviewShield for verified technical screens'}
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex rounded-xl p-1 bg-white/5 border border-white/10 mb-6">
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setError('');
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                isLogin
                  ? 'bg-gradient-to-r from-mint to-cyan text-ink shadow-[0_2px_8px_rgba(76,229,232,0.3)]'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLogin(false);
                setError('');
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                !isLogin
                  ? 'bg-gradient-to-r from-mint to-cyan text-ink shadow-[0_2px_8px_rgba(76,229,232,0.3)]'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="Rohit Verma"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:border-mint focus:ring-1 focus:ring-mint transition-all"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:border-mint focus:ring-1 focus:ring-mint transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:border-mint focus:ring-1 focus:ring-mint transition-all"
                required
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Role
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-4 py-2.5 bg-[#07132a] border border-white/15 rounded-xl text-white text-sm focus:outline-none focus:border-mint focus:ring-1 focus:ring-mint transition-all"
                >
                  <option value="CANDIDATE">Candidate</option>
                  <option value="INTERVIEWER">Interviewer</option>
                </select>
              </div>
            )}

            {error && (
              <div className="text-red-400 text-xs text-center py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/20">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="button-primary w-full py-3 text-sm font-semibold mt-2 tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Please wait...' : isLogin ? 'Sign In ↗' : 'Create Account ↗'}
            </button>
          </form>

          {/* Switch line */}
          <div className="text-center mt-6 text-xs text-white/60">
            {isLogin ? (
              <span>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(false);
                    setError('');
                  }}
                  className="text-mint font-semibold hover:underline"
                >
                  Create an account
                </button>
              </span>
            ) : (
              <span>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(true);
                    setError('');
                  }}
                  className="text-mint font-semibold hover:underline"
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
        </div>
      </main>

      {/* Footer note */}
      <footer className="text-center p-6 text-white/40 text-xs relative z-10">
        InterviewShield — Verified sessions · End-to-end integrity
      </footer>
    </div>
  );
}