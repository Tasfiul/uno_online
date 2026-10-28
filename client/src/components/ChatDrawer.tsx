import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { MessageSquare, Send, BellOff, X, Volume2, VolumeX } from 'lucide-react';
import { sounds } from '../services/audio';

interface ChatDrawerProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  showTriggerButton?: boolean;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  messages,
  onSendMessage,
  isOpen,
  onToggle,
  showTriggerButton = true,
}) => {
  const [inputText, setInputText] = useState('');
  const [isChatMuted, setIsChatMuted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
    sounds.playClick();
  };

  return (
    <>
      {/* Floating Toggle Pill (Rendered only when requested, e.g. in Lobby) */}
      {showTriggerButton && (
        <button
          onClick={() => {
            sounds.playClick();
            onToggle();
          }}
          className="fixed top-4 right-4 z-40 p-2 sm:px-3.5 sm:py-2.5 rounded-2xl glass-panel hover:bg-slate-800/90 border border-white/10 text-white font-medium text-xs sm:text-sm flex items-center gap-2 shadow-2xl transition-all active:scale-95"
        >
          <MessageSquare className="w-4 h-4 text-blue-400" />
          <span className="hidden sm:inline">Live Chat</span>
          {messages.length > 0 && !isOpen && (
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
          )}
        </button>
      )}

      {/* Slide-out Chat Panel */}
      {isOpen && (
        <div className="fixed top-14 sm:top-16 right-2 sm:right-4 z-50 w-72 sm:w-88 md:w-96 h-[460px] max-h-[72vh] rounded-2xl glass-modal border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-6 duration-200">
          
          {/* Header */}
          <div className="px-4 py-3 bg-slate-900/80 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-bold text-white">Live Messages</span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Mute Messages Toggle */}
              <button
                type="button"
                onClick={() => {
                  setIsChatMuted(!isChatMuted);
                  sounds.playClick();
                }}
                title={isChatMuted ? 'Unmute Live Chat' : 'Mute / Disable Live Messages'}
                className={`p-1.5 rounded-lg transition-colors ${
                  isChatMuted ? 'text-red-400 bg-red-500/20' : 'text-slate-400 hover:text-white'
                }`}
              >
                {isChatMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={onToggle}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2.5 text-xs">
            {isChatMuted ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-4">
                <BellOff className="w-8 h-8 text-slate-500 mb-2" />
                <p className="font-semibold text-slate-300">Live Messages Disabled</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  You muted live messages. Click the volume icon above to unmute.
                </p>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
                <p>No messages yet. Say hi to the lobby!</p>
              </div>
            ) : (
              messages.map(msg => {
                if (msg.isSystem) {
                  return (
                    <div
                      key={msg.id}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] text-center"
                    >
                      {msg.text}
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="flex items-start gap-2">
                    {msg.senderAvatar ? (
                      <img
                        src={msg.senderAvatar}
                        alt={msg.senderName}
                        className="w-6 h-6 rounded-lg bg-slate-800 object-cover shrink-0 mt-0.5"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5">
                        {msg.senderName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-slate-300 text-[11px] truncate">
                          {msg.senderName}
                        </span>
                        <span className="text-[9px] text-slate-500">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-100 text-xs bg-slate-800/80 rounded-xl px-2.5 py-1.5 mt-0.5 break-words inline-block max-w-full">
                        {msg.text}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          {!isChatMuted && (
            <form onSubmit={handleSend} className="p-2.5 bg-slate-900/80 border-t border-white/10 flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition-all"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
};
