import { useEffect, useRef, useState } from 'react';
import { createRealtimeClient } from '../realtime/realtimeClient';
import { MESSAGE_TYPES } from '../realtime/messages';

export function useRealtimeSession({ sessionCode, role, userId, token, onMessage }) {
    const clientRef = useRef(null);
    const onMessageRef = useRef(onMessage);
    const [status, setStatus] = useState('idle');
    const [presence, setPresence] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        onMessageRef.current = onMessage;
    }, [onMessage]);

    useEffect(() => {
        if (!sessionCode || !role || !token) return;

        const client = createRealtimeClient({
            sessionCode,
            role,
            userId,
            token,
            onStatusChange: setStatus,
            onMessage: (message) => {
                if (message.type === MESSAGE_TYPES.PRESENCE) {
                    setPresence(message.payload);
                }

                if (message.type === MESSAGE_TYPES.ERROR) {
                    setError(message.payload?.message || 'Realtime connection error.');
                }

                onMessageRef.current?.(message);
            },
        });

        clientRef.current = client;

        return () => {
            client.close();
            if (clientRef.current === client) {
                clientRef.current = null;
            }
        };
    }, [sessionCode, role, userId, token]);

    const send = (type, payload) => clientRef.current?.send(type, payload) || false;

    return { send, status, presence, error };
}
