import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
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

const API = 'http://192.168.1.9:8081/api';

export default function InterviewPage() {
    const { sessionCode } = useParams();
    const [session, setSession] = useState(null);
    const [editorRef, setEditorRef] = useState(null);
    const [tabSwitches, setTabSwitches] = useState(0);
    const [, setSnapshotCount] = useState(0);
    const candidateId = parseInt(localStorage.getItem('userId'));
    const token = localStorage.getItem('token');
    const [output, setOutput] = useState('');
    const [showConsole, setShowConsole] = useState(false);
    const codeVersionRef = useRef(0);
    const realtimeSendRef = useRef(null);
    const realtimeConnectedRef = useRef(false);
    const webRtcSignalRef = useRef(null);

    const sendCodeSnapshot = useCallback(() => {
        if (!editorRef) return;
        realtimeSendRef.current?.(MESSAGE_TYPES.CODE_SNAPSHOT, {
            version: codeVersionRef.current,
            content: editorRef.getValue(),
        });
    }, [editorRef]);

    const { status: realtimeStatus, presence, send: sendRealtime } = useRealtimeSession({
        sessionCode,
        role: 'candidate',
        userId: candidateId,
        token,
        onMessage: (message) => {
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
            .then(res => setSession(res.data))
            .catch(() => alert('Session not found'));
    }, [sessionCode, token]);

    // Tab switch detection
    useEffect(() => {
        const headers = { Authorization: `Bearer ${token}` };
        const handleVisibilityChange = () => {
            if (document.hidden) {
                const timestamp = new Date().toISOString();

                // Save to backend
                axios.post(`${API}/logs`, {
                    sessionCode,
                    candidateId,
                    eventType: 'TAB_SWITCH',
                    eventData: timestamp
                }, { headers });

                // Push to Firebase for live alert
                update(ref(db, `alerts/${sessionCode}/${candidateId}`), {
                    tabSwitches: increment(1),
                    lastAlert: timestamp
                });

                realtimeSendRef.current?.(MESSAGE_TYPES.TAB_SWITCH, {
                    candidateId,
                    occurredAt: timestamp,
                    count: tabSwitches + 1,
                });

                setTabSwitches(prev => prev + 1);
            } else {
                realtimeSendRef.current?.(MESSAGE_TYPES.TAB_RETURN, {
                    candidateId,
                    occurredAt: new Date().toISOString(),
                });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [sessionCode, candidateId, tabSwitches, token]);

    // Webcam snapshot every 30 seconds
    useEffect(() => {
        const headers = { Authorization: `Bearer ${token}` };
        const interval = setInterval(() => {
            if (!call.localVideoRef.current) return;

            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 240;
            canvas.getContext('2d').drawImage(call.localVideoRef.current, 0, 0, 320, 240);
            const base64 = canvas.toDataURL('image/jpeg', 0.5);

            axios.post(`${API}/logs`, {
                sessionCode,
                candidateId,
                eventType: 'WEBCAM_SNAPSHOT',
                eventData: base64
            }, { headers });

            setSnapshotCount(prev => prev + 1);
        }, 30000);

        return () => clearInterval(interval);
    }, [sessionCode, candidateId, call.localVideoRef, token]);

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

    // Submit code
    const submitCode = async () => {
        if (!editorRef) return;
        const code = editorRef.getValue();
        const headers = { Authorization: `Bearer ${token}` };
        try {
            await axios.post(`${API}/logs`, {
                sessionCode,
                candidateId,
                eventType: 'CODE_SUBMIT',
                eventData: code
            }, { headers });
            alert('Code submitted successfully!');
        } catch {
            alert('Submission failed');
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
    return (
        <div className="h-screen flex flex-col bg-gray-950 text-white">

            {/* Navbar */}
            <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
                <div className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    InterviewShield
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-sm text-gray-400">
                        Session: <span className="text-blue-400 font-mono font-bold">{sessionCode}</span>
                    </div>
                    <ConnectionStatus realtimeStatus={realtimeStatus} presence={presence} />
                    {tabSwitches > 0 && (
                        <div className="px-3 py-1 bg-red-600/20 text-red-400 rounded-full text-xs font-medium">
                            ⚠️ {tabSwitches} tab switch{tabSwitches > 1 ? 'es' : ''} detected
                        </div>
                    )}
                </div>
                <button
                    onClick={runCode}
                    className="px-6 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    ▶ Run Code
                </button>
                <button
                    onClick={submitCode}
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    Submit Code
                </button>
            </nav>

            <div className="flex flex-1 overflow-hidden">

                {/* Problem Statement */}
                <div className="w-80 bg-gray-900 border-r border-gray-800 p-6 overflow-auto">
                    <h3 className="font-semibold text-gray-300 mb-2 text-sm uppercase tracking-wide">Problem</h3>
                    <h2 className="text-lg font-bold mb-4">{session?.title}</h2>
                    <p className="text-gray-400 text-sm leading-relaxed">{session?.problemStatement}</p>

                    <div className="mt-8">
                        <VideoCallPanel {...call} />
                    </div>
                </div>

                {/* Monaco Editor */}
                <div className="flex-1">
                    <Editor
                        height="100%"
                        defaultLanguage="javascript"
                        defaultValue="// Write your solution here\n\n"
                        theme="vs-dark"
                        onMount={handleEditorMount}
                        options={{
                            fontSize: 14,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            minimap: { enabled: false },
                            lineNumbers: 'on',
                            automaticLayout: true,
                        }}
                    />
                </div>
            </div>
            {showConsole && (
                <div className="h-40 bg-black border-t border-gray-700 p-4 font-mono text-sm overflow-auto">
                    <div className="flex justify-between mb-2">
                        <span className="text-gray-300 font-semibold">Console Output</span>
                        <button onClick={() => setShowConsole(false)} className="text-red-400 hover:text-red-300 text-xs">
                            Close
                        </button>
                    </div>
                    <pre className="text-green-400">{output || '// No output yet'}</pre>
                </div>
            )}
        </div>
    );
}
