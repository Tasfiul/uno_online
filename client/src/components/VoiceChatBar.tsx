import React, { useState, useEffect } from 'react';
import { voiceChat } from '../services/webrtc';
import { Mic, MicOff, PhoneCall, Radio, Volume2 } from 'lucide-react';
import { sounds } from '../services/audio';

interface VoiceChatBarProps {
  roomId: string;
  className?: string;
}

export const VoiceChatBar: React.FC<VoiceChatBarProps> = ({ roomId, className }) => {
  const [isEnabled, setIsEnabled] = useState(() => voiceChat.getIsEnabled());
  const [isMuted, setIsMuted] = useState(() => voiceChat.getIsMuted());
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);

  useEffect(() => {
    // Keep UI state synchronized with the singleton voice chat service
    setIsEnabled(voiceChat.getIsEnabled());
    setIsMuted(voiceChat.getIsMuted());

    voiceChat.setCallbacks(
      speaking => setIsSpeaking(speaking),
      (_peerId, speaking) => setRemoteSpeaking(speaking)
    );
  }, [roomId]);

  const toggleVoiceEnable = async () => {
    sounds.playClick();
    if (!isEnabled) {
      const ok = await voiceChat.enableVoice();
      if (ok) {
        setIsEnabled(true);
        setIsMuted(false);
      }
    } else {
      voiceChat.disableVoice();
      setIsEnabled(false);
      setIsMuted(false);
      setIsSpeaking(false);
      setRemoteSpeaking(false);
    }
  };

  const toggleMute = () => {
    sounds.playClick();
    const muted = voiceChat.toggleMute();
    setIsMuted(muted);
  };

  const containerClasses = className || 'fixed top-4 left-4 z-40 flex items-center gap-2';

  return (
    <div className={containerClasses}>
      {/* Voice Chat Toggle Button */}
      <button
        onClick={toggleVoiceEnable}
        className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-xl transition-all active:scale-95 ${
          isEnabled
            ? 'bg-emerald-600/90 hover:bg-emerald-500 border-emerald-400 text-white shadow-emerald-500/20'
            : 'glass-panel hover:bg-slate-800/90 border-white/10 text-slate-300'
        }`}
      >
        {isEnabled ? (
          <>
            <Radio className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
            <span className="hidden sm:inline">Voice On</span>
          </>
        ) : (
          <>
            <PhoneCall className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Voice</span>
          </>
        )}
      </button>

      {/* Mic Mute / Unmute Button */}
      {isEnabled && (
        <button
          onClick={toggleMute}
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          className={`p-1.5 sm:p-2 rounded-xl border transition-all active:scale-95 ${
            isMuted
              ? 'bg-red-500/80 hover:bg-red-500 border-red-400 text-white'
              : isSpeaking
              ? 'bg-blue-600 border-blue-300 text-white shadow-[0_0_15px_rgba(59,130,246,0.8)]'
              : 'glass-panel hover:bg-slate-800 border-white/10 text-slate-200'
          }`}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Local Speaking Indicator */}
      {isEnabled && !isMuted && isSpeaking && (
        <span className="px-1.5 py-0.5 rounded-full bg-blue-500/30 border border-blue-400/50 text-[9px] text-blue-200 animate-pulse hidden lg:inline">
          Speaking...
        </span>
      )}

      {/* Remote Opponent Speaking Indicator */}
      {isEnabled && remoteSpeaking && !isSpeaking && (
        <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/30 border border-emerald-400/50 text-[9px] text-emerald-200 animate-pulse hidden lg:inline flex items-center gap-1">
          <Volume2 className="w-2.5 h-2.5 text-emerald-300" />
          Opponent speaking...
        </span>
      )}
    </div>
  );
};
