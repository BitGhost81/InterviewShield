import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAlertHistory, mayRecoverCode, createCodeBackup, nextBackupValue } from '../src/firebase/reliability.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('history never replaces WebSocket flags or lowers counts/timestamps', () => {
    const previous = { 2: { tabSwitches: 8, currentlyAway: true, fullscreenExited: true, lastReturn: 'return', lastAlert: '2026-10-15T12:00:00Z' } };
    const result = mergeAlertHistory(previous, { 2: { tabSwitches: 3, currentlyAway: false, lastAlert: '2026-10-15T11:00:00Z' }, 3: { tabSwitches: 4 } });
    assert.deepEqual(result[2], previous[2]);
    assert.equal(result[3].tabSwitches, 4);
    assert.equal(mergeAlertHistory(result, { 2: { tabSwitches: 9 } })[2].tabSwitches, 9);
});
test('initial recovery is rejected after any local editing', () => {
    assert.equal(mayRecoverCode(false, { content: 'recovered' }), true);
    assert.equal(mayRecoverCode(true, { content: 'stale' }), false);
    assert.equal(mayRecoverCode(false, null), false);
});
test('transaction cache misses retry but known newer revisions and closed pages abort', () => {
    assert.equal(nextBackupValue(null, 7, 'local', '2', 1).revision, 8);
    assert.equal(nextBackupValue({ revision: 8 }, 7, 'stale', '2', 1), undefined);
    assert.equal(nextBackupValue({ revision: 7 }, 7, 'local', '2', 1, true), undefined);
});
test('backup coalesces edits and writes regardless of WebSocket delivery', async () => {
    const writes = [];
    const backup = createCodeBackup({ initialRevision: 7, delayMs: 1, write: async (content, revision) => { writes.push([content, revision]); return true; }, onError: assert.fail });
    backup.schedule('a'); backup.schedule('latest');
    await wait(30);
    backup.schedule('next');
    await wait(30);
    backup.close();
    assert.deepEqual(writes, [['latest', 7], ['next', 8]]);
});
test('conflicts stop stale writers and preserve the local document', async () => {
    let calls = 0;
    const errors = [];
    const backup = createCodeBackup({ initialRevision: 0, delayMs: 1, write: async () => { calls++; return false; }, onError: error => errors.push(error) });
    backup.schedule('old page'); await wait(30);
    backup.schedule('do not overwrite new page'); await wait(30);
    backup.close();
    assert.equal(calls, 1); assert.equal(errors.length, 1);
});
test('cleanup cancels pending backup timers', async () => {
    let calls = 0;
    const backup = createCodeBackup({ initialRevision: 0, delayMs: 10, write: async () => { calls++; return true; }, onError: assert.fail });
    backup.schedule('pending'); backup.close();
    await wait(30); assert.equal(calls, 0);
});
