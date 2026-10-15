import { initializeApp, deleteApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, signInWithCustomToken, signOut } from 'firebase/auth';
import { getDatabase, goOffline } from 'firebase/database';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';
let sequence = 0;

// Each mounted room gets an isolated, memory-only identity (no cross-tab/session claims).
export function openFirebaseSession(sessionCode, jwt, onReady, onError) {
    let app;
    let auth;
    let database;
    let timer;
    let expiryTimer;
    let closed = false;
    let accessUntil = 0;
    let inFlight = Promise.resolve();
    const abortController = new AbortController();
    const config = {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };
    const refresh = () => { inFlight = refreshAccess(); return inFlight; };
    const refreshAccess = async () => {
        try {
            if (Object.values(config).some(value => !value)) throw new Error('Firebase configuration missing');
            const { data } = await axios.post(`${API}/sessions/${sessionCode}/firebase-token`, {}, {
                headers: { Authorization: `Bearer ${jwt}` },
                signal: abortController.signal,
                timeout: 10000,
            });
            if (closed) return;
            if (data.projectId !== config.projectId || typeof data.uid !== 'string' || !Number.isFinite(data.accessUntil)) {
                throw new Error('Invalid Firebase access configuration');
            }
            if (!app) {
                app = initializeApp(config, `codelock-room-${++sequence}`);
                auth = initializeAuth(app, { persistence: inMemoryPersistence });
                database = getDatabase(app);
            }
            const credential = await signInWithCustomToken(auth, data.token);
            if (closed) return;
            if (credential.user.uid !== data.uid || data.accessUntil <= Date.now()) throw new Error('Invalid Firebase access');
            accessUntil = data.accessUntil;
            onReady({ database, uid: data.uid });
            clearTimeout(expiryTimer);
            expiryTimer = setTimeout(() => {
                if (!closed) onError('Firebase access expired; reconnecting securely.', true);
            }, Math.max(0, accessUntil - Date.now()));
            timer = setTimeout(refresh, Math.max(1000, Math.min(240000, accessUntil - Date.now() - 30000)));
        } catch {
            if (!closed) {
                onError('Firebase fallback/history unavailable. Check secure Firebase configuration and connection.', accessUntil <= Date.now());
                timer = setTimeout(refresh, 15000);
            }
        }
    };
    void refresh();
    return () => {
        closed = true;
        abortController.abort();
        clearTimeout(timer);
        clearTimeout(expiryTimer);
        if (database) goOffline(database);
        // An in-flight sign-in must finish before its app is deleted.
        void inFlight.catch(() => {}).then(async () => {
            if (auth) await signOut(auth);
            if (app) await deleteApp(app);
        }).catch(() => {});
    };
}
