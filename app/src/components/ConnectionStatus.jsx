import React from 'react';

export function ConnectionStatus({ realtimeStatus, presence }) {
    const candidate = presence?.candidateConnected;
    const interviewer = presence?.interviewerConnected;
    const dot = (connected) => connected ? 'bg-green-400' : 'bg-gray-600';
    return (
        <div className="flex items-center gap-3 text-xs text-gray-300">
            <span className="text-gray-500">Socket: {realtimeStatus}</span>
            <span><i className={`inline-block w-2 h-2 rounded-full mr-1 ${dot(candidate)}`} />Candidate: {candidate ? 'Connected' : 'Away'}</span>
            <span><i className={`inline-block w-2 h-2 rounded-full mr-1 ${dot(interviewer)}`} />Interviewer: {interviewer ? 'Connected' : 'Away'}</span>
        </div>
    );
}
