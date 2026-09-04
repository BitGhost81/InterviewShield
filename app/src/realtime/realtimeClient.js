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

    socket = new WebSocket(REALTIME_URL);
    setStatus('connecting');

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
            setStatus('connected');
        }

        if (message.type === MESSAGE_TYPES.ERROR) {
            setStatus('error');
        }

        onMessage?.(message);
    });

    socket.addEventListener('close', () => {
        joined = false;
        setStatus(closedByClient ? 'closed' : 'disconnected');
    });

    socket.addEventListener('error', () => setStatus('error'));

    const close = () => {
        closedByClient = true;
        if (socket.readyState === WebSocket.OPEN && joined) {
            send(MESSAGE_TYPES.LEAVE_SESSION, { reason: 'client_close' });
        } else {
            socket.close();
        }
    };

    return { send, close };
}

