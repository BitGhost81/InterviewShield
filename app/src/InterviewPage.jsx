import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, set, update, increment } from 'firebase/database';
import axios from 'axios';
import { useRealtimeSession } from './hooks/useRealtimeSession';
import { MESSAGE_TYPES } from './realtime/messages';
import { useWebRTCCall } from './hooks/useWebRTCCall';
import { ConnectionStatus } from './components/ConnectionStatus';
import { VideoCallPanel } from './components/VideoCallPanel';

const firebaseConfig = {
    apiKey: "AIzaSyC2uS-fcWCYzMyQqCy72EkBl8CWdoLCpus",
    authDomain: "collab-editor-44d5f.firebaseapp.com",
    databaseURL: "https://collab-editor-44d5f-default-rtdb.firebaseio.com",
    projectId: "collab-editor-44d5f",
    storageBucket: "collab-editor-44d5f.firebasestorage.app",
    messagingSenderId: "679361511798",
    appId: "1:679361511798:web:ad5885e20b9784cebd7a57"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getDatabase(app);

const API = import.meta.env.VITE_API_URL || '/api';

export default function InterviewPage() {
    const { sessionCode } = useParams();
    const [session, setSession] = useState(null);
    const [sessionError, setSessionError] = useState('');
    const [editorRef, setEditorRef] = useState(null);
    const [tabSwitches, setTabSwitches] = useState(0);
    
    const candidateId = parseInt(localStorage.getItem('userId'));
    const token = localStorage.getItem('token');
    const [output, setOutput] = useState('');
    const [showConsole, setShowConsole] = useState(false);
    const initialFullscreen = typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false;
    const [isFullscreenLocked, setIsFullscreenLocked] = useState(initialFullscreen);
    const [focusWarning, setFocusWarning] = useState(null);
    const isFullscreenRef = useRef(initialFullscreen);
    const isAwayRef = useRef(false);
    const codeVersionRef = useRef(0);
    const realtimeSendRef = useRef(null);
    const realtimeConnectedRef = useRef(false);
    const webRtcSignalRef = useRef(null);
    const activeSessionCode = session?.status === 'ACTIVE' ? sessionCode : null;

    const sendCodeSnapshot = useCallback(() => {
        if (!editorRef) return;
        realtimeSendRef.current?.(MESSAGE_TYPES.CODE_SNAPSHOT, {
            version: codeVersionRef.current,
            content: editorRef.getValue(),
        });
    }, [editorRef]);

    const { status: realtimeStatus, presence, send: sendRealtime } = useRealtimeSession({
        sessionCode: activeSessionCode,
        role: 'candidate',
        userId: candidateId,
        token,
        onMessage: (message) => {
            if (message.type === MESSAGE_TYPES.ERROR && message.payload?.code === 'session_ended') {
                setSession((prev) => ({ ...(prev || {}), status: 'ENDED' }));
                setSessionError('This interview session has ended.');
                return;
            }

            if (message.type === MESSAGE_TYPES.PRESENCE && message.payload?.interviewerConnected) {
                sendCodeSnapshot();
            }

            if (message.type === MESSAGE_TYPES.CODE_RESYNC) {
                sendCodeSnapshot();
            }

            if ([MESSAGE_TYPES.WEBRTC_OFFER, MESSAGE_TYPES.WEBRTC_ANSWER, MESSAGE_TYPES.WEBRTC_ICE_CANDIDATE].includes(message.type)) {
                webRtcSignalRef.current?.(message);
            }
        },
    });



    const call = useWebRTCCall({
        isInitiator: true,
        peerConnected: Boolean(presence?.interviewerConnected),
        sendSignal: sendRealtime,
    });

    useEffect(() => {
        webRtcSignalRef.current = call.handleSignal;
    }, [call.handleSignal]);

    useEffect(() => {
        realtimeSendRef.current = sendRealtime;
    }, [sendRealtime]);

    useEffect(() => {
        realtimeConnectedRef.current = realtimeStatus === 'connected';
        if (realtimeStatus === 'connected') {
            sendCodeSnapshot();
        }
    }, [realtimeStatus, editorRef, sendCodeSnapshot]);

    // Load session details
    useEffect(() => {
        const headers = { Authorization: `Bearer ${token}` };
        axios.get(`${API}/sessions/${sessionCode}`, { headers })
            .then(res => {
                setSession(res.data);
                if (res.data?.status && res.data.status !== 'ACTIVE') {
                    setSessionError(`This interview session is ${res.data.status.toLowerCase()} and can no longer be joined.`);
                } else {
                    setSessionError('');
                }
            })
            .catch(() => setSessionError('Session not found'));
    }, [sessionCode, token]);

    // Helper to request fullscreen mode
    const requestFullscreenMode = useCallback(() => {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {
                setIsFullscreenLocked(false);
                isFullscreenRef.current = false;
            });
        }
    }, []);

    // Fullscreen lock effect
    useEffect(() => {
        if (session?.status !== 'ACTIVE') return;
        const headers = { Authorization: `Bearer ${token}` };

        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = Boolean(document.fullscreenElement);
            if (!isCurrentlyFullscreen && isFullscreenRef.current) {
                isFullscreenRef.current = false;
                setIsFullscreenLocked(false);
                const timestamp = new Date().toISOString();

                axios.post(`${API}/logs`, {
                    sessionCode,
                    candidateId,
                    eventType: 'FULLSCREEN_EXIT',
                    eventData: timestamp,
                }, { headers }).catch(() => {});

                realtimeSendRef.current?.(MESSAGE_TYPES.FULLSCREEN_EXIT, {
                    candidateId,
                    occurredAt: timestamp,
                });
            } else if (isCurrentlyFullscreen && !isFullscreenRef.current) {
                isFullscreenRef.current = true;
                setIsFullscreenLocked(true);
                const timestamp = new Date().toISOString();

                axios.post(`${API}/logs`, {
                    sessionCode,
                    candidateId,
                    eventType: 'FULLSCREEN_RESTORE',
                    eventData: timestamp,
                }, { headers }).catch(() => {});

                realtimeSendRef.current?.(MESSAGE_TYPES.FULLSCREEN_RESTORE, {
                    candidateId,
                    occurredAt: timestamp,
                });
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [sessionCode, candidateId, token, session?.status]);

    // Focus & Visibility integrity detection (deduplicated)
    useEffect(() => {
        if (session?.status !== 'ACTIVE') return;
        const headers = { Authorization: `Bearer ${token}` };

        const handleAway = () => {
            if (isAwayRef.current) return;
            isAwayRef.current = true;
            const timestamp = new Date().toISOString();

            axios.post(`${API}/logs`, {
                sessionCode,
                candidateId,
                eventType: 'FOCUS_LOST',
                eventData: timestamp,
            }, { headers }).catch(() => {});

            update(ref(db, `alerts/${sessionCode}/${candidateId}`), {
                tabSwitches: increment(1),
                lastAlert: timestamp,
            }).catch(() => {});

            realtimeSendRef.current?.(MESSAGE_TYPES.FOCUS_LOST, {
                candidateId,
                occurredAt: timestamp,
                count: tabSwitches + 1,
            });

            setTabSwitches(prev => prev + 1);
        };

        const handleReturn = () => {
            if (!isAwayRef.current) return;
            isAwayRef.current = false;
            const timestamp = new Date().toISOString();

            realtimeSendRef.current?.(MESSAGE_TYPES.FOCUS_RETURN, {
                candidateId,
                occurredAt: timestamp,
            });

            setFocusWarning('Interview activity detected outside the interview window.');
            setTimeout(() => setFocusWarning(null), 4000);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                handleAway();
            } else {
                handleReturn();
            }
        };

        const handleWindowBlur = () => {
            handleAway();
        };

        const handleWindowFocus = () => {
            handleReturn();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleWindowBlur);
        window.addEventListener('focus', handleWindowFocus);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleWindowBlur);
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, [sessionCode, candidateId, tabSwitches, token, session?.status]);




    // Monaco sync with Firebase
    const handleEditorMount = (editor) => {
        setEditorRef(editor);
        const docRef = ref(db, `documents/${sessionCode}`);
        let suppress = false;

        onValue(docRef, (snapshot) => {
            if (realtimeConnectedRef.current) return;
            const data = snapshot.val();
            if (!data) return;
            const remote = data.content || '';
            const local = editor.getValue();
            if (remote !== local) {
                suppress = true;
                const pos = editor.getPosition();
                editor.setValue(remote);
                if (pos) editor.setPosition(pos);
                suppress = false;
            }
        });

        editor.onDidChangeModelContent((event) => {
            if (suppress) return;
            const previousVersion = codeVersionRef.current;
            codeVersionRef.current += 1;

            const sent = realtimeSendRef.current?.(MESSAGE_TYPES.CODE_DELTA, {
                previousVersion,
                version: codeVersionRef.current,
                changes: event.changes,
            });

            if (!sent) {
                set(docRef, { content: editor.getValue() });
            }
        });

        if (realtimeConnectedRef.current) {
            realtimeSendRef.current?.(MESSAGE_TYPES.CODE_SNAPSHOT, {
                version: codeVersionRef.current,
                content: editor.getValue(),
            });
        }
    };

    const [submitStatus, setSubmitStatus] = useState('idle');
    const [submitNotification, setSubmitNotification] = useState(null);

    // Submit code
    const submitCode = async () => {
        if (!editorRef || submitStatus === 'submitting') return;
        const code = editorRef.getValue();
        const headers = { Authorization: `Bearer ${token}` };
        setSubmitStatus('submitting');
        try {
            await axios.post(`${API}/logs`, {
                sessionCode,
                candidateId,
                eventType: 'CODE_SUBMIT',
                eventData: code
            }, { headers });
            setSubmitStatus('success');
            setSubmitNotification({ type: 'success', message: 'Code submitted successfully!' });
            setTimeout(() => setSubmitNotification(null), 4000);
            setTimeout(() => setSubmitStatus('idle'), 3000);
        } catch {
            setSubmitStatus('error');
            setSubmitNotification({ type: 'error', message: 'Submission failed. Please try again.' });
            setTimeout(() => setSubmitNotification(null), 4000);
            setTimeout(() => setSubmitStatus('idle'), 3000);
        }
    };
    //run code
    const runCode = async () => {
        if (!editorRef) return;
        const userCode = editorRef.getValue();
        const consoleOutput = await runInSandbox(userCode);
        setOutput(consoleOutput);
        setShowConsole(true);
    };

    const runInSandbox = (userCode) => {
        return new Promise((resolve) => {
            const iframe = document.createElement('iframe');
            const timeoutMs = 3000;
            const safeUserCode = JSON.stringify(userCode).replaceAll('</', '<\\/');
            const script = `
                const send = (payload) => parent.postMessage({ type: 'run-code-result', payload }, '*');
                let consoleOutput = '';
                console.log = (...args) => {
                    consoleOutput += args.map(String).join(' ') + '\\n';
                };
                const blockedPrint = () => {
                    throw new Error('Browser print is not available in Run Code. Use console.log(...) for output.');
                };
                Object.defineProperty(window, 'print', { value: blockedPrint, writable: false });
                try {
                    const result = (0, eval)(${safeUserCode});
                    if (result !== undefined) consoleOutput += '\\nReturned: ' + String(result) + '\\n';
                    send({ output: consoleOutput });
                } catch (err) {
                    send({ output: consoleOutput + '\\nError: ' + err.message + '\\n' });
                }
            `;
            let settled = false;

            const cleanup = () => {
                window.removeEventListener('message', handleMessage);
                iframe.remove();
            };

            const finish = (value) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(value);
            };

            const timer = setTimeout(() => {
                finish('Error: Code execution timed out');
            }, timeoutMs);

            const handleMessage = (event) => {
                if (event.source !== iframe.contentWindow || event.data?.type !== 'run-code-result') return;
                clearTimeout(timer);
                finish(event.data.payload.output || '// No output yet');
            };

            iframe.sandbox = 'allow-scripts';
            iframe.style.display = 'none';
            iframe.srcdoc = `<script>${script}</` + 'script>';
            window.addEventListener('message', handleMessage);
            document.body.appendChild(iframe);
        });
    };

    if (!session && !sessionError) {
        return (
            <div className="min-h-screen text-white relative flex items-center justify-center px-4">
                <div className="glass rounded-[24px] p-8 max-w-md w-full text-center border border-white/15">
                    <div className="text-mint text-[11px] font-bold uppercase tracking-widest mb-2">InterviewShield</div>
                    <h1 className="font-display font-bold text-2xl mb-3">Loading Session</h1>
                    <p className="text-white/65 text-sm">Checking whether this interview is active...</p>
                </div>
            </div>
        );
    }

    if (sessionError) {
        return (
            <div className="min-h-screen text-white relative flex items-center justify-center px-4">
                <div className="glass rounded-[24px] p-8 max-w-md w-full text-center border border-white/15">
                    <div className="text-mint text-[11px] font-bold uppercase tracking-widest mb-2">InterviewShield</div>
                    <h1 className="font-display font-bold text-2xl mb-3">Session Unavailable</h1>
                    <p className="text-white/65 text-sm mb-6">{sessionError}</p>
                    <Link to="/dashboard" className="button-primary inline-flex px-5 py-2 text-xs font-semibold">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col text-white overflow-hidden relative">
            {/* Top Bar */}
            <header className="px-5 py-3 border-b border-white/10 glass-subtle flex-shrink-0 z-20">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-6">
                        <Link to="/" className="inline-flex items-center gap-2.5 group">
                            <span className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-mint via-cyan to-violet shadow-[0_0_12px_rgba(76,229,232,0.35)]">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 20 22" fill="none">
                                    <path d="M10 1 18.5 4.7v5.7c0 4.7-3.6 8.6-8.5 10C5.1 19 1.5 15.1 1.5 10.4V4.7L10 1Z" stroke="#071014" strokeWidth="1.5" />
                                    <path d="m5.7 10.6 2.7 2.7 5.8-6" stroke="#071014" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                            <span className="font-display font-bold text-base tracking-tight hidden sm:inline">InterviewShield</span>
                        </Link>

                        <div className="flex items-center gap-3 text-xs">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white/70">
                                <span className="text-white/40">Session:</span>
                                <span className="font-mono text-cyan font-bold tracking-wider">{sessionCode}</span>
                            </span>

                            <ConnectionStatus realtimeStatus={realtimeStatus} presence={presence} />

                            {tabSwitches > 0 && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber/15 border border-amber/30 text-amber text-[11px] font-semibold animate-pulse">
                                    ⚠️ {tabSwitches} window focus loss{tabSwitches > 1 ? 'es' : ''}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={runCode}
                            className="button-ghost px-3.5 py-1.5 text-xs font-semibold"
                        >
                            ▶ Run Code
                        </button>
                        <button
                            onClick={submitCode}
                            className="button-primary px-4 py-1.5 text-xs font-semibold"
                        >
                            Submit Code ↗
                        </button>
                    </div>
                </div>
            </header>

            {/* Workspace */}
            <div className="flex flex-1 overflow-hidden p-3 gap-3 min-h-0">
                {/* Left Column: Problem & Video */}
                <div className="w-80 flex flex-col gap-3 overflow-y-auto flex-shrink-0">
                    <div className="glass rounded-2xl p-5 shadow-lg flex-shrink-0">
                        <div className="text-mint text-[10px] font-bold uppercase tracking-widest mb-1.5">Session</div>
                        <h2 className="font-display font-bold text-lg text-white mb-2.5 leading-snug">
                            {session?.title || 'Loading problem...'}
                        </h2>
                        <p className="text-white/75 text-xs leading-relaxed whitespace-pre-wrap">
                            {session?.problemStatement || 'Your interviewer will provide the question during the interview.'}
                        </p>
                    </div>

                    <div className="flex-shrink-0">
                        <VideoCallPanel {...call} />
                    </div>
                </div>

                {/* Right Column: Monaco Editor & Console */}
                <div className="flex-1 flex flex-col min-h-0 glass rounded-2xl overflow-hidden border border-white/15 shadow-2xl">
                    {/* Editor Tab Header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/5 flex-shrink-0">
                        <div className="inline-flex items-center gap-2 text-xs text-white/80 font-mono">
                            <span className="w-2 h-2 rounded-[2px] bg-violet" />
                            <span>solution.js</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-[11px] text-mint">
                            <span className="w-1.5 h-1.5 rounded-full bg-mint shadow-[0_0_6px_#4ce5e8]" />
                            <span>Live sync</span>
                        </div>
                    </div>

                    {/* Monaco Editor Container */}
                    <div className="flex-1 min-h-0 bg-[#020610]/70">
                        <Editor
                            height="100%"
                            defaultLanguage="javascript"
                            defaultValue="// Write your solution here\n\n"
                            theme="vs-dark"
                            onMount={handleEditorMount}
                            options={{
                                fontSize: 13,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                minimap: { enabled: false },
                                lineNumbers: 'on',
                                automaticLayout: true,
                                smoothScrolling: true,
                                cursorBlinking: 'smooth',
                            }}
                        />
                    </div>

                    {/* Console Output Drawer */}
                    {showConsole && (
                        <div className="h-44 bg-[#01091a]/95 border-t border-white/15 p-3.5 font-mono text-xs flex flex-col flex-shrink-0">
                            <div className="flex items-center justify-between mb-2 flex-shrink-0 pb-1.5 border-b border-white/10">
                                <span className="text-white/60 font-semibold uppercase tracking-wider text-[10px]">Console Output</span>
                                <button
                                    onClick={() => setShowConsole(false)}
                                    className="text-white/40 hover:text-white text-xs px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
                                >
                                    ✕ Close
                                </button>
                            </div>
                            <pre className="text-mint overflow-auto flex-1 whitespace-pre-wrap leading-relaxed">
                                {output || '// No output yet'}
                            </pre>
                        </div>
                    )}
                </div>
            </div>

            {/* Focus / Tab Return Warning Toast */}
            {focusWarning && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-amber/20 border border-amber/40 text-amber text-xs font-semibold shadow-xl backdrop-blur-md animate-bounce flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{focusWarning}</span>
                </div>
            )}

            {/* Submit Code Status Toast */}
            {submitNotification && (
                <div className={`absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl border text-xs font-semibold shadow-xl backdrop-blur-md flex items-center gap-2 animate-fade-in ${
                    submitNotification.type === 'success'
                        ? 'bg-mint/20 border-mint/40 text-mint shadow-[0_0_20px_rgba(76,229,232,0.2)]'
                        : 'bg-red-500/20 border-red-500/40 text-red-300'
                }`}>
                    <span>{submitNotification.type === 'success' ? '✓' : '⚠️'}</span>
                    <span>{submitNotification.message}</span>
                </div>
            )}

            {/* Fullscreen Pause Overlay Modal */}
            {session?.status === 'ACTIVE' && !isFullscreenLocked && (
                <div className="fixed inset-0 z-50 bg-[#020610]/95 backdrop-blur-lg flex items-center justify-center p-4">
                    <div className="glass rounded-[24px] p-8 max-w-md w-full text-center border border-amber/40 shadow-[0_0_50px_rgba(245,158,11,0.2)]">
                        <div className="w-14 h-14 rounded-2xl bg-amber/15 border border-amber/30 text-amber grid place-items-center mx-auto mb-4 text-2xl">
                            🔒
                        </div>
                        <div className="text-amber text-[11px] font-bold uppercase tracking-widest mb-1.5">Interview Paused</div>
                        <h2 className="font-display font-bold text-xl text-white mb-2">Fullscreen Mode Required</h2>
                        <p className="text-white/70 text-xs leading-relaxed mb-6">
                            InterviewShield requires fullscreen mode during the interview session. Please return to fullscreen to resume writing your solution.
                        </p>
                        <button
                            onClick={requestFullscreenMode}
                            className="button-primary w-full py-2.5 text-xs font-semibold shadow-[0_0_20px_rgba(76,229,232,0.3)]"
                        >
                            Re-enter Fullscreen ↗
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
