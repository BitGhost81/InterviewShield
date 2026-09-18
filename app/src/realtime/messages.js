export const MESSAGE_TYPES = {
    JOIN_SESSION: 'join_session',
    PRESENCE: 'presence',
    CODE_SNAPSHOT: 'code_snapshot',
    CODE_DELTA: 'code_delta',
    CODE_RESYNC: 'code_resync',
    FULLSCREEN_EXIT: 'fullscreen_exit',
    FULLSCREEN_RESTORE: 'fullscreen_restore',
    FOCUS_LOST: 'focus_lost',
    FOCUS_RETURN: 'focus_return',
    WEBRTC_OFFER: 'webrtc_offer',
    WEBRTC_ANSWER: 'webrtc_answer',
    WEBRTC_ICE_CANDIDATE: 'webrtc_ice_candidate',
    LEAVE_SESSION: 'leave_session',
    ERROR: 'error',
};

export const REALTIME_URL = import.meta.env.VITE_REALTIME_URL
    || (typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'wss://localhost:1234'
        : `wss://${(typeof window !== 'undefined' && window.location.hostname) || '192.168.1.9'}:1234`);
