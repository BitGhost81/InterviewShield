import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();

  const features = [
    {
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      ),
      accent: 'text-mint bg-mint/10 border-mint/20',
      title: 'Live Code Editor',
      desc: 'Monaco-powered editor with real-time sync. Both interviewer and candidate see the same code instantly with zero lag.',
    },
    {
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
      accent: 'text-violet bg-violet/10 border-violet/20',
      title: 'Tab Switch Detection',
      desc: 'Every time a candidate leaves the interview tab, it is logged with an exact timestamp, duration, and flagged instantly.',
    },
    {
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      ),
      accent: 'text-cyan bg-cyan/10 border-cyan/20',
      title: 'Webcam Monitoring',
      desc: 'Periodic snapshots are taken silently during the interview and stored for tamper-evident post-session review.',
    },
    {
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
      accent: 'text-amber bg-amber/10 border-amber/20',
      title: 'Automated Risk Scoring',
      desc: 'Suspicious activity is calculated into a defensible integrity score to help interviewers make evidence-based hiring decisions.',
    },
    {
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
      accent: 'text-mint bg-mint/10 border-mint/20',
      title: 'Live Code Mirror',
      desc: "Interviewer monitors the candidate's keystrokes in real time through an authoritative read-only mirror.",
    },
    {
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      accent: 'text-violet bg-violet/10 border-violet/20',
      title: 'Full Session Report',
      desc: 'Complete post-session summary with activity timeline, webcam snapshots, submitted solution, and exportable review.',
    },
  ];

  const steps = [
    {
      role: 'Interviewer',
      accentColor: 'border-cyan/30 text-cyan',
      badgeBg: 'bg-cyan/15 text-cyan border-cyan/25',
      numBg: 'bg-cyan/20 text-cyan border border-cyan/30',
      steps: [
        'Register or sign in as an Interviewer',
        'Create a session with problem statement & difficulty',
        'Share the unique 6-character session code',
        'Monitor candidate live code, activity & video',
        'Review comprehensive integrity report after session',
      ],
    },
    {
      role: 'Candidate',
      accentColor: 'border-violet/30 text-violet',
      badgeBg: 'bg-violet/15 text-violet border-violet/25',
      numBg: 'bg-violet/20 text-violet border border-violet/30',
      steps: [
        'Register or sign in as a Candidate',
        'Enter the session code shared by your interviewer',
        'Allow webcam and microphone access for the call',
        'Write, execute, and test your solution in the editor',
        'Submit your finalized code when complete',
      ],
    },
  ];

  return (
    <div className="min-h-screen text-white relative overflow-x-hidden">
      {/* Ambient background glowing orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[540px] h-[540px] bg-gradient-to-br from-violet/20 to-mint/15 rounded-full blur-[100px] opacity-70" />
        <div className="absolute top-1/2 right-[-100px] w-[420px] h-[420px] bg-cyan/15 rounded-full blur-[110px] opacity-60" />
      </div>

      {/* Floating Header */}
      <header className="relative z-10 max-w-[1240px] mx-auto px-4 pt-6">
        <nav className="glass rounded-[28px] px-6 sm:px-8 py-4 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-mint via-cyan to-violet shadow-[0_0_18px_rgba(76,229,232,0.4)]">
              <svg className="w-5 h-5" viewBox="0 0 20 22" fill="none">
                <path d="M10 1 18.5 4.7v5.7c0 4.7-3.6 8.6-8.5 10C5.1 19 1.5 15.1 1.5 10.4V4.7L10 1Z" stroke="#071014" strokeWidth="1.5" />
                <path d="m5.7 10.6 2.7 2.7 5.8-6" stroke="#071014" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display font-bold text-xl tracking-tight">InterviewShield</span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/75">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          </div>

          <button
            onClick={() => navigate('/login')}
            className="button-primary px-5 py-2.5 text-xs font-semibold"
          >
            Get Started <span aria-hidden="true">↗</span>
          </button>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-[960px] mx-auto px-6 pt-20 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mint/10 border border-mint/25 text-mint text-xs font-semibold tracking-wider uppercase mb-8 shadow-[0_0_15px_rgba(76,229,232,0.15)]">
          <span className="w-2 h-2 rounded-full bg-mint shadow-[0_0_8px_#4ce5e8]" />
          Trusted Interview Integrity Platform
        </div>

        <h1 className="font-display font-bold text-5xl sm:text-6xl md:text-7xl leading-[1.08] tracking-tight mb-6">
          Interviews that are{' '}
          <span className="bg-gradient-to-r from-mint via-cyan to-violet bg-clip-text text-transparent">
            fair, verified,
          </span>{' '}
          and final.
        </h1>

        <p className="text-base sm:text-lg text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
          InterviewShield combines a real-time collaborative code editor with intelligent proctoring,
          live video calling, tab-switch tracking, and automated risk scoring in one unified platform.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => navigate('/login')}
            className="button-primary px-8 py-3.5 text-sm sm:text-base font-semibold"
          >
            Get Started Free <span aria-hidden="true">↗</span>
          </button>
          <button
            onClick={() => {
              const el = document.getElementById('features');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="button-ghost px-7 py-3.5 text-sm sm:text-base"
          >
            Explore the Platform <span aria-hidden="true">↓</span>
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 max-w-[1240px] mx-auto px-6 py-20">
        <div className="text-center max-w-xl mx-auto mb-14">
          <div className="text-mint text-xs font-bold uppercase tracking-widest mb-3">One Session · Complete Signal</div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">
            Everything You Need to See the Real Signal
          </h2>
          <p className="text-white/70 text-sm sm:text-base">
            Built from the ground up for technical screens that require integrity, context, and fairness.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={i}
              className="glass rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1 hover:border-white/40 flex flex-col justify-between"
            >
              <div>
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-5 ${f.accent}`}>
                  {f.icon}
                </div>
                <h3 className="font-display font-semibold text-lg mb-2.5 text-white">{f.title}</h3>
                <p className="text-white/65 text-sm leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative z-10 max-w-[1240px] mx-auto px-6 py-20">
        <div className="text-center max-w-xl mx-auto mb-14">
          <div className="text-mint text-xs font-bold uppercase tracking-widest mb-3">Simple Workflow</div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">
            How InterviewShield Works
          </h2>
          <p className="text-white/70 text-sm sm:text-base">
            Designed for frictionless setup for candidates and maximum signal for interviewers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {steps.map((s, i) => (
            <div key={i} className={`glass rounded-[28px] p-8 border ${s.accentColor}`}>
              <div className={`inline-flex px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide border mb-7 ${s.badgeBg}`}>
                {s.role} Workflow
              </div>
              <div className="space-y-4">
                {s.steps.map((step, j) => (
                  <div key={j} className="flex items-start gap-4">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${s.numBg}`}>
                      {j + 1}
                    </div>
                    <span className="text-white/80 text-sm leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 max-w-[960px] mx-auto px-6 py-16">
        <div className="glass rounded-[32px] p-10 sm:p-14 text-center border border-white/20 shadow-2xl">
          <div className="text-mint text-xs font-bold uppercase tracking-widest mb-3">Make Every Interview Count</div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">
            Ready to Run Your First Session?
          </h2>
          <p className="text-white/70 text-sm sm:text-base max-w-md mx-auto mb-8">
            Create an interview session in seconds with real-time code synchronization and proctoring.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="button-primary px-8 py-3.5 text-sm font-semibold"
          >
            Create a Session <span aria-hidden="true">↗</span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 px-8 py-8 text-center text-white/50 text-xs flex flex-col sm:flex-row items-center justify-between max-w-[1240px] mx-auto gap-4">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-gradient-to-br from-mint to-cyan grid place-items-center">
            <svg className="w-3 h-3 text-ink" viewBox="0 0 20 22" fill="none">
              <path d="M10 1 18.5 4.7v5.7c0 4.7-3.6 8.6-8.5 10C5.1 19 1.5 15.1 1.5 10.4V4.7L10 1Z" stroke="#071014" strokeWidth="2" />
            </svg>
          </span>
          <span className="font-display font-semibold text-white/80">InterviewShield</span>
          <span>— Built for high-integrity hiring.</span>
        </div>
        <div>
          © {new Date().getFullYear()} InterviewShield · CSE 2026
        </div>
      </footer>
    </div>
  );
}