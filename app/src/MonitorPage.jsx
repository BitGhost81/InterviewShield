import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
const API = '/api';

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
    const [candidateNames, setCandidateNames] = useState({});
    const token = localStorage.getItem('token');
    const headers = React.useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
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
            if (res.data?.candidateName) {
                setCandidateNames((prev) => ({
                    ...prev,
                    [String(candidateId)]: res.data.candidateName,
                }));
            }
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

    useEffect(() => {
        if (!token) return;
        const candidateIdsToFetch = [
            activeCandidateId,
            ...historicalAlertEntries.map(([id]) => id),
        ].filter((id) => id && !candidateNames[id]);

        if (candidateIdsToFetch.length === 0) return;

        candidateIdsToFetch.forEach(async (id) => {
            try {
                const res = await axios.get(`${API}/logs/${sessionCode}/${id}`, { headers });
                if (res.data?.candidateName) {
                    setCandidateNames((prev) => ({
                        ...prev,
                        [String(id)]: res.data.candidateName,
                    }));
                }
            } catch {
                // Graceful fallback to Candidate #id
            }
        });
    }, [sessionCode, token, headers, activeCandidateId, historicalAlertEntries, candidateNames]);

    const getCandidateDisplayName = (candidateId) => {
        if (!candidateId) return 'Candidate';
        const idStr = String(candidateId);
        if (candidateNames[idStr]) return candidateNames[idStr];
        if (report && String(report.candidateId) === idStr && report.candidateName) {
            return report.candidateName;
        }
        return `Candidate #${idStr}`;
    };

    const getCandidateInitial = (candidateId) => {
        if (!candidateId) return 'C';
        const idStr = String(candidateId);
        const name = candidateNames[idStr] || (report && String(report.candidateId) === idStr && report.candidateName);
        if (name && typeof name === 'string' && name.trim().length > 0) {
            return name.trim().charAt(0).toUpperCase();
        }
        return `C#${idStr}`;
    };

    const activeCandidateName = activeCandidateId ? getCandidateDisplayName(activeCandidateId) : 'Candidate';

    if (!token) { navigate('/login'); return null; }

    return (
        <div className="min-h-screen text-white pb-16 relative">
            {/* Navbar */}
            <header className="px-6 py-3.5 border-b border-white/10 glass-subtle sticky top-0 z-30">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-6">
                        <Link to="/" className="inline-flex items-center gap-2.5 group">
                            <span className="grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-mint via-cyan to-violet shadow-[0_0_14px_rgba(76,229,232,0.35)]">
                                <svg className="w-4 h-4" viewBox="0 0 20 22" fill="none">
                                    <path d="M10 1 18.5 4.7v5.7c0 4.7-3.6 8.6-8.5 10C5.1 19 1.5 15.1 1.5 10.4V4.7L10 1Z" stroke="#071014" strokeWidth="1.5" />
                                    <path d="m5.7 10.6 2.7 2.7 5.8-6" stroke="#071014" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">InterviewShield</span>
                        </Link>

                        <div className="flex items-center gap-3 text-xs">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10">
                                <span className="text-white/40">Session:</span>
                                <span className="font-mono text-cyan font-bold tracking-wider">{sessionCode}</span>
                            </span>
                            <ConnectionStatus realtimeStatus={realtimeStatus} presence={presence} />
                        </div>
                    </div>

                    <button
                        onClick={() => navigate('/dashboard')}
                        className="button-ghost px-4 py-1.5 text-xs font-semibold"
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
                {/* Live Monitoring Section */}
                <section className="mb-10">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber shadow-[0_0_10px_#fdbb5e] animate-pulse" />
                            <h1 className="font-display font-bold text-2xl tracking-tight text-white">Live Proctoring & Feed</h1>
                        </div>
                    </div>

                    {/* Top row: Video Call & Status Banner */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6 items-start">
                        <div className="lg:col-span-1">
                            <VideoCallPanel {...call} />
                        </div>

                        <div className="lg:col-span-2 space-y-4">
                            <div className={`rounded-2xl p-4 text-xs font-medium border flex items-center gap-3 ${
                                candidateConnected
                                    ? 'bg-mint/10 border-mint/25 text-mint shadow-[0_0_15px_rgba(76,229,232,0.1)]'
                                    : 'glass-subtle text-white/50 border-white/10'
                            }`}>
                                <span className={`w-2 h-2 rounded-full ${candidateConnected ? 'bg-mint' : 'bg-white/30'}`} />
                                <span>
                                    {candidateConnected
                                        ? 'Candidate is connected. Live synchronization and proctoring are active.'
                                        : 'Waiting for candidate to join this session...'}
                                </span>
                            </div>

                            {/* Active Candidate Card */}
                            {candidateConnected && (
                                <div className={`glass rounded-2xl p-6 border transition-all ${
                                    activeCandidateStats?.tabSwitches > 3 ? 'border-amber/40 shadow-[0_0_20px_rgba(253,187,94,0.15)]' : 'border-white/15'
                                }`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-mint via-cyan to-violet grid place-items-center text-ink font-display font-bold text-xs shadow-md uppercase">
                                                {getCandidateInitial(activeCandidateId)}
                                            </div>
                                            <div>
                                                <div className="font-display font-semibold text-base text-white">
                                                    {activeCandidateName}
                                                </div>
                                                <div className="text-white/45 text-xs">
                                                    Last activity: {activeCandidateStats?.lastAlert ? new Date(activeCandidateStats.lastAlert).toLocaleTimeString() : 'Live now'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <div className={`font-display font-bold text-3xl ${activeCandidateStats?.tabSwitches > 3 ? 'text-amber' : 'text-mint'}`}>
                                                {activeCandidateStats?.tabSwitches || 0}
                                            </div>
                                            <div className="text-white/40 text-[11px] uppercase tracking-wider">tab switches</div>
                                        </div>
                                    </div>

                                    {activeCandidateStats?.tabSwitches > 3 && (
                                        <div className="mb-4 px-3.5 py-2 rounded-xl bg-amber/15 border border-amber/30 text-amber text-xs font-semibold flex items-center gap-2">
                                            <span>⚠️</span>
                                            <span>Elevated activity detected: multiple tab switches recorded.</span>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2.5 mt-4">
                                        <button
                                            onClick={() => loadReport(activeCandidateId)}
                                            className="button-primary flex-1 py-2 text-xs font-semibold"
                                        >
                                            View Full Report ↗
                                        </button>
                                        <button
                                            onClick={() => setLiveCode(activeCandidateId)}
                                            className="button-ghost flex-1 py-2 text-xs font-semibold"
                                        >
                                            View Live Code 👁
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Historical candidates if any */}
                    {historicalAlertEntries.length > 0 && (
                        <div>
                            <h3 className="font-display font-semibold text-sm text-white/70 uppercase tracking-wider mb-3">
                                Other Session Participants
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {historicalAlertEntries.map(([candidateId, data]) => (
                                    <div
                                        key={candidateId}
                                        className={`glass rounded-2xl p-5 border ${data.tabSwitches > 3 ? 'border-amber/40' : 'border-white/10'}`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <div className="font-display font-semibold text-white">{getCandidateDisplayName(candidateId)}</div>
                                                <div className="text-white/40 text-xs mt-0.5">
                                                    Last activity: {data.lastAlert ? new Date(data.lastAlert).toLocaleTimeString() : 'N/A'}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`font-display font-bold text-xl ${data.tabSwitches > 3 ? 'text-amber' : 'text-mint'}`}>
                                                    {data.tabSwitches || 0}
                                                </div>
                                                <div className="text-white/40 text-[10px] uppercase">tab switches</div>
                                            </div>
                                        </div>

                                        {data.currentlyAway && (
                                            <div className="mb-3 px-3 py-1.5 rounded-lg bg-amber/15 border border-amber/25 text-amber text-xs">
                                                ⚠️ Candidate is currently away from the interview tab
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => loadReport(candidateId)}
                                                className="button-primary flex-1 py-1.5 text-xs font-semibold"
                                            >
                                                View Report
                                            </button>
                                            <button
                                                onClick={() => setLiveCode(candidateId)}
                                                className="button-ghost flex-1 py-1.5 text-xs font-semibold"
                                            >
                                                Live Code
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                {/* Live Code Mirror Container */}
                {liveCode && (
                    <section className="mb-10">
                        <div className="glass rounded-[24px] overflow-hidden border border-white/15 shadow-2xl">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/5">
                                <div className="flex items-center gap-2.5">
                                    <span className="w-2 h-2 rounded-[2px] bg-violet" />
                                    <h2 className="font-display font-semibold text-sm text-white">
                                        Live Code Mirror — {getCandidateDisplayName(liveCode)}
                                    </h2>
                                </div>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-mint/10 border border-mint/20 text-mint text-xs font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-mint shadow-[0_0_6px_#4ce5e8]" />
                                    Read-Only Mirror
                                </span>
                            </div>
                            <div className="bg-[#020610]/80" style={{ height: '420px' }}>
                                <Editor
                                    height="420px"
                                    language="javascript"
                                    value={candidateCode}
                                    theme="vs-dark"
                                    options={{
                                        readOnly: true,
                                        fontSize: 13,
                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                        minimap: { enabled: false },
                                        lineNumbers: 'on',
                                        automaticLayout: true,
                                    }}
                                />
                            </div>
                        </div>
                    </section>
                )}

                {/* Full Report Panel */}
                {report && (
                    <section className="glass rounded-[28px] p-6 sm:p-8 border border-white/15 shadow-2xl">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-5 border-b border-white/10">
                            <div>
                                <div className="text-mint text-[11px] font-bold uppercase tracking-widest mb-1">Integrity Summary</div>
                                <h2 className="font-display font-bold text-2xl text-white tracking-tight">
                                    {getCandidateDisplayName(selectedCandidate)} — Full Report
                                </h2>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => window.print()}
                                    className="button-ghost px-4 py-2 text-xs font-semibold"
                                >
                                    🖨 Print Report
                                </button>
                                <button
                                    onClick={() => loadReport(selectedCandidate)}
                                    className="button-primary px-4 py-2 text-xs font-semibold"
                                >
                                    🔄 Refresh
                                </button>
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <div className="glass-subtle rounded-2xl p-4 text-center border border-white/10">
                                <div className="font-display text-3xl font-bold text-cyan">{report.tabSwitches}</div>
                                <div className="text-white/50 text-xs mt-1">Tab Switches</div>
                            </div>
                            <div className="glass-subtle rounded-2xl p-4 text-center border border-white/10">
                                <div className="font-display text-3xl font-bold text-violet">{report.snapshots}</div>
                                <div className="text-white/50 text-xs mt-1">Snapshots</div>
                            </div>
                            <div className="glass-subtle rounded-2xl p-4 text-center border border-white/10">
                                <div className="font-display text-3xl font-bold text-white">{report.totalEvents}</div>
                                <div className="text-white/50 text-xs mt-1">Total Events</div>
                            </div>
                            <div className="glass-subtle rounded-2xl p-4 text-center border border-white/10">
                                <div className={`font-display text-3xl font-bold ${getRiskColor(report.riskScore)}`}>
                                    {report.riskScore}
                                </div>
                                <div className={`text-xs mt-1 font-semibold ${getRiskColor(report.riskScore)}`}>
                                    {getRiskLabel(report.riskScore)}
                                </div>
                            </div>
                        </div>

                        {/* Tab Switch Timeline */}
                        <div className="mb-8">
                            <h3 className="font-display font-semibold text-white text-sm uppercase tracking-wider mb-4">
                                Tab Switch Timeline
                            </h3>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                {report.logs
                                    .filter(l => l.eventType === 'TAB_SWITCH')
                                    .map((log, i) => (
                                        <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                                            <div className="flex items-center gap-2 text-white/80">
                                                <span className="text-amber">⚠️</span>
                                                <span>Tab switched away</span>
                                            </div>
                                            <span className="text-cyan font-mono font-medium">
                                                {new Date(log.eventData).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    ))}
                                {report.logs.filter(l => l.eventType === 'TAB_SWITCH').length === 0 && (
                                    <div className="text-white/40 text-xs py-2">No tab switches recorded during this session.</div>
                                )}
                            </div>
                        </div>

                        {/* Webcam Snapshots */}
                        <div className="mb-8">
                            <h3 className="font-display font-semibold text-white text-sm uppercase tracking-wider mb-4">
                                Webcam Snapshots ({report.snapshots})
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {report.logs
                                    .filter(l => l.eventType === 'WEBCAM_SNAPSHOT')
                                    .map((log, i) => (
                                        <div key={i} className="rounded-xl overflow-hidden border border-white/15 aspect-video bg-black/50">
                                            <img
                                                src={log.eventData}
                                                alt={`Snapshot ${i + 1}`}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    ))}
                                {report.logs.filter(l => l.eventType === 'WEBCAM_SNAPSHOT').length === 0 && (
                                    <div className="text-white/40 text-xs col-span-4 py-2">No snapshots recorded yet (captured periodically).</div>
                                )}
                            </div>
                        </div>

                        {/* Submitted Code */}
                        <div className="pt-4 border-t border-white/10">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-display font-semibold text-white text-sm uppercase tracking-wider">Submitted Code</h3>
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
                                        const candidateDisplay = getCandidateDisplayName(selectedCandidate);
                                        const safeName = candidateDisplay.toLowerCase().replace(/[^a-z0-9]/g, '_');
                                        a.download = `${safeName}_${sessionCode}.js`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                    className="button-primary px-4 py-1.5 text-xs font-semibold"
                                >
                                    ⬇ Download Code
                                </button>
                            </div>
                            {report.logs.filter(l => l.eventType === 'CODE_SUBMIT').length > 0 ? (
                                <div className="rounded-xl p-4 bg-[#020610]/80 border border-white/15 font-mono text-xs text-mint overflow-auto max-h-64 leading-relaxed whitespace-pre-wrap">
                                    <pre>{report.logs.findLast(l => l.eventType === 'CODE_SUBMIT')?.eventData}</pre>
                                </div>
                            ) : (
                                <div className="text-white/40 text-xs py-2">Candidate has not submitted code yet.</div>
                            )}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
