import React from 'react';

export function VideoCallPanel({
    localVideoRef, remoteVideoRef, mediaStatus, callStatus, microphoneEnabled, cameraEnabled,
    toggleMicrophone, toggleCamera, retryCall,
}) {
    const mediaMessage = mediaStatus === 'denied'
        ? 'Camera or microphone permission was denied. The interview can continue without video.'
        : mediaStatus === 'unsupported' ? 'This browser does not support camera or microphone access.' : null;

    return (
        <section className="glass rounded-2xl p-3.5 border border-white/15 shadow-lg">
            <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-mint shadow-[0_0_8px_#4ce5e8]" />
                    <h3 className="font-display font-semibold text-white/90 text-xs tracking-wider uppercase">Live Video</h3>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-white/60">
                    {callStatus}
                </span>
            </div>

            {mediaMessage && (
                <div className="mb-2.5 p-2 rounded-lg bg-amber/10 border border-amber/20 text-amber text-[11px] leading-relaxed">
                    {mediaMessage}
                </div>
            )}

            {/* Remote Peer Stream */}
            <div className="relative aspect-video rounded-xl bg-black/60 border border-white/10 overflow-hidden shadow-inner flex items-center justify-center">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] text-white/70">
                    Remote Peer
                </div>
            </div>

            {/* Local Stream & Controls */}
            <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2 items-end">
                <div className="relative aspect-video rounded-xl bg-black/60 border border-white/10 overflow-hidden shadow-inner flex items-center justify-center">
                    <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] text-white/70">
                        You
                    </div>
                </div>

                <div className="flex flex-col gap-1.5 min-w-[85px]">
                    <button
                        onClick={toggleMicrophone}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                            microphoneEnabled
                                ? 'bg-white/10 hover:bg-white/15 text-white/80 border border-white/10'
                                : 'bg-amber/20 text-amber border border-amber/30'
                        }`}
                    >
                        {microphoneEnabled ? 'Mute Mic' : 'Unmute Mic'}
                    </button>

                    <button
                        onClick={toggleCamera}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                            cameraEnabled
                                ? 'bg-white/10 hover:bg-white/15 text-white/80 border border-white/10'
                                : 'bg-amber/20 text-amber border border-amber/30'
                        }`}
                    >
                        {cameraEnabled ? 'Camera Off' : 'Camera On'}
                    </button>

                    {callStatus === 'failed' && (
                        <button
                            onClick={retryCall}
                            className="px-2.5 py-1.5 rounded-lg bg-mint/20 text-mint border border-mint/30 hover:bg-mint/30 text-[11px] font-semibold transition-all"
                        >
                            Retry Call
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
}

