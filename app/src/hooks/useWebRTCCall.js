import { useCallback, useEffect, useRef, useState } from 'react';
import { MESSAGE_TYPES } from '../realtime/messages';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export function useWebRTCCall({ isInitiator, peerConnected, sendSignal }) {
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const streamRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const queuedCandidatesRef = useRef([]);
    const sendSignalRef = useRef(sendSignal);
    const [mediaStatus, setMediaStatus] = useState('requesting');
    const [callStatus, setCallStatus] = useState('waiting');
    const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(true);

    useEffect(() => { sendSignalRef.current = sendSignal; }, [sendSignal]);

    const getLocalStream = useCallback(async () => {
        if (streamRef.current) return streamRef.current;
        if (!navigator.mediaDevices?.getUserMedia) {
            setMediaStatus('unsupported');
            throw new Error('Camera and microphone access is not supported by this browser.');
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            setMediaStatus('ready');
            return stream;
        } catch (error) {
            setMediaStatus('denied');
            throw error;
        }
    }, []);

    const closePeerConnection = useCallback(() => {
        const peer = peerConnectionRef.current;
        if (!peer) return;
        peer.onicecandidate = null;
        peer.ontrack = null;
        peer.onconnectionstatechange = null;
        peer.close();
        peerConnectionRef.current = null;
        queuedCandidatesRef.current = [];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    }, []);

    const createPeerConnection = useCallback(async () => {
        const existing = peerConnectionRef.current;
        if (existing && existing.connectionState !== 'closed') return existing;

        const stream = await getLocalStream();
        const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = peer;
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));

        peer.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignalRef.current?.(MESSAGE_TYPES.WEBRTC_ICE_CANDIDATE, {
                    candidate: event.candidate.toJSON(),
                });
            }
        };
        peer.ontrack = (event) => {
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        };
        peer.onconnectionstatechange = () => {
            const state = peer.connectionState;
            if (state === 'connected') setCallStatus('connected');
            if (state === 'failed') setCallStatus('failed');
            if (state === 'disconnected') setCallStatus('disconnected');
        };
        return peer;
    }, [getLocalStream]);

    const flushQueuedCandidates = useCallback(async (peer) => {
        const queued = queuedCandidatesRef.current.splice(0);
        for (const candidate of queued) await peer.addIceCandidate(candidate);
    }, []);

    const startCall = useCallback(async () => {
        if (!isInitiator || !peerConnected) return;
        try {
            setCallStatus('connecting');
            closePeerConnection();
            const peer = await createPeerConnection();
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            sendSignalRef.current?.(MESSAGE_TYPES.WEBRTC_OFFER, { sdp: peer.localDescription });
        } catch {
            setCallStatus('media_error');
        }
    }, [closePeerConnection, createPeerConnection, isInitiator, peerConnected]);

    const handleSignal = useCallback(async (message) => {
        try {
            if (message.type === MESSAGE_TYPES.WEBRTC_OFFER) {
                setCallStatus('connecting');
                closePeerConnection();
                const peer = await createPeerConnection();
                await peer.setRemoteDescription(new RTCSessionDescription(message.payload?.sdp));
                await flushQueuedCandidates(peer);
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                sendSignalRef.current?.(MESSAGE_TYPES.WEBRTC_ANSWER, { sdp: peer.localDescription });
            }
            if (message.type === MESSAGE_TYPES.WEBRTC_ANSWER) {
                const peer = peerConnectionRef.current;
                if (!peer) return;
                await peer.setRemoteDescription(new RTCSessionDescription(message.payload?.sdp));
                await flushQueuedCandidates(peer);
            }
            if (message.type === MESSAGE_TYPES.WEBRTC_ICE_CANDIDATE) {
                const candidate = message.payload?.candidate;
                if (!candidate) return;
                const peer = peerConnectionRef.current;
                if (!peer || !peer.remoteDescription) queuedCandidatesRef.current.push(candidate);
                else await peer.addIceCandidate(candidate);
            }
        } catch {
            setCallStatus('failed');
        }
    }, [closePeerConnection, createPeerConnection, flushQueuedCandidates]);

    useEffect(() => {
        return () => {
            closePeerConnection();
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        };
    }, [closePeerConnection]);

    useEffect(() => {
        if (isInitiator && peerConnected) {
            const timer = window.setTimeout(startCall, 0);
            return () => window.clearTimeout(timer);
        }

        if (!peerConnected) {
            closePeerConnection();
            const timer = window.setTimeout(() => setCallStatus('waiting'), 0);
            return () => window.clearTimeout(timer);
        }
    }, [closePeerConnection, isInitiator, peerConnected, startCall]);

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioContextRef = useRef(null);
    const audioDestinationRef = useRef(null);
    const localAudioSourceRef = useRef(null);
    const remoteAudioSourceRef = useRef(null);

    const setupAudioRecorder = useCallback((localStream, remoteStream) => {
        try {
            if (!audioContextRef.current) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) return;
                audioContextRef.current = new AudioContextClass();
                audioDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
            }

            const ctx = audioContextRef.current;
            const dest = audioDestinationRef.current;

            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            if (localStream && localStream.getAudioTracks().length > 0 && !localAudioSourceRef.current) {
                localAudioSourceRef.current = ctx.createMediaStreamSource(localStream);
                localAudioSourceRef.current.connect(dest);
            }

            if (remoteStream && remoteStream.getAudioTracks().length > 0 && !remoteAudioSourceRef.current) {
                remoteAudioSourceRef.current = ctx.createMediaStreamSource(remoteStream);
                remoteAudioSourceRef.current.connect(dest);
            }

            if (dest && dest.stream && !mediaRecorderRef.current) {
                const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
                const recorder = new MediaRecorder(dest.stream, { mimeType });
                audioChunksRef.current = [];
                recorder.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                        audioChunksRef.current.push(event.data);
                    }
                };
                recorder.start(1000);
                mediaRecorderRef.current = recorder;
            }
        } catch (e) {
            console.warn('Audio recording setup failed:', e);
        }
    }, []);

    const stopRecording = useCallback(() => {
        return new Promise((resolve) => {
            const recorder = mediaRecorderRef.current;
            if (!recorder || recorder.state === 'inactive') {
                const chunks = audioChunksRef.current;
                const blob = chunks.length > 0 ? new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }) : null;
                resolve(blob);
                return;
            }

            // Safety timeout: if onstop never fires within 3 seconds, resolve with whatever we have
            let resolved = false;
            const safeResolve = (blob) => {
                if (!resolved) {
                    resolved = true;
                    resolve(blob);
                }
            };

            const timeout = setTimeout(() => {
                console.warn('[Recording] onstop timeout — resolving with available chunks');
                const chunks = audioChunksRef.current;
                safeResolve(chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null);
            }, 3000);

            recorder.onstop = () => {
                clearTimeout(timeout);
                const chunks = audioChunksRef.current;
                safeResolve(chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null);
            };

            try {
                recorder.stop();
            } catch {
                clearTimeout(timeout);
                safeResolve(null);
            }
        });
    }, []);

    // Hook setup inside createPeerConnection ontrack
    useEffect(() => {
        if (streamRef.current) {
            setupAudioRecorder(streamRef.current, remoteVideoRef.current?.srcObject);
        }
    }, [setupAudioRecorder, callStatus]);

    const toggleMicrophone = () => {
        const enabled = !microphoneEnabled;
        streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
        setMicrophoneEnabled(enabled);
    };
    const toggleCamera = () => {
        const enabled = !cameraEnabled;
        streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = enabled; });
        setCameraEnabled(enabled);
    };

    return { localVideoRef, remoteVideoRef, mediaStatus, callStatus, microphoneEnabled, cameraEnabled,
        toggleMicrophone, toggleCamera, retryCall: startCall, handleSignal, stopRecording };
}
