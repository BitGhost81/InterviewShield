import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import axios from 'axios';
import Editor from '@monaco-editor/react';
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

function applyMonacoChanges(content, changes) {
    if (!Array.isArray(changes) || changes.length === 0) {
        return content;
    }

    const orderedChanges = [...changes].sort((left, right) => {
        const leftOffset = typeof left.rangeOffset === 'number' ? left.rangeOffset : 0;
        const rightOffset = typeof right.rangeOffset === 'number' ? right.rangeOffset : 0;
        return rightOffset - leftOffset;
    });

    return orderedChanges.reduce((nextContent, change) => {
        const offset = typeof change.rangeOffset === 'number' ? change.rangeOffset : 0;
        const length = typeof change.rangeLength === 'number' ? change.rangeLength : 0;
        return `${nextContent.slice(0, offset)}${change.text || ''}${nextContent.slice(offset + length)}`;
    }, content);
}

export default function MonitorPage() {
    const { sessionCode } = useParams();
    const navigate = useNavigate();
    const [alerts, setAlerts] = useState({});
    const [report, setReport] = useState(null);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    const [liveCode, setLiveCode] = useState(null);
    const [candidateCode, setCandidateCode] = useState('');
    const candidateCodeRef = React.useRef('');
    const codeVersionRef = React.useRef(0);
    const webRtcSignalRef = React.useRef(null);

    const { status: realtimeStatus, presence, send: sendRealtime } = useRealtimeSession({
        sessionCode,
        role: 'interviewer',
        userId: localStorage.getItem('userId'),
        token,
        onMessage: (message) => {
            if (message.type === MESSAGE_TYPES.PRESENCE && message.payload?.candidateConnected) {
                sendRealtime(MESSAGE_TYPES.CODE_RESYNC, {
                    reason: 'interviewer_joined',
                    currentVersion: codeVersionRef.current,
                });
            }

            if (message.type === MESSAGE_TYPES.CODE_SNAPSHOT) {
                const content = message.payload?.content || '';
                const version = Number(message.payload?.version || 0);
                candidateCodeRef.current = content;
                setCandidateCode(content);
                codeVersionRef.current = version;
            }

            if (message.type === MESSAGE_TYPES.CODE_DELTA) {
                const previousVersion = Number(message.payload?.previousVersion);
                const version = Number(message.payload?.version);
                const changes = message.payload?.changes || [];

                if (previousVersion !== codeVersionRef.current) {
                    sendRealtime(MESSAGE_TYPES.CODE_RESYNC, {
                        reason: 'version_mismatch',
                        currentVersion: codeVersionRef.current,
                    });
                    return;
                }

                const nextContent = applyMonacoChanges(candidateCodeRef.current, changes);
                candidateCodeRef.current = nextContent;
                setCandidateCode(nextContent);
                codeVersionRef.current = version;
            }

            if (message.type === MESSAGE_TYPES.TAB_SWITCH) {
                const candidateId = String(message.payload?.candidateId || message.senderId || 'candidate');
                setAlerts((previous) => ({
                    ...previous,
                    [candidateId]: {
                        ...previous[candidateId],
                        tabSwitches: message.payload?.count || (previous[candidateId]?.tabSwitches || 0) + 1,
                        lastAlert: message.payload?.occurredAt || new Date().toISOString(),
                        currentlyAway: true,
                    },
                }));
            }

            if (message.type === MESSAGE_TYPES.TAB_RETURN) {
                const candidateId = String(message.payload?.candidateId || message.senderId || 'candidate');
                setAlerts((previous) => ({
                    ...previous,
                    [candidateId]: { ...previous[candidateId], currentlyAway: false, lastReturn: message.payload?.occurredAt },
                }));
            }

            if ([MESSAGE_TYPES.WEBRTC_OFFER, MESSAGE_TYPES.WEBRTC_ANSWER, MESSAGE_TYPES.WEBRTC_ICE_CANDIDATE].includes(message.type)) {
                webRtcSignalRef.current?.(message);
            }
        },
    });

    const call = useWebRTCCall({
        isInitiator: false,
        peerConnected: Boolean(presence?.candidateConnected),
        sendSignal: sendRealtime,
    });

    useEffect(() => {
        webRtcSignalRef.current = call.handleSignal;
    }, [call.handleSignal]);

    // Live alerts from Firebase
    useEffect(() => {
        const alertsRef = ref(db, `alerts/${sessionCode}`);
        const unsub = onValue(alertsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) setAlerts(data);
        });
        return () => unsub();
    }, [sessionCode]);

    useEffect(() => {
        if (!liveCode || realtimeStatus === 'connected') return;
        const codeRef = ref(db, `documents/${sessionCode}`);
        const unsub = onValue(codeRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const content = data.content || '';
                candidateCodeRef.current = content;
                setCandidateCode(content);
            }
        });
        return () => unsub();
    }, [liveCode, sessionCode, realtimeStatus]);

    const loadReport = async (candidateId) => {
        try {
            const res = await axios.get(
                `${API}/logs/${sessionCode}/${candidateId}`,
                { headers }
            );
            setReport(res.data);
            setSelectedCandidate(candidateId);
        } catch {
            alert('Failed to load report');
        }
    };

    const getRiskColor = (score) => {
        if (score >= 60) return 'text-red-400';
        if (score >= 30) return 'text-yellow-400';
        return 'text-green-400';
    };

    const getRiskLabel = (score) => {
        if (score >= 60) return 'HIGH RISK';
        if (score >= 30) return 'MEDIUM RISK';
        return 'LOW RISK';
    };

    const candidateConnected = Boolean(presence?.candidateConnected);
    const activeCandidateId = candidateConnected ? String(presence?.candidateId || '') : '';
    const activeCandidateStats = activeCandidateId ? alerts[activeCandidateId] : null;
    const historicalAlertEntries = Object.entries(alerts).filter(([candidateId]) => candidateId !== activeCandidateId);

    if (!token) { navigate('/login'); return null; }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white">

            {/* Navbar */}
            <nav className="bg-gray-900 border-b border-gray-800 px-8 py-4 flex items-center justify-between">
                <div className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    InterviewShield
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-gray-400 text-sm">Monitoring Session:</span>
                    <span className="font-mono font-bold text-blue-400 text-lg">{sessionCode}</span>
                    <ConnectionStatus realtimeStatus={realtimeStatus} presence={presence} />
                </div>
                <button
                    onClick={() => navigate('/dashboard')}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
                >
                    ← Back to Dashboard
                </button>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-10">

                {/* Live Alert Panel */}
                <div className="mb-10">
                    <h2 className="text-2xl font-bold mb-6">
                        Live Monitoring
                        <span className="ml-3 inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                    </h2>

                    <div className="mb-6 max-w-md">
                        <VideoCallPanel {...call} />
                    </div>

                    <div className={`mb-6 rounded-2xl border p-4 text-sm ${candidateConnected ? 'border-green-600/30 bg-green-600/10 text-green-300' : 'border-gray-800 bg-gray-900 text-gray-400'}`}>
                        {candidateConnected
                            ? 'Candidate connected. Live monitoring is active.'
                            : 'Waiting for candidates to join...'}
                    </div>

                    {candidateConnected && (
                        <div className={`mb-6 bg-gray-900 border rounded-2xl p-6 ${activeCandidateStats?.tabSwitches > 3 ? 'border-red-600/50' : 'border-green-600/30'}`}>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <div className="font-semibold">Candidate #{activeCandidateId}</div>
                                    <div className="text-gray-500 text-xs mt-1">
                                        Last activity: {activeCandidateStats?.lastAlert ? new Date(activeCandidateStats.lastAlert).toLocaleTimeString() : 'Live now'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-2xl font-bold ${activeCandidateStats?.tabSwitches > 3 ? 'text-red-400' : 'text-yellow-400'}`}>
                                        {activeCandidateStats?.tabSwitches || 0}
                                    </div>
                                    <div className="text-gray-500 text-xs">tab switches</div>
                                </div>
                            </div>

                            {activeCandidateStats?.tabSwitches > 3 && (
                                <div className="mb-4 px-3 py-2 bg-red-600/20 border border-red-600/30 rounded-lg text-red-400 text-sm">
                                    ⚠️ Suspicious activity detected
                                </div>
                            )}

                            <button
                                onClick={() => loadReport(activeCandidateId)}
                                className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                            >
                                View Full Report
                            </button>
                            <button
                                onClick={() => setLiveCode(activeCandidateId)}
                                className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors mt-2"
                            >
                                View Live Code
                            </button>
                        </div>
                    )}

                    {historicalAlertEntries.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {historicalAlertEntries.map(([candidateId, data]) => (
                                <div
                                    key={candidateId}
                                    className={`bg-gray-900 border rounded-2xl p-6 ${data.tabSwitches > 3 ? 'border-red-600/50' : 'border-gray-800'}`}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <div className="font-semibold">Candidate #{candidateId}</div>
                                            <div className="text-gray-500 text-xs mt-1">
                                                Last activity: {data.lastAlert ? new Date(data.lastAlert).toLocaleTimeString() : 'N/A'}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-2xl font-bold ${data.tabSwitches > 3 ? 'text-red-400' : 'text-yellow-400'}`}>
                                                {data.tabSwitches || 0}
                                            </div>
                                            <div className="text-gray-500 text-xs">tab switches</div>
                                        </div>
                                    </div>

                                    {data.tabSwitches > 3 && (
                                        <div className="mb-4 px-3 py-2 bg-red-600/20 border border-red-600/30 rounded-lg text-red-400 text-sm">
                                            ⚠️ Suspicious activity detected
                                        </div>
                                    )}

                                    {data.currentlyAway && (
                                        <div className="mb-4 px-3 py-2 bg-red-600/20 border border-red-600/30 rounded-lg text-red-400 text-sm">
                                            ⚠️ Candidate is currently away from the interview tab
                                        </div>
                                    )}

                                    <button
                                        onClick={() => loadReport(candidateId)}
                                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        View Full Report
                                    </button>
                                    <button
                                        onClick={() => setLiveCode(candidateId)}
                                        className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors mt-2"
                                    >
                                        View Live Code
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {liveCode && (
                    <div className="mb-10">
                        <h2 className="text-2xl font-bold mb-4">
                            Live Code — Candidate #{liveCode}
                            <span className="ml-3 text-sm font-normal text-green-400">● Live</span>
                        </h2>
                        <div className="rounded-2xl overflow-hidden border border-gray-800" style={{ height: '400px' }}>
                            <Editor
                                height="400px"
                                language="javascript"
                                value={candidateCode}
                                theme="vs-dark"
                                options={{
                                    readOnly: true,
                                    fontSize: 13,
                                    minimap: { enabled: false },
                                    lineNumbers: 'on',
                                    automaticLayout: true,
                                }}
                            />
                        </div>
                    </div>
                )}
                {/* Report Panel */}
                {report && (
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold">
                                Candidate #{selectedCandidate} — Full Report
                            </h2>

                            <button
                                onClick={() => window.print()}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                            >
                                🖨 Print Report
                            </button>
                            <button
                                onClick={() => loadReport(selectedCandidate)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                            >
                                🔄 Refresh Report
                            </button>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-4 gap-4 mb-8">
                            <div className="bg-gray-800 rounded-2xl p-4 text-center">
                                <div className="text-3xl font-bold text-blue-400">{report.tabSwitches}</div>
                                <div className="text-gray-400 text-sm mt-1">Tab Switches</div>
                            </div>
                            <div className="bg-gray-800 rounded-2xl p-4 text-center">
                                <div className="text-3xl font-bold text-purple-400">{report.snapshots}</div>
                                <div className="text-gray-400 text-sm mt-1">Snapshots</div>
                            </div>
                            <div className="bg-gray-800 rounded-2xl p-4 text-center">
                                <div className="text-3xl font-bold text-yellow-400">{report.totalEvents}</div>
                                <div className="text-gray-400 text-sm mt-1">Total Events</div>
                            </div>
                            <div className="bg-gray-800 rounded-2xl p-4 text-center">
                                <div className={`text-3xl font-bold ${getRiskColor(report.riskScore)}`}>
                                    {report.riskScore}
                                </div>
                                <div className={`text-sm mt-1 ${getRiskColor(report.riskScore)}`}>
                                    {getRiskLabel(report.riskScore)}
                                </div>
                            </div>
                        </div>

                        {/* Tab Switch Timeline */}
                        <div className="mb-8">
                            <h3 className="font-semibold text-gray-300 mb-4">Tab Switch Timeline</h3>
                            <div className="space-y-2 max-h-48 overflow-auto">
                                {report.logs
                                    .filter(l => l.eventType === 'TAB_SWITCH')
                                    .map((log, i) => (
                                        <div key={i} className="flex items-center gap-3 px-4 py-2 bg-gray-800 rounded-lg">
                                            <span className="text-red-400">⚠️</span>
                                            <span className="text-gray-300 text-sm">Tab switched at</span>
                                            <span className="text-white font-mono text-sm">
                                                {new Date(log.eventData).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    ))}
                                {report.logs.filter(l => l.eventType === 'TAB_SWITCH').length === 0 && (
                                    <div className="text-gray-500 text-sm">No tab switches recorded</div>
                                )}
                            </div>
                        </div>

                        {/* Webcam Snapshots */}
                        <div>
                            <h3 className="font-semibold text-gray-300 mb-4">
                                Webcam Snapshots ({report.snapshots})
                            </h3>
                            <div className="grid grid-cols-4 gap-3">
                                {report.logs
                                    .filter(l => l.eventType === 'WEBCAM_SNAPSHOT')
                                    .map((log, i) => (
                                        <img
                                            key={i}
                                            src={log.eventData}
                                            alt={`Snapshot ${i + 1}`}
                                            className="w-full rounded-xl border border-gray-700"
                                        />
                                    ))}
                                {report.logs.filter(l => l.eventType === 'WEBCAM_SNAPSHOT').length === 0 && (
                                    <div className="text-gray-500 text-sm col-span-4">No snapshots yet (taken every 30 seconds)</div>
                                )}
                            </div>
                        </div>
                        {/* Submitted Code */}
                        <div className="mt-8">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-gray-300">Submitted Code</h3>
                                <button
                                    onClick={() => {
                                        const submitLog = report.logs.findLast(l => l.eventType === 'CODE_SUBMIT');
                                        if (!submitLog) {
                                            alert('No code submitted yet by this candidate.');
                                            return;
                                        }
                                        const blob = new Blob([submitLog.eventData], { type: 'text/plain' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `candidate_${selectedCandidate}_${sessionCode}.js`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
                                >
                                    ⬇ Download Submitted Code
                                </button>
                            </div>
                            {report.logs.filter(l => l.eventType === 'CODE_SUBMIT').length > 0 ? (
                                <div className="bg-gray-800 rounded-xl p-4 font-mono text-sm text-green-400 overflow-auto max-h-64">
                                    <pre>{report.logs.findLast(l => l.eventType === 'CODE_SUBMIT')?.eventData}</pre>
                                </div>
                            ) : (
                                <div className="text-gray-500 text-sm">Candidate has not submitted code yet.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
