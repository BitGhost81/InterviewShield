export function createInterviewRecorder({ AudioContextClass, MediaRecorderClass, onError = () => {} }) {
    let context;
    let destination;
    let recorder;
    let localSource;
    let remoteSource;
    let localStream;
    let remoteStream;
    let chunks = [];
    let completion;
    let resolveCompletion;
    let rejectCompletion;
    let stopPromise;
    let timer;
    let disposed = false;
    const attach = (local, remote) => {
        if (disposed || stopPromise) return;
        try {
            if (!context) {
                context = new AudioContextClass();
                destination = context.createMediaStreamDestination();
            }
            if (context.state === 'suspended') void context.resume().catch(() => onError('Recording audio could not start.'));
            if (local !== localStream || (!localSource && local?.getAudioTracks().length)) {
                localSource?.disconnect(); localSource = null; localStream = local;
                if (local?.getAudioTracks().length) { localSource = context.createMediaStreamSource(local); localSource.connect(destination); }
            }
            if (remote !== remoteStream || (!remoteSource && remote?.getAudioTracks().length)) {
                remoteSource?.disconnect(); remoteSource = null; remoteStream = remote;
                if (remote?.getAudioTracks().length) { remoteSource = context.createMediaStreamSource(remote); remoteSource.connect(destination); }
            }
            if (!recorder) {
                const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
                    .find(type => MediaRecorderClass.isTypeSupported(type));
                if (!mimeType) throw new Error('No supported recording format');
                recorder = new MediaRecorderClass(destination.stream, { mimeType, audioBitsPerSecond: 32000 });
                completion = new Promise((resolve, reject) => { resolveCompletion = resolve; rejectCompletion = reject; });
                // Avoid an unhandled rejection if hardware fails before the user ends the call.
                void completion.catch(() => {});
                recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
                recorder.onstop = () => {
                    clearTimeout(timer);
                    resolveCompletion(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null);
                };
                recorder.onerror = () => { clearTimeout(timer); rejectCompletion(new Error('Recording failed.')); onError('Interview recording failed.'); };
                recorder.start(1000);
            }
        } catch {
            onError('Interview audio recording is unavailable.');
        }
    };
    const stop = () => {
        if (stopPromise) return stopPromise;
        if (!recorder) return Promise.resolve(null);
        stopPromise = completion.finally(() => clearTimeout(timer));
        timer = setTimeout(() => rejectCompletion(new Error('Recording did not finalize; no complete audio was uploaded.')), 10000);
        try { if (recorder.state !== 'inactive') recorder.stop(); }
        catch { clearTimeout(timer); rejectCompletion(new Error('Recording could not finalize.')); }
        return stopPromise;
    };
    const dispose = async () => {
        disposed = true;
        try { await stop(); } catch { /* Already surfaced through recording state. */ }
        localSource?.disconnect(); remoteSource?.disconnect();
        destination?.stream?.getTracks().forEach(track => track.stop());
        if (context) await context.close().catch(() => {});
        chunks = [];
    };
    return { attach, stop, dispose };
}
