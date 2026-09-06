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
                if (message.payload?.code === 'duplicate_connection') {
                    // The newer tab owns this role. Do not reconnect and displace it again.
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

