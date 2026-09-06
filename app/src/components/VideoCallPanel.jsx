import React from 'react';

export function VideoCallPanel({
    localVideoRef, remoteVideoRef, mediaStatus, callStatus, microphoneEnabled, cameraEnabled,
    toggleMicrophone, toggleCamera, retryCall,
}) {
    const mediaMessage = mediaStatus === 'denied'
        ? 'Camera or microphone permission was denied. The interview can continue without video.'
        : mediaStatus === 'unsupported' ? 'This browser does not support camera or microphone access.' : null;
    return (
        <section className="rounded-xl border border-gray-700 bg-gray-900 p-3">
            <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-300 text-sm uppercase tracking-wide">Video call</h3>
                <span className="text-xs text-gray-500">{callStatus}</span>
            </div>
            {mediaMessage && <p className="mb-2 text-xs text-yellow-400">{mediaMessage}</p>}
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full aspect-video rounded-lg bg-black object-cover" />
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 items-end">
                <video ref={localVideoRef} autoPlay muted playsInline className="w-full aspect-video rounded-lg bg-black object-cover" />
                <div className="flex flex-col gap-1">
                    <button onClick={toggleMicrophone} className="px-2 py-1 rounded bg-gray-700 text-xs">{microphoneEnabled ? 'Mute' : 'Unmute'}</button>
                    <button onClick={toggleCamera} className="px-2 py-1 rounded bg-gray-700 text-xs">{cameraEnabled ? 'Camera off' : 'Camera on'}</button>
                    {callStatus === 'failed' && <button onClick={retryCall} className="px-2 py-1 rounded bg-blue-700 text-xs">Retry</button>}
                </div>
            </div>
        </section>
    );
}
