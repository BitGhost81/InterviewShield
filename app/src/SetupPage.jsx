import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

// ── Browser capability check ────────────────────────────────────────────────
function runBrowserChecks() {
  const checks = [
    {
      id: 'getUserMedia',
      label: 'Camera & Microphone API',
      ok: !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'),
      failReason: 'Your browser does not support camera/microphone access.',
    },
    {
      id: 'RTCPeerConnection',
      label: 'WebRTC Peer Connection',
      ok: !!(window.RTCPeerConnection),
      failReason: 'Your browser does not support WebRTC (required for live video).',
    },
    {
      id: 'WebSocket',
      label: 'WebSocket',
      ok: !!(window.WebSocket),
      failReason: 'Your browser does not support WebSockets (required for realtime communication).',
    },
    {
      id: 'fullscreen',
      label: 'Fullscreen Mode',
      ok: !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
      failReason: 'Your browser does not support fullscreen mode (required during the interview).',
    },
    {
      id: 'canvas',
      label: 'Canvas API',
      ok: !!document.createElement('canvas').getContext,
      failReason: 'Your browser does not support the Canvas API (required for photo capture).',
    },
  ];
  return checks;
}

function getBrowserLabel() {
  const ua = navigator.userAgent;
  if (/Edg\//i.test(ua)) return 'Microsoft Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Modern Browser';
}

// ── Media error helper ───────────────────────────────────────────────────────
function mediaErrorMessage(err) {
  if (!err) return 'An unknown error occurred.';
  switch (err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Permission denied. Please allow camera and microphone access in your browser settings, then click Retry.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera or microphone was found. Please connect a device and click Retry.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Your camera or microphone is already in use by another application. Please close it and click Retry.';
    case 'OverconstrainedError':
      return 'Your camera could not satisfy the requested constraints.';
    case 'SecurityError':
      return 'Media access is blocked because the page is not served over HTTPS or a secure context.';
    default:
      return err.message || 'Failed to access camera or microphone.';
  }
}

// ── Photo capture helpers ────────────────────────────────────────────────────
function captureFrame(videoEl, quality = 0.82) {
  if (!videoEl) return null;
  if (videoEl.readyState < 2 || videoEl.videoWidth <= 0 || videoEl.videoHeight <= 0) {
    return null;
  }
  const W = 640;
  const H = 480;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, W, H);
  return canvas.toDataURL('image/jpeg', quality);
}


// ── Section status icon ──────────────────────────────────────────────────────
function StatusIcon({ state }) {
  if (state === 'pass')
    return <span className="w-5 h-5 rounded-full bg-mint/20 border border-mint/40 flex items-center justify-center text-mint text-[11px] font-bold flex-shrink-0">✓</span>;
  if (state === 'fail')
    return <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 text-[11px] font-bold flex-shrink-0">✕</span>;
  return <span className="w-5 h-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0"><span className="w-2 h-2 rounded-full bg-white/30" /></span>;
}

// ── Mic level bar ────────────────────────────────────────────────────────────
function MicLevelBar({ stream }) {
  const [level, setLevel] = useState(0);
  const rafRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const ctxRef = useRef(null);

  useEffect(() => {
    if (!stream) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let max = 0;
        for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i] - 128));
        setLevel(Math.min(100, (max / 128) * 100 * 2.5));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // AudioContext not available
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { sourceRef.current?.disconnect(); } catch {
        // ignore error during disconnect
        void 0;
      }
      try { ctxRef.current?.close(); } catch {
        // ignore error during close
        void 0;
      }
    };
  }, [stream]);

  const bars = 12;
  const filled = Math.round((level / 100) * bars);
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`w-2.5 rounded-sm transition-all duration-75 ${
            i < filled
              ? i < bars * 0.6 ? 'bg-mint h-3' : i < bars * 0.85 ? 'bg-amber h-3' : 'bg-red-400 h-3'
              : 'bg-white/10 h-2'
          }`}
        />
      ))}
    </div>
  );
}

