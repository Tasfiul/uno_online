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
        className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl border-2 text-xs font-bold flex items-center gap-1.5 shadow-md transition-all active:translate-y-[2px] active:border-b-2 cursor-pointer select-none ${
          isEnabled
            ? 'bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 border-emerald-300 border-b-[3px] sm:border-b-4 border-b-emerald-800 text-slate-950'
            : 'bg-gradient-to-b from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 border-slate-500 border-b-[3px] sm:border-b-4 border-b-slate-950 text-slate-200'
        }`}
      >
        {isEnabled ? (
          <>
            <Radio className="w-3.5 h-3.5 text-emerald-950 animate-pulse" />
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
          className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl border-2 transition-all active:translate-y-[2px] active:border-b-2 cursor-pointer select-none ${
            isMuted
              ? 'bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 border-red-300 border-b-[3px] sm:border-b-4 border-b-red-950 text-white'
              : isSpeaking
              ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-blue-200 border-b-[3px] sm:border-b-4 border-b-blue-900 text-white shadow-[0_0_15px_rgba(59,130,246,0.8)]'
              : 'bg-gradient-to-b from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 border-slate-500 border-b-[3px] sm:border-b-4 border-b-slate-950 text-slate-200'
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
