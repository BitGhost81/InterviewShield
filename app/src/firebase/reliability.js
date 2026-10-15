export function mergeAlertHistory(previous, incoming) {
    const next = { ...previous };
    for (const [id, history] of Object.entries(incoming || {})) {
        const old = previous[id] || {};
        next[id] = {
            ...old,
            tabSwitches: Math.max(Number(old.tabSwitches) || 0, Number(history.tabSwitches) || 0),
            lastAlert: newerTimestamp(old.lastAlert, history.lastAlert),
        };
    }
    return next;
}

export function newerTimestamp(left, right) {
    return !left || Date.parse(right) > Date.parse(left) ? right : left;
}

// Recover once, and only if the candidate has not typed while the request was pending.
export function mayRecoverCode(editedSinceMount, value) {
    return !editedSinceMount && typeof value?.content === 'string';
}

export function nextBackupValue(current, revision, content, writerId, updatedAt, closed = false) {
    // RTDB transactions may first see null cache despite a preceding get(). Return
    // a provisional value so the server can supply its current state and retry.
    // Rules independently require revision == stored revision + 1.
    if (closed || (current != null && (Number(current.revision) || 0) !== revision)) return;
    return { content, revision: revision + 1, writerId, updatedAt };
}

// Serialized writes use compare-and-swap: a delayed/old page cannot rebase stale code
// on top of a newer writer. Keep editing locally/over WS if a conflict occurs.
export function createCodeBackup({ initialRevision, write, onError, delayMs = 300 }) {
    let revision = initialRevision;
    let pending = null;
    let timer;
    let writing = false;
    let closed = false;
    let conflicted = false;
    const flush = async () => {
        timer = null;
        if (closed || writing || conflicted || pending === null) return;
        const content = pending;
        pending = null;
        writing = true;
        try {
            const committed = await write(content, revision, () => closed);
            if (!committed) {
                conflicted = true;
                onError('Firebase code backup changed in another page. Your current editor is preserved; rejoin from one candidate tab.');
            } else {
                revision += 1;
            }
        } catch {
            pending ??= content;
            if (!closed) onError('Firebase code backup could not be saved; retrying.');
        } finally {
            writing = false;
            if (!closed && !conflicted && pending !== null) timer = setTimeout(flush, 1000);
        }
    };
    return {
        schedule(content) {
            if (closed || conflicted) return;
            pending = content;
            if (!timer && !writing) timer = setTimeout(flush, delayMs);
        },
        close() { closed = true; clearTimeout(timer); pending = null; },
    };
}