// ── Main SetupPage ────────────────────────────────────────────────────────────
export default function SetupPage({ sessionCode, role, onComplete }) {
  const token = localStorage.getItem('token');

  // Step state: 'browser' | 'media' | 'photo' | 'submitting' | 'done'
  const [step, setStep] = useState('browser');

  // Browser check results
  const [browserChecks] = useState(runBrowserChecks);
  const browserOk = browserChecks.every(c => c.ok);

  // Media state
  const [stream, setStream] = useState(null);
  const [mediaError, setMediaError] = useState('');
  const [mediaRequesting, setMediaRequesting] = useState(false);
  const videoRef = useRef(null);

  // Photo state
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [photoConfirmed, setPhotoConfirmed] = useState(false);

  // Submission state
  const [submitError, setSubmitError] = useState('');

  // ── Attach stream to video element ─────────────────────────────────────────
  useEffect(() => {
    if (stream && videoRef.current) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play?.().catch(() => {});
    }
  }, [stream, step, photoDataUrl]);

  // ── Cleanup streams on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [stream]);

  // ── Request camera + mic ───────────────────────────────────────────────────
  const requestMedia = useCallback(async () => {
    setMediaRequesting(true);
    setMediaError('');
    try {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        setStream(null);
      }
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(s);
    } catch (err) {
      setMediaError(mediaErrorMessage(err));
    } finally {
      setMediaRequesting(false);
    }
  }, [stream]);

  // ── Take photo ─────────────────────────────────────────────────────────────
  const takePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const dataUrl = captureFrame(videoRef.current);
    if (!dataUrl) return;
    setPhotoDataUrl(dataUrl);
    setPhotoConfirmed(false);
  }, []);

  const retakePhoto = useCallback(() => {
    setPhotoDataUrl(null);
    setPhotoConfirmed(false);
  }, []);

  // ── Submit readiness to backend ────────────────────────────────────────────
  const handleComplete = useCallback(async () => {
    if (!photoConfirmed || !photoDataUrl) return;

    let enteredFullscreen = false;
    if (role === 'candidate' && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
        enteredFullscreen = true;
      } catch {
        // Fullscreen request rejected or unavailable; proceed gracefully
      }
    }

    setStep('submitting');
    setSubmitError('');
    try {
      // Strip the data:image/jpeg;base64, prefix — send raw base64
      const base64 = photoDataUrl.split(',')[1] || photoDataUrl;
      await axios.post(
        `${API}/sessions/${sessionCode}/ready`,
        { role, photoBase64: base64 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Cache in sessionStorage as frontend convenience
      sessionStorage.setItem(`codelock:setup:${sessionCode}:${role}`, '1');
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      setStep('done');
      if (typeof onComplete === 'function') {
        onComplete(photoDataUrl);
      }
    } catch (err) {
      if (enteredFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setSubmitError(err.response?.data?.error || 'Failed to confirm readiness. Please try again.');
      setStep('photo');
    }
  }, [photoConfirmed, photoDataUrl, sessionCode, role, token, stream, onComplete]);

  const allPass = browserOk && stream && photoConfirmed;

  // ── Section step navigation ────────────────────────────────────────────────
  const goToMedia = () => {
    if (!browserOk) return;
    setStep('media');
    requestMedia();
  };

  const goToPhoto = () => {
    if (!stream) return;
    setStep('photo');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-white pb-16 relative">
      {/* Navbar */}
      <header className="max-w-3xl mx-auto px-4 pt-6">
        <nav className="glass rounded-[24px] px-6 py-3.5 flex items-center justify-between shadow-xl">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <span className="grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-mint via-cyan to-violet shadow-[0_0_14px_rgba(76,229,232,0.35)] transition-transform group-hover:scale-105">
              <svg className="w-4 h-4" viewBox="0 0 20 22" fill="none">
                <path d="M10 1 18.5 4.7v5.7c0 4.7-3.6 8.6-8.5 10C5.1 19 1.5 15.1 1.5 10.4V4.7L10 1Z" stroke="#071014" strokeWidth="1.5" />
                <path d="m5.7 10.6 2.7 2.7 5.8-6" stroke="#071014" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display font-bold text-lg tracking-tight">CodeLock</span>
          </Link>
          <span className="text-white/50 text-xs font-medium">
            {role === 'interviewer' ? 'Interviewer' : 'Candidate'} Setup
          </span>
        </nav>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-mint text-[11px] font-bold uppercase tracking-widest mb-2">Before We Begin</div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-white mb-2">
            Device & Readiness Check
          </h1>
          <p className="text-white/60 text-sm max-w-md mx-auto">
            CodeLock requires camera, microphone, and a session photo before you can enter the interview.
            Complete all steps below to continue.
          </p>
        </div>

        <div className="space-y-4">

          {/* ── 1. BROWSER CHECK ───────────────────────────────────────────── */}
          <div className={`glass rounded-2xl p-5 border transition-all ${step === 'browser' ? 'border-cyan/30' : 'border-white/10'}`}>
            <div className="flex items-center gap-3 mb-3">
              <StatusIcon state={browserOk ? 'pass' : (browserChecks.some(c => !c.ok) ? 'fail' : 'idle')} />
              <h2 className="font-display font-semibold text-sm text-white">Browser Compatibility</h2>
              <span className="ml-auto text-[11px] text-white/40">{getBrowserLabel()}</span>
            </div>
            <div className="space-y-1.5">
              {browserChecks.map(c => (
                <div key={c.id} className="flex items-start gap-2 text-xs">
                  <span className={`font-bold mt-0.5 flex-shrink-0 ${c.ok ? 'text-mint' : 'text-red-400'}`}>
                    {c.ok ? '✓' : '✕'}
                  </span>
                  <span className={c.ok ? 'text-white/70' : 'text-red-300'}>
                    {c.label}{!c.ok && ` — ${c.failReason}`}
                  </span>
                </div>
              ))}
            </div>
            {browserOk && step === 'browser' && (
              <button
                type="button"
                onClick={goToMedia}
                className="button-primary mt-4 px-5 py-2 text-xs font-semibold"
              >
                Continue to Camera & Mic ↓
              </button>
            )}
            {!browserOk && (
              <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                ⚠️ Your browser is missing required capabilities. Please use the latest version of Chrome, Firefox, or Edge.
              </div>
            )}
          </div>

          {/* ── 2. CAMERA + MICROPHONE ─────────────────────────────────────── */}
          <div className={`glass rounded-2xl p-5 border transition-all ${step === 'media' || step === 'photo' || step === 'submitting' || step === 'done' ? 'border-violet/30' : 'border-white/10 opacity-60'}`}>
            <div className="flex items-center gap-3 mb-3">
              <StatusIcon state={stream ? 'pass' : (mediaError ? 'fail' : 'idle')} />
              <h2 className="font-display font-semibold text-sm text-white">Camera & Microphone</h2>
            </div>

            {step === 'browser' && !stream && (
              <p className="text-white/40 text-xs">Complete the browser check first.</p>
            )}

            {(step === 'media' || step === 'photo' || step === 'submitting' || step === 'done') && (
              <>
                {/* Permission notice */}
                {!stream && !mediaError && (
                  <div className="mb-3 p-3 rounded-xl bg-cyan/10 border border-cyan/20 text-cyan text-xs leading-relaxed">
                    📷 CodeLock needs <strong>camera and microphone access</strong> for your live interview video call.
                    Please click &quot;Allow&quot; when your browser asks for permission.
                  </div>
                )}

                {mediaError && (
                  <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs leading-relaxed">
                    ✕ {mediaError}
                  </div>
                )}

                {stream && (
                  <div className="space-y-3">
                    {/* Live preview */}
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-black/60 border border-white/10 max-h-40">
                      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                      <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] text-white/70">Live Preview</div>
                    </div>

                    {/* Mic meter */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-white/60 w-20 flex-shrink-0">Microphone</span>
                      <MicLevelBar stream={stream} />
                      <span className="text-xs text-mint font-medium ml-1">Working</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-mint font-medium">
                      <span>✓</span><span>Camera working</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3">
                  {!stream && (
                    <button
                      type="button"
                      onClick={requestMedia}
                      disabled={mediaRequesting}
                      className="button-primary px-4 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      {mediaRequesting ? 'Requesting...' : 'Grant Permissions'}
                    </button>
                  )}
                  {(mediaError || stream) && (
                    <button
                      type="button"
                      onClick={requestMedia}
                      disabled={mediaRequesting}
                      className="button-ghost px-4 py-2 text-xs font-medium disabled:opacity-50"
                    >
                      {mediaRequesting ? '...' : 'Retry'}
                    </button>
                  )}
                  {stream && step === 'media' && (
                    <button
                      type="button"
                      onClick={goToPhoto}
                      className="button-primary px-4 py-2 text-xs font-semibold ml-auto"
                    >
                      Continue to Photo ↓
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── 3. PHOTO CAPTURE ───────────────────────────────────────────── */}
          <div className={`glass rounded-2xl p-5 border transition-all ${step === 'photo' || step === 'submitting' || step === 'done' ? 'border-amber/30' : 'border-white/10 opacity-60'}`}>
            <div className="flex items-center gap-3 mb-3">
              <StatusIcon state={photoConfirmed ? 'pass' : 'idle'} />
              <h2 className="font-display font-semibold text-sm text-white">Session Photo</h2>
            </div>

            {step === 'browser' || step === 'media' ? (
              <p className="text-white/40 text-xs">Complete camera check first.</p>
            ) : (
              <>
                {/* Photo notice */}
                {!photoDataUrl && (
                  <div className="mb-3 p-3 rounded-xl bg-amber/10 border border-amber/20 text-amber text-xs leading-relaxed">
                    📸 A session photo will be captured for interview identification purposes.
                    No facial recognition or biometric processing is used.
                    Position your face inside the circle guide and click <strong>Take Photo</strong>.
                  </div>
                )}

                {!photoDataUrl ? (
                  /* Live camera with circular overlay */
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative w-56 h-56">
                      <video ref={videoRef} autoPlay muted playsInline className="w-56 h-56 object-cover rounded-full border-2 border-white/20" />
                      {/* Circular guide overlay */}
                      <div className="absolute inset-0 rounded-full border-4 border-dashed border-cyan/50 pointer-events-none" />
                      <div className="absolute inset-[-4px] rounded-full border border-cyan/20 pointer-events-none" />
                    </div>
                    <p className="text-white/50 text-xs text-center">Position your head inside the circle</p>
                    <button
                      type="button"
                      onClick={takePhoto}
                      className="button-primary px-6 py-2.5 text-sm font-semibold"
                    >
                      📷 Take Photo
                    </button>
                  </div>
                ) : (
                  /* Photo preview + confirmation */
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative w-56 h-56">
                      <img src={photoDataUrl} alt="Session photo preview" className="w-56 h-56 object-cover rounded-full border-2 border-white/20" />
                      {photoConfirmed && (
                        <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40">
                          <span className="text-mint text-3xl">✓</span>
                        </div>
                      )}
                    </div>

                    {!photoConfirmed ? (
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={retakePhoto} className="button-ghost px-5 py-2.5 text-xs font-semibold">
                          ↺ Retake
                        </button>
                        <button
                          type="button"
                          onClick={() => setPhotoConfirmed(true)}
                          className="button-primary px-5 py-2.5 text-xs font-semibold"
                        >
                          Use Photo ✓
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-mint font-medium">
                        <span>✓</span><span>Photo accepted</span>
                        <button type="button" onClick={retakePhoto} className="text-white/40 hover:text-white ml-2 text-[11px]">Retake</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── CONTINUE BUTTON ────────────────────────────────────────────── */}
          {submitError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
              ⚠️ {submitError}
            </div>
          )}

          <button
            type="button"
            onClick={handleComplete}
            disabled={!allPass || step === 'submitting' || step === 'done'}
            className="button-primary w-full py-3.5 text-sm font-semibold tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 'submitting'
              ? 'Confirming readiness...'
              : step === 'done'
              ? '✓ Ready — entering interview...'
              : allPass
              ? `Enter Interview as ${role === 'interviewer' ? 'Interviewer' : 'Candidate'} ↗`
              : 'Complete all checks above to continue'}
          </button>

          {/* Progress summary */}
          <div className="flex items-center justify-center gap-6 text-[11px] text-white/40 pt-1">
            <span className={browserOk ? 'text-mint' : ''}>
              {browserOk ? '✓' : '○'} Browser
            </span>
            <span className={stream ? 'text-mint' : ''}>
              {stream ? '✓' : '○'} Camera & Mic
            </span>
            <span className={photoConfirmed ? 'text-mint' : ''}>
              {photoConfirmed ? '✓' : '○'} Photo
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}