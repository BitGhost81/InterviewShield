import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const secret = 'test-only-secret-with-at-least-32-bytes';
const appDir = fileURLToPath(new URL('../', import.meta.url));
function token(email, role = 'CANDIDATE', signingSecret = secret, exp = Math.floor(Date.now() / 1000) + 60) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: email, role, exp })).toString('base64url');
    return `${header}.${body}.${createHmac('sha256', signingSecret).update(`${header}.${body}`).digest('base64url')}`;
}

async function listen(server) {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return server.address().port;
}

async function connect(port) {
    // Local mkcert certificates are not trusted by the Node test process.
    const ws = new WebSocket(`wss://127.0.0.1:${port}`, { rejectUnauthorized: false });
    const messages = [];
    ws.on('message', raw => messages.push(JSON.parse(raw)));
    await once(ws, 'open');
    return { ws, messages };
}

async function waitMessage(client, predicate) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
        const index = client.messages.findIndex(predicate);
        if (index !== -1) return client.messages.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for relay message');
}

function join(client, jwt, role = 'candidate', sessionCode = 'ABC123') {
    client.ws.send(JSON.stringify({ type: 'join_session', sessionCode, senderRole: role, senderId: '999', payload: { token: jwt } }));
}

test('relay authorizes identity, isolation, duplicates and reconnects', { timeout: 25000 }, async t => {
    let assigned = null;
    const backend = createServer((req, res) => {
        const jwt = req.headers.authorization?.slice(7);
        const email = jwt ? JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).sub : '';
        const reply = (status, body) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
        };
        if (req.url === '/api/sessions/ABC123/participation' && req.method === 'POST') {
            if (email === 'owner') return reply(200, { id: 1, role: 'INTERVIEWER', status: 'ACTIVE' });
            if (email === 'unrelated') return reply(403, { error: 'Forbidden' });
            if (assigned && assigned !== email) return reply(409, { error: 'Session already has a candidate' });
            assigned = email;
            return reply(200, { id: 2, role: 'CANDIDATE', status: 'ACTIVE' });
        }
        if (req.url === '/api/sessions/ABC123' && req.method === 'GET') return reply(200, { status: 'ENDED' });
        reply(404, { error: 'Session not found' });
    });
    t.after(() => backend.close());
    const apiPort = await listen(backend);
    const reservation = createServer();
    const relayPort = await listen(reservation);
    await new Promise(resolve => reservation.close(resolve));
    const child = spawn(process.execPath, ['ws-server.js'], {
        cwd: appDir,
        windowsHide: true,
        env: { ...process.env, JWT_SECRET: secret, REALTIME_PORT: String(relayPort), API_BASE_URL: `http://127.0.0.1:${apiPort}/api` },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(async () => {
        if (child.exitCode === null) {
            const exited = once(child, 'exit');
            child.kill();
            await exited;
        }
    });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Relay startup timed out')), 5000);
        child.stdout.on('data', data => {
            if (data.toString().includes('running on port')) { clearTimeout(timer); resolve(); }
        });
        child.stderr.on('data', data => { clearTimeout(timer); reject(new Error(data.toString())); });
        child.on('error', reject);
    });
    const clients = [];
    t.after(() => clients.forEach(client => client.ws.terminate()));
    const open = async () => { const client = await connect(relayPort); clients.push(client); return client; };

    await t.test('invalid signature and expired tokens are rejected', async () => {
        for (const jwt of [token('candidate', 'CANDIDATE', 'different-secret'), token('candidate', 'CANDIDATE', secret, 1)]) {
            const client = await open();
            join(client, jwt);
            assert.equal((await waitMessage(client, m => m.type === 'error')).payload.code, 'unauthorized');
        }
    });
    await t.test('unrelated interviewer cannot join', async () => {
        const client = await open();
        join(client, token('unrelated', 'INTERVIEWER'), 'interviewer');
        assert.equal((await waitMessage(client, m => m.type === 'error')).payload.code, 'unauthorized');
    });
    const owner = await open();
    join(owner, token('owner', 'INTERVIEWER'), 'interviewer');
    assert.equal((await waitMessage(owner, m => m.type === 'presence')).payload.interviewerId, '1');
    let candidate = await open();
    join(candidate, token('candidate'));
    await t.test('presence and alerts ignore forged IDs', async () => {
        assert.equal((await waitMessage(candidate, m => m.type === 'presence')).payload.candidateId, '2');
        candidate.ws.send(JSON.stringify({ type: 'focus_lost', sessionCode: 'ABC123', senderId: '999', payload: { candidateId: 999, count: 1 } }));
        const alert = await waitMessage(owner, m => m.type === 'focus_lost');
        assert.equal(alert.senderId, '2');
        assert.equal(alert.payload.candidateId, '2');
    });
    await t.test('cross-session and role-forged messages are rejected', async () => {
        candidate.ws.send(JSON.stringify({ type: 'code_snapshot', sessionCode: 'OTHER' }));
        assert.equal((await waitMessage(candidate, m => m.type === 'error')).payload.code, 'session_mismatch');
        owner.ws.send(JSON.stringify({ type: 'code_delta', sessionCode: 'ABC123', payload: {} }));
        assert.equal((await waitMessage(owner, m => m.type === 'error')).payload.code, 'unauthorized');
    });
    await t.test('duplicate and different candidates cannot occupy the room', async () => {
        for (const email of ['candidate', 'differentCandidate']) {
            const duplicate = await open();
            join(duplicate, token(email));
            assert.equal((await waitMessage(duplicate, m => m.type === 'error')).payload.code, 'session_occupied');
        }
    });
    await t.test('same candidate reconnects with validated identity', async () => {
        const closed = once(candidate.ws, 'close');
        candidate.ws.close();
        await closed;
        await waitMessage(owner, m => m.type === 'presence' && !m.payload.candidateConnected);
        candidate = await open();
        join(candidate, token('candidate'));
        assert.equal((await waitMessage(candidate, m => m.type === 'presence')).payload.candidateId, '2');
    });
    await t.test('session end still notifies both peers', async () => {
        owner.ws.send(JSON.stringify({ type: 'leave_session', sessionCode: 'ABC123', payload: { reason: 'session_ended' } }));
        assert.equal((await waitMessage(candidate, m => m.type === 'error')).payload.code, 'session_ended');
        assert.equal((await waitMessage(owner, m => m.type === 'error')).payload.code, 'session_ended');
    });
});

test('relay fails startup without a signing secret', async () => {
    const child = spawn(process.execPath, ['ws-server.js'], { cwd: appDir, windowsHide: true, env: { ...process.env, JWT_SECRET: '' } });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    const [code] = await once(child, 'exit');
    assert.notEqual(code, 0);
    assert.match(stderr, /JWT_SECRET must contain at least 32/);
});
