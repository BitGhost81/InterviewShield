import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterviewRecorder } from '../src/media/audioRecorder.js';
import { createReportRefresh } from '../src/realtime/reportRefresh.js';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function media() {
    const sources = [];
    let context;
    let recorder;
    class AudioContext {
        state = 'running';
        constructor() { context = this; }
        createMediaStreamDestination() { return { stream: { getTracks: () => [] } }; }
        createMediaStreamSource(stream) { const source = { stream, disconnected: false, connect() {}, disconnect() { this.disconnected = true; } }; sources.push(source); return source; }
        async close() { this.closed = true; }
    }
    class MediaRecorder {
        static isTypeSupported() { return true; }
        state = 'inactive';
        constructor(stream, options) { this.mimeType = options.mimeType; recorder = this; }
        start() { this.state = 'recording'; }
        stop() {
            this.state = 'inactive';
            setTimeout(() => { this.ondataavailable({ data: new Blob(['final']) }); this.onstop(); }, 5);
        }
    }
    const capture = createInterviewRecorder({ AudioContextClass: AudioContext, MediaRecorderClass: MediaRecorder, onError: assert.fail });
    return { capture, sources, get context() { return context; }, get recorder() { return recorder; } };
}
const stream = () => ({ getAudioTracks: () => [{}] });

test('recording finalization waits for the final data event and is idempotent', async () => {
    const m = media(); m.capture.attach(stream(), stream());
    m.recorder.ondataavailable({ data: new Blob(['first']) });
    const first = m.capture.stop(); const second = m.capture.stop();
    assert.equal(first, second);
    assert.equal(await (await first).text(), 'firstfinal');
    await m.capture.dispose(); assert.equal(m.context.closed, true);
});

test('reconnect replaces remote recording source without losing accumulated chunks', async () => {
    const m = media(); const local = stream(); const remote = stream();
    m.capture.attach(local, remote); const recorder = m.recorder;
    m.capture.attach(local, null); assert.equal(m.sources[1].disconnected, true);
    m.capture.attach(local, stream()); assert.equal(m.recorder, recorder);
    assert.equal(m.sources.length, 3);
    await m.capture.dispose();
});

test('integrity refresh coalesces duplicated WS/Firebase events without counting them', async () => {
    let calls = 0;
    const refresh = createReportRefresh(async () => { calls++; }, assert.fail, 1);
    refresh.trigger(); refresh.trigger(); refresh.trigger(); await wait(25);
    assert.equal(calls, 1); refresh.close(); refresh.trigger(); await wait(10); assert.equal(calls, 1);
});

test('audio arriving after video on the same remote stream joins the recording', async () => {
    const m = media(); const local = stream(); const tracks = [];
    const remote = { getAudioTracks: () => tracks };
    m.capture.attach(local, remote); const recorder = m.recorder;
    assert.equal(m.sources.length, 1);
    tracks.push({}); m.capture.attach(local, remote);
    assert.equal(m.sources.length, 2); assert.equal(m.sources[1].stream, remote);
    assert.equal(m.recorder, recorder);
    await m.capture.dispose();
});

test('persisted activity arriving during a refresh schedules one subsequent request', async () => {
    let release; let calls = 0;
    const refresh = createReportRefresh(async () => { calls++; if (calls === 1) await new Promise(resolve => { release = resolve; }); }, assert.fail, 1);
    refresh.trigger(); await wait(20); refresh.trigger(); refresh.trigger(); release(); await wait(25);
    assert.equal(calls, 2); refresh.close();
});
