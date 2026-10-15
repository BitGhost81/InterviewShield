// Refresh only in response to persisted activity/history/presence events. Coalesce
// bursts and serialize requests so older responses cannot replace newer reports.
export function createReportRefresh(fetchReport, onError, delay = 100) {
    let timer;
    let running = false;
    let dirty = false;
    let closed = false;
    const run = async () => {
        timer = null;
        if (closed || running) return;
        dirty = false; running = true;
        try { await fetchReport(); } catch { if (!closed) onError?.(); }
        finally { running = false; if (dirty && !closed) timer = setTimeout(run, delay); }
    };
    return {
        trigger() { if (closed) return; dirty = true; if (!running && !timer) timer = setTimeout(run, delay); },
        close() { closed = true; clearTimeout(timer); },
    };
}
