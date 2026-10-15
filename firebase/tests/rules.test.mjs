import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, get, set, update, increment, runTransaction, serverTimestamp } from 'firebase/database';
import { nextBackupValue } from '../../app/src/firebase/reliability.js';

let environment;
before(async () => {
    environment = await initializeTestEnvironment({
        projectId: 'demo-codelock',
        database: { rules: await readFile(new URL('../database.rules.json', import.meta.url), 'utf8') },
    });
});
beforeEach(async () => environment.clearDatabase());
after(async () => environment?.cleanup());

function database(uid = '2', role = 'candidate', session = 'ABC123', until = Date.now() + 300000) {
    return environment.authenticatedContext(uid, {
        sessionCode: session, participantRole: role, accessUntil: until,
        writeUntil: role === 'candidate' ? until : 0,
    }).database();
}
const doc = (revision = 1) => ({ content: 'solution', revision, writerId: '2', updatedAt: serverTimestamp() });

test('anonymous access and arbitrary authenticated users are denied', async () => {
    const anonymous = environment.unauthenticatedContext().database();
    const unscoped = environment.authenticatedContext('2').database();
    await assertFails(get(ref(anonymous, 'documents/ABC123')));
    await assertFails(set(ref(anonymous, 'documents/ABC123'), doc()));
    await assertFails(get(ref(unscoped, 'documents/ABC123')));
    await assertFails(get(ref(database(), '/')));
    await assertFails(set(ref(database(), 'privileged'), true));
});

test('candidate reads/writes only own session; owner is read-only', async () => {
    const candidate = database();
    await assertSucceeds(set(ref(candidate, 'documents/ABC123'), doc()));
    await assertSucceeds(get(ref(candidate, 'documents/ABC123')));
    await assertFails(get(ref(candidate, 'documents/OTHER')));
    await assertFails(set(ref(candidate, 'documents/OTHER'), doc()));
    const owner = database('1', 'interviewer');
    await assertSucceeds(get(ref(owner, 'documents/ABC123')));
    await assertFails(set(ref(owner, 'documents/ABC123'), doc(2)));
    await assertFails(get(ref(database('4', 'interviewer', 'OTHER'), 'documents/ABC123')));
});

test('expired leases cannot read or write, even with a refreshed Firebase ID token', async () => {
    const expired = database('2', 'candidate', 'ABC123', Date.now() - 1000);
    await assertFails(get(ref(expired, 'documents/ABC123')));
    await assertFails(set(ref(expired, 'documents/ABC123'), doc()));
    await assertFails(get(ref(expired, 'alerts/ABC123/2')));
});

test('code revision, identity, size, schema and deletion are validated', async () => {
    const location = ref(database(), 'documents/ABC123');
    await assertSucceeds(set(location, doc()));
    await assertFails(set(location, doc()));
    await assertFails(set(location, { ...doc(2), writerId: '999' }));
    await assertFails(set(location, { ...doc(2), content: 'x'.repeat(200001) }));
    await assertFails(set(location, { ...doc(2), privileged: true }));
    await assertFails(set(location, null));
    await assertSucceeds(set(location, doc(2)));
});

test('legacy code remains readable and can gain metadata without deleting history', async () => {
    await environment.withSecurityRulesDisabled(async context => set(ref(context.database(), 'documents/ABC123'), { content: 'legacy' }));
    await assertSucceeds(get(ref(database(), 'documents/ABC123')));
    await assertSucceeds(set(ref(database(), 'documents/ABC123'), doc()));
});

test('alerts preserve counts, prohibit spoofing/flags/deletion, and support atomic increment', async () => {
    const candidate = database();
    const location = ref(candidate, 'alerts/ABC123/2');
    await assertSucceeds(update(location, { tabSwitches: increment(1), lastAlert: new Date().toISOString() }));
    await assertSucceeds(update(location, { tabSwitches: increment(1), lastAlert: new Date().toISOString() }));
    await assertSucceeds(get(location));
    await assertFails(set(location, { tabSwitches: 1, lastAlert: new Date().toISOString() }));
    await assertFails(update(location, { currentlyAway: true }));
    await assertFails(set(location, null));
    await assertFails(get(ref(candidate, 'alerts/ABC123')));
    await assertFails(get(ref(candidate, 'alerts/ABC123/999')));
    await assertFails(set(ref(candidate, 'alerts/ABC123/999'), { tabSwitches: 1, lastAlert: new Date().toISOString() }));
    await assertSucceeds(get(ref(database('1', 'interviewer'), 'alerts/ABC123')));
    await assertFails(update(ref(database('1', 'interviewer'), 'alerts/ABC123/2'), { tabSwitches: 99 }));
});

test('transaction code writes work with server timestamps and guarded revisions', async () => {
    const location = ref(database(), 'documents/ABC123');
    await assertSucceeds(runTransaction(location, current => current ? undefined : doc(), { applyLocally: false }));
    await assertSucceeds(runTransaction(location, current => ({ ...current, ...doc(2) }), { applyLocally: false }));
});

test('a fresh reader can back up recovered code; delayed writer cannot replace a newer revision', async () => {
    await environment.withSecurityRulesDisabled(async context => set(ref(context.database(), 'documents/ABC123'), {
        content: 'stored', revision: 7, writerId: '2', updatedAt: Date.now(),
    }));
    const location = ref(database(), 'documents/ABC123');
    const recovered = (await get(location)).val();
    const committed = await assertSucceeds(runTransaction(location,
        current => nextBackupValue(current, recovered.revision, 'new local code', '2', serverTimestamp()),
        { applyLocally: false }));
    if (!committed.committed) throw new Error('Recovered snapshot was not backed up');
    const stale = await runTransaction(location,
        current => nextBackupValue(current, 7, 'stale page', '2', serverTimestamp()),
        { applyLocally: false });
    if (stale.committed) throw new Error('Stale writer replaced new code');
});
