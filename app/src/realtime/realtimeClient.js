import { MESSAGE_TYPES, REALTIME_URL } from './messages';

export function createRealtimeClient({
    sessionCode,
    role,
    userId,
    token,
    onMessage,
    onStatusChange,
}) {
    let socket;
    let joined = false;
    let closedByClient = false;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const senderRole = role.toLowerCase();
    const terminalErrorCodes = new Set([
        'session_occupied',
        'unauthorized',
        'invalid_session',
        'invalid_role',
        'role_mismatch',
        'session_mismatch',
        'not_joined',
        'already_joined',
        'unsupported_message',
        'invalid_message',
        'invalid_json',
    ]);

    const setStatus = (status) => onStatusChange?.(status);

    const send = (type, payload = {}) => {
        if (!socket || socket.readyState !== WebSocket.OPEN || !joined) return false;

        socket.send(JSON.stringify({
            type,
            sessionCode,
            senderRole,
            senderId: userId ? String(userId) : null,
            payload,
        }));

        return true;
    };

    const connect = () => {
        if (closedByClient) return;
        socket = new WebSocket(REALTIME_URL);
        setStatus(reconnectAttempts ? 'reconnecting' : 'connecting');

        socket.addEventListener('open', () => {
            if (reconnectTimer) {
                window.clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            socket.send(JSON.stringify({
                type: MESSAGE_TYPES.JOIN_SESSION,
                sessionCode,
                senderRole,
                senderId: userId ? String(userId) : null,
                payload: { token },
            }));
        });

        socket.addEventListener('message', (event) => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }

            if (message.type === MESSAGE_TYPES.PRESENCE) {
                joined = true;
                reconnectAttempts = 0;
                setStatus('connected');
            }

            if (message.type === MESSAGE_TYPES.ERROR) {
                setStatus('error');
                if (terminalErrorCodes.has(message.payload?.code)) {
                    // Join/auth/session errors are terminal for this socket.
                    closedByClient = true;
                }
            }

            onMessage?.(message);
        });

        socket.addEventListener('close', () => {
            joined = false;
            if (closedByClient) {
                setStatus('closed');
                return;
            }
            setStatus('disconnected');
            const delay = Math.min(1000 * 2 ** reconnectAttempts, 8000);
            reconnectAttempts += 1;
            reconnectTimer = window.setTimeout(connect, delay);
        });

        socket.addEventListener('error', () => setStatus('error'));
    };

    connect();

    const close = () => {
        closedByClient = true;
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        if (socket.readyState === WebSocket.OPEN && joined) {
            send(MESSAGE_TYPES.LEAVE_SESSION, { reason: 'client_close' });
        } else {
            socket.close();
        }
    };

    return { send, close };
}

export function probeRealtimeJoin({
    sessionCode,
    role,
    userId,
    token,
    timeoutMs = 8000,
}) {
    return new Promise((resolve, reject) => {
        let socket;
        let settled = false;
        const senderRole = role.toLowerCase();
        const timer = window.setTimeout(() => {
            finishError('join_timeout', 'Timed out while waiting for the realtime session to accept the join.');
        }, timeoutMs);

        const cleanup = () => {
            window.clearTimeout(timer);
            if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
                socket.close();
            }
        };

        const finishSuccess = (message) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(message);
        };

        const finishError = (code, message) => {
            if (settled) return;
            settled = true;
            cleanup();
            const error = new Error(message);
            error.code = code;
            reject(error);
        };

        socket = new WebSocket(REALTIME_URL);

        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({
                type: MESSAGE_TYPES.JOIN_SESSION,
                sessionCode,
                senderRole,
                senderId: userId ? String(userId) : null,
                payload: { token },
            }));
        });

        socket.addEventListener('message', (event) => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }

            if (message.type === MESSAGE_TYPES.PRESENCE) {
                finishSuccess(message.payload || {});
                return;
            }

            if (message.type === MESSAGE_TYPES.ERROR) {
                finishError(message.payload?.code || 'join_rejected', message.payload?.message || 'Unable to join session.');
            }
        });

        socket.addEventListener('close', () => {
            if (!settled) {
                finishError('join_closed', 'Realtime connection closed before the session accepted the join.');
            }
        });

        socket.addEventListener('error', () => {
            if (!settled) {
                finishError('join_error', 'Unable to connect to the realtime server.');
            }
        });
    });
}

