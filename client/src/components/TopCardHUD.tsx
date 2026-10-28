import React from 'react';
import { UnoCard, CardColor } from '../types';
import { Eye, EyeOff, Sparkles, RefreshCw, SkipForward, LogOut, MessageSquare } from 'lucide-react';
import { sounds } from '../services/audio';
import { VoiceChatBar } from './VoiceChatBar';

interface TopCardHUDProps {
  roomId: string;
  topCard: UnoCard | null;
  currentColor: CardColor;
  isMyTurn: boolean;
  currentTurnPlayerName: string;
  onDrawCard: () => void;
  onPassTurn?: () => void;
  onCallUno: () => void;
  onCallCheck: () => void;
  handVisible: boolean;
  onToggleHand: () => void;
  direction: 1 | -1;
  lastActionMessage?: string;
  hasDrawnThisTurn?: boolean;
  onQuitGame?: () => void;
  isChatOpen: boolean;
  onToggleChat: () => void;
  chatMessageCount: number;
}

const COLOR_MAP: Record<CardColor, { bg: string; text: string; ring: string; label: string; ovalText: string }> = {
  red: { bg: 'bg-[#e51d24]', text: 'text-red-400', ring: 'ring-red-500', label: 'RED', ovalText: 'text-[#e51d24]' },
  yellow: { bg: 'bg-[#fbb034]', text: 'text-yellow-300', ring: 'ring-yellow-400', label: 'YELLOW', ovalText: 'text-[#d97706]' },
  green: { bg: 'bg-[#00a859]', text: 'text-emerald-400', ring: 'ring-emerald-500', label: 'GREEN', ovalText: 'text-[#00a859]' },
  blue: { bg: 'bg-[#0072ce]', text: 'text-blue-400', ring: 'ring-blue-500', label: 'BLUE', ovalText: 'text-[#0072ce]' },
  wild: { bg: 'bg-[#18181b]', text: 'text-purple-300', ring: 'ring-purple-400', label: 'WILD', ovalText: 'text-white' },
};

