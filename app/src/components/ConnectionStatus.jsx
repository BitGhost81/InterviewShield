import React from 'react';

export function ConnectionStatus({ realtimeStatus, presence }) {
    const candidate = Boolean(presence?.candidateConnected);
    const interviewer = Boolean(presence?.interviewerConnected);

    const isSocketConnected = realtimeStatus === 'connected';

    return (
        <div className="inline-flex items-center gap-3 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/70">
            <span className="flex items-center gap-1.5">
                <i className={`w-1.5 h-1.5 rounded-full ${isSocketConnected ? 'bg-mint shadow-[0_0_6px_#4ce5e8]' : 'bg-amber shadow-[0_0_6px_#fdbb5e]'}`} />
                <span className="text-white/50">Relay:</span>
                <span className="font-mono text-white/80">{realtimeStatus}</span>
            </span>

            <span className="text-white/20">|</span>

            <span className="flex items-center gap-1.5">
                <i className={`w-1.5 h-1.5 rounded-full ${candidate ? 'bg-mint shadow-[0_0_6px_#4ce5e8]' : 'bg-white/25'}`} />
                <span>Candidate</span>
            </span>

            <span className="flex items-center gap-1.5">
                <i className={`w-1.5 h-1.5 rounded-full ${interviewer ? 'bg-cyan shadow-[0_0_6px_#1994ff]' : 'bg-white/25'}`} />
                <span>Interviewer</span>
            </span>
        </div>
    );
}

