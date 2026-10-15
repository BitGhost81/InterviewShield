import { useEffect, useState } from 'react';
import { openFirebaseSession } from '../firebase/session';

export function useFirebaseSession(sessionCode, token) {
    const [state, setState] = useState({ connection: null, error: '' });
    useEffect(() => {
        if (!sessionCode || !token) return;
        let active = true;
        const close = openFirebaseSession(sessionCode, token,
            connection => { if (active) setState({ connection, error: '', sessionCode, token }); },
            (error, expired) => {
                if (active) setState(previous => ({ connection: expired ? null : previous.connection, error, sessionCode, token }));
            });
        return () => { active = false; close(); };
    }, [sessionCode, token]);
    return state.sessionCode === sessionCode && state.token === token
        ? state : { connection: null, error: '' };
}