export const TopCardHUD: React.FC<TopCardHUDProps> = ({
  roomId,
  topCard,
  currentColor,
  isMyTurn,
  currentTurnPlayerName,
  onDrawCard,
  onPassTurn,
  onCallUno,
  onCallCheck,
  handVisible,
  onToggleHand,
  direction,
  lastActionMessage,
  hasDrawnThisTurn,
  onQuitGame,
  isChatOpen,
  onToggleChat,
  chatMessageCount,
}) => {
  const [showQuitModal, setShowQuitModal] = React.useState(false);

  if (!topCard) return null;

  const activeColorInfo = COLOR_MAP[currentColor] || COLOR_MAP.red;
  const cardColorInfo = COLOR_MAP[topCard.color] || COLOR_MAP.red;

  const renderCardContent = (card: UnoCard) => {
    if (card.type === 'number') {
      return (
        <span className={`text-base sm:text-2xl font-black italic tracking-tighter ${cardColorInfo.ovalText}`}>
          {card.value}
        </span>
      );
    }
    if (card.type === 'skip') {
      return <span className={`text-sm sm:text-xl font-black ${cardColorInfo.ovalText}`}>⊘</span>;
    }
    if (card.type === 'reverse') {
      return <span className={`text-sm sm:text-xl font-black ${cardColorInfo.ovalText}`}>⇄</span>;
    }
    if (card.type === 'draw2') {
      return <span className={`text-sm sm:text-xl font-black ${cardColorInfo.ovalText}`}>+2</span>;
    }
    if (card.type === 'wild') {
      return (
        <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full border border-white grid grid-cols-2 overflow-hidden shadow">
          <div className="bg-[#e51d24]" />
          <div className="bg-[#0072ce]" />
          <div className="bg-[#fbb034]" />
          <div className="bg-[#00a859]" />
        </div>
      );
    }
    if (card.type === 'wild4') {
      return (
        <div className="flex flex-col items-center">
          <div className="w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full border border-white grid grid-cols-2 overflow-hidden shadow mb-0.5">
            <div className="bg-[#e51d24]" />
            <div className="bg-[#0072ce]" />
            <div className="bg-[#fbb034]" />
            <div className="bg-[#00a859]" />
          </div>
          <span className="text-[8px] sm:text-[9px] font-black text-black leading-none">+4</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-30 p-1 sm:p-3 flex flex-col justify-between">
      {/* Top Header Section: Clean 2-tier responsive navigation (zero collisions) */}
      <header className="flex flex-col gap-1 sm:gap-1.5 w-full">
        {/* Tier 1: Action & Stats Navigation Bar */}
        <div className="flex items-center justify-between gap-1 sm:gap-2 w-full flex-nowrap">
          {/* Left: Top Card Physical Preview & Voice Chat */}
          <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Top Card Widget */}
            <div className="flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-lg sm:rounded-2xl glass-panel shadow-lg border border-white/10">
              <div
                className={`w-7 h-10 sm:w-11 sm:h-16 rounded sm:rounded-lg flex items-center justify-center border sm:border-2 border-white shadow-md relative overflow-hidden shrink-0 ${
                  cardColorInfo.bg
                }`}
              >
                {/* Solid White Center Oval */}
                <div className="w-[84%] h-[80%] rounded-[6px] sm:rounded-[10px] bg-white flex items-center justify-center shadow-inner transform -rotate-12 border border-slate-200">
                  {renderCardContent(topCard)}
                </div>

                {/* Corner Symbols */}
                <span className="absolute top-0.5 left-0.5 sm:left-1 text-[6px] sm:text-[8px] font-black text-white drop-shadow leading-none">
                  {topCard.type === 'number' ? topCard.value : topCard.type === 'draw2' ? '+2' : topCard.type === 'wild4' ? '+4' : ''}
                </span>
                <span className="absolute bottom-0.5 right-0.5 sm:right-1 text-[6px] sm:text-[8px] font-black text-white drop-shadow leading-none transform rotate-180">
                  {topCard.type === 'number' ? topCard.value : topCard.type === 'draw2' ? '+2' : topCard.type === 'wild4' ? '+4' : ''}
                </span>
              </div>

              {/* Active Color & Direction */}
              <div className="flex flex-col justify-center pr-0.5 sm:pr-1">
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${activeColorInfo.bg} shadow ring-1 ring-white/60 shrink-0`} />
                  <span className={`text-[9px] sm:text-xs font-black tracking-wide ${activeColorInfo.text}`}>
                    {activeColorInfo.label}
                  </span>
                </div>
                <span className="text-[8px] sm:text-[10px] text-slate-300 font-semibold mt-0.5">
                  {direction === 1 ? '↻ CW' : '↺ CCW'}
                </span>
              </div>
            </div>

            {/* Voice Chat Button */}
            <VoiceChatBar roomId={roomId} className="flex items-center" />
          </div>

          {/* Right: Action Controls (CHECK, CALL UNO, CHAT, QUIT) */}
          <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 justify-end shrink-0">
            {/* CALL CHECK Button (Shield icon completely removed as requested!) */}
            <button
              onClick={() => {
                sounds.playCheck();
                onCallCheck();
              }}
              title="Call Check if someone with 1 card forgot to call UNO"
              className="px-2 py-1 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl glass-panel hover:bg-slate-800 border border-white/10 hover:border-white/25 text-slate-200 hover:text-white font-black text-[10px] sm:text-xs shadow-md transition-all active:scale-95 tracking-wide whitespace-nowrap"
            >
              <span>CHECK</span>
            </button>

            {/* CALL UNO Button */}
            <button
              onClick={() => {
                sounds.playUno();
                onCallUno();
              }}
              title="Call UNO when you have 1 card left"
              className="px-2 py-1 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 hover:border-amber-400 text-amber-300 hover:text-amber-200 font-black text-[10px] sm:text-xs shadow-md transition-all active:scale-95 tracking-wide whitespace-nowrap"
            >
              <span>CALL UNO</span>
            </button>

            {/* LIVE CHAT Button */}
            <button
              onClick={() => {
                sounds.playClick();
                onToggleChat();
              }}
              title="Toggle Live Chat"
              className="p-1 sm:px-2.5 sm:py-2 rounded-lg sm:rounded-xl glass-panel hover:bg-slate-800 border border-white/10 hover:border-white/25 text-slate-300 hover:text-white font-bold text-xs shadow-md flex items-center gap-1 transition-all active:scale-95"
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline text-xs">Chat</span>
              {chatMessageCount > 0 && !isChatOpen && (
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-500 animate-ping" />
              )}
            </button>

            {/* QUIT MATCH Button */}
            <button
              onClick={() => {
                sounds.playClick();
                setShowQuitModal(true);
              }}
              title="Quit Match and return to Lobby"
              className="p-1 sm:px-2.5 sm:py-2 rounded-lg sm:rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 hover:text-red-200 font-bold text-xs shadow-md flex items-center gap-1 transition-all active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="hidden sm:inline text-xs">Quit</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Centered Turn Alert Banner & Action Message */}
        <div className="pointer-events-auto flex flex-col items-center justify-center w-full">
          <div
            className={`px-3.5 py-1.5 sm:px-5 sm:py-2 rounded-full border-2 shadow-xl transition-all flex items-center gap-2 ${
              isMyTurn
                ? 'bg-amber-400 border-amber-300 text-black font-black'
                : 'bg-slate-900 border-slate-700 text-white font-bold text-xs sm:text-sm'
            }`}
          >
            {isMyTurn ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-black" />
                <span className="text-xs sm:text-sm tracking-wide font-black">IT'S YOUR TURN!</span>
              </>
            ) : (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                <span className="text-xs sm:text-sm text-slate-200">
                  <span className="text-white font-black">{currentTurnPlayerName}</span>'s turn
                </span>
              </>
            )}
          </div>

          {lastActionMessage && (
            <div className="mt-2.5 max-w-[92vw] sm:max-w-lg px-4 py-2 sm:px-6 sm:py-2.5 rounded-2xl bg-black border-2 border-amber-400 text-amber-300 text-xs sm:text-sm font-black text-center shadow-2xl flex items-center justify-center gap-2.5 tracking-wide">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-white font-black">{lastActionMessage}</span>
            </div>
          )}
        </div>
      </header>

      {/* In-Game Custom Modal: Quit Confirmation */}
      {showQuitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 pointer-events-auto">
          <div className="glass-modal max-w-sm w-full p-6 sm:p-7 rounded-3xl border border-red-500/30 text-center shadow-2xl relative overflow-hidden">
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 mx-auto mb-4">
              <LogOut className="w-7 h-7" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">Quit Match?</h3>
            <p className="text-xs sm:text-sm text-slate-300 mb-6">
              Are you sure you want to quit the match? You will forfeit your seat and return to the lobby.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  setShowQuitModal(false);
                }}
                className="flex-1 py-3 rounded-2xl glass-panel hover:bg-slate-800 text-slate-300 text-xs sm:text-sm font-semibold transition-all active:scale-95 border border-white/10"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  setShowQuitModal(false);
                  onQuitGame?.();
                }}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold text-xs sm:text-sm shadow-lg shadow-red-600/30 transition-transform active:scale-95 border border-red-400"
              >
                Yes, Quit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Center Controls (Positioned cleanly above the cards) */}
      <div
        className={`pointer-events-auto flex items-center justify-center gap-2 sm:gap-3 transition-all duration-300 ${
          handVisible ? 'mb-32 sm:mb-40 md:mb-48' : 'mb-3 sm:mb-4'
        }`}
      >
        {/* TAKE CARD OR PASS BUTTON */}
        {hasDrawnThisTurn && isMyTurn ? (
          <button
            onClick={() => {
              sounds.playClick();
              onPassTurn?.();
            }}
            className="px-3.5 py-2 sm:px-6 sm:py-2.5 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 shadow-2xl transition-all transform active:scale-95 border bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 hover:from-amber-500 hover:to-orange-500 text-white border-amber-400 shadow-orange-500/40 scale-105 whitespace-nowrap"
          >
            <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            <span>PASS TURN</span>
          </button>
        ) : (
          <button
            onClick={() => {
              sounds.playDraw();
              onDrawCard();
            }}
            disabled={!isMyTurn}
            className={`px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 shadow-2xl transition-all transform active:scale-95 border whitespace-nowrap ${
              isMyTurn
                ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white border-blue-400 shadow-blue-500/30 scale-105'
                : 'bg-slate-800/80 border-slate-700 text-slate-500 cursor-not-allowed opacity-60'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isMyTurn ? 'animate-spin-slow text-yellow-300' : ''}`} />
            <span>TAKE A CARD</span>
          </button>
        )}

        {/* SHOW / HIDE HAND BUTTON */}
        <button
          onClick={() => {
            sounds.playClick();
            onToggleHand();
          }}
          className="px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl sm:rounded-2xl glass-panel hover:bg-slate-800/90 border border-white/15 text-white font-medium text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 shadow-xl transition-all active:scale-95 whitespace-nowrap"
        >
          {handVisible ? (
            <>
              <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
              <span>Hide Hand</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
              <span className="sm:hidden">Show Cards</span>
              <span className="hidden sm:inline">Show My Cards</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
