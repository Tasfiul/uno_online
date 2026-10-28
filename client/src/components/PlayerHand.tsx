import React, { useState } from 'react';
import { UnoCard, CardColor } from '../types';
import { sounds } from '../services/audio';

interface PlayerHandProps {
  cards: UnoCard[];
  isMyTurn: boolean;
  currentColor: CardColor;
  topCard: UnoCard | null;
  onPlayCard: (cardId: string, chosenColor?: CardColor) => void;
  visible: boolean;
}

interface ColorConfig {
  bg: string;
  border: string;
  glow: string;
  ovalText: string;
}

const COLOR_CLASSES: Record<CardColor, ColorConfig> = {
  red: {
    bg: 'bg-[#e51d24]',
    border: 'border-white',
    glow: 'shadow-[0_0_24px_rgba(229,29,36,0.8)]',
    ovalText: 'text-[#e51d24]',
  },
  yellow: {
    bg: 'bg-[#fbb034]',
    border: 'border-white',
    glow: 'shadow-[0_0_24px_rgba(251,176,52,0.8)]',
    ovalText: 'text-[#d97706]',
  },
  green: {
    bg: 'bg-[#00a859]',
    border: 'border-white',
    glow: 'shadow-[0_0_24px_rgba(0,168,89,0.8)]',
    ovalText: 'text-[#00a859]',
  },
  blue: {
    bg: 'bg-[#0072ce]',
    border: 'border-white',
    glow: 'shadow-[0_0_24px_rgba(0,114,206,0.8)]',
    ovalText: 'text-[#0072ce]',
  },
  wild: {
    bg: 'bg-[#18181b]',
    border: 'border-white',
    glow: 'shadow-[0_0_24px_rgba(255,255,255,0.7)]',
    ovalText: 'text-white',
  },
};

export const PlayerHand: React.FC<PlayerHandProps> = ({
  cards,
  isMyTurn,
  currentColor,
  topCard,
  onPlayCard,
  visible,
}) => {
  const [selectedWildCardId, setSelectedWildCardId] = useState<string | null>(null);

  if (!visible) {
    return null;
  }

  const isCardPlayable = (card: UnoCard): boolean => {
    if (!isMyTurn || !topCard) return false;

    // Rule: Match cannot be finished with a Power card (Skip, Reverse, Draw 2) or Wild card (Wild, Wild 4)
    if (cards.length === 1 && card.type !== 'number') {
      return false;
    }

    if (card.color === 'wild') return true;
    if (card.color === currentColor) return true;
    if (card.type === topCard.type && card.type !== 'number') return true;
    if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) return true;
    return false;
  };

  const handleCardClick = (card: UnoCard) => {
    if (!isMyTurn) return;

    if (cards.length === 1 && card.type !== 'number') {
      sounds.playClick();
      return;
    }

    if (!isCardPlayable(card)) {
      sounds.playClick();
      return;
    }

    if (card.color === 'wild') {
      setSelectedWildCardId(card.id);
      sounds.playClick();
      return;
    }

    sounds.playCard();
    onPlayCard(card.id);
  };

  const handleChooseColor = (color: CardColor) => {
    if (selectedWildCardId) {
      sounds.playCard();
      onPlayCard(selectedWildCardId, color);
      setSelectedWildCardId(null);
    }
  };

  const renderCardSymbol = (card: UnoCard, colorInfo: ColorConfig) => {
    if (card.type === 'number') {
      return (
        <span className={`text-2xl sm:text-3xl font-black italic tracking-tighter ${colorInfo.ovalText} select-none`}>
          {card.value}
        </span>
      );
    }
    if (card.type === 'skip') {
      return <span className={`text-xl sm:text-2xl font-black ${colorInfo.ovalText} select-none`}>⊘</span>;
    }
    if (card.type === 'reverse') {
      return <span className={`text-xl sm:text-2xl font-black ${colorInfo.ovalText} select-none`}>⇄</span>;
    }
    if (card.type === 'draw2') {
      return <span className={`text-xl sm:text-2xl font-black ${colorInfo.ovalText} select-none`}>+2</span>;
    }
    if (card.type === 'wild') {
      return (
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white grid grid-cols-2 overflow-hidden shadow">
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
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border border-white grid grid-cols-2 overflow-hidden shadow mb-0.5">
            <div className="bg-[#e51d24]" />
            <div className="bg-[#0072ce]" />
            <div className="bg-[#fbb034]" />
            <div className="bg-[#00a859]" />
          </div>
          <span className="text-xs sm:text-sm font-black text-black leading-none">+4</span>
        </div>
      );
    }
    return null;
  };

  const getCornerSymbol = (card: UnoCard) => {
    if (card.type === 'number') return card.value;
    if (card.type === 'draw2') return '+2';
    if (card.type === 'wild4') return '+4';
    if (card.type === 'skip') return '⊘';
    if (card.type === 'reverse') return '⇄';
    return 'W';
  };

  return (
    <>
      {/* Wild Color Selection Modal */}
      {selectedWildCardId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass-modal p-6 rounded-3xl max-w-sm w-full text-center border border-white/20 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Choose Active Color</h3>
            <p className="text-xs text-slate-300 mb-6">Select which color players must follow next</p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => handleChooseColor('red')}
                className="py-5 rounded-2xl bg-[#e51d24] hover:brightness-110 text-white font-extrabold text-sm shadow-lg shadow-red-600/40 transition-transform active:scale-95 border-2 border-white"
              >
                RED
              </button>
              <button
                onClick={() => handleChooseColor('yellow')}
                className="py-5 rounded-2xl bg-[#fbb034] hover:brightness-110 text-black font-extrabold text-sm shadow-lg shadow-amber-400/40 transition-transform active:scale-95 border-2 border-white"
              >
                YELLOW
              </button>
              <button
                onClick={() => handleChooseColor('green')}
                className="py-5 rounded-2xl bg-[#00a859] hover:brightness-110 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/40 transition-transform active:scale-95 border-2 border-white"
              >
                GREEN
              </button>
              <button
                onClick={() => handleChooseColor('blue')}
                className="py-5 rounded-2xl bg-[#0072ce] hover:brightness-110 text-white font-extrabold text-sm shadow-lg shadow-blue-600/40 transition-transform active:scale-95 border-2 border-white"
              >
                BLUE
              </button>
            </div>

            <button
              onClick={() => setSelectedWildCardId(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Hand Container: Bottom Overlay */}
      <div className="fixed inset-x-0 bottom-0 z-20 pointer-events-none pb-1 sm:pb-2 flex justify-center">
        {/*
          Scrollable Card Track:
          - Uses 'justify-content: safe center' so few cards (<= 5) center automatically,
            while large hands align to scrollLeft = 0 with safe left/right padding.
          - Leftmost card (index 0) will NEVER be cut off or clipped.
          - 'overflow-y-visible' with top padding ensures cards have room to elevate on hover.
        */}
        <div
          className="pointer-events-auto w-full max-w-full overflow-x-auto overflow-y-visible pt-8 pb-2 px-3 sm:px-8 flex items-end no-scrollbar"
          style={{
            display: 'flex',
            justifyContent: 'safe center',
            scrollBehavior: 'smooth',
          }}
        >
          <div
            className="flex items-end -space-x-3.5 sm:-space-x-5 md:-space-x-7 hover:-space-x-1.5 sm:hover:-space-x-2 transition-all duration-300 py-2 shrink-0"
            style={{
              minWidth: 'max-content',
              paddingLeft: '1.25rem',
              paddingRight: '2rem',
            }}
          >
            {cards.map((card, idx) => {
              const playable = isCardPlayable(card);
              const colorInfo = COLOR_CLASSES[card.color] || COLOR_CLASSES.red;
              const cornerLabel = getCornerSymbol(card);

              return (
                <div
                  key={card.id || idx}
                  onClick={() => handleCardClick(card)}
                  style={{
                    transformOrigin: 'bottom center',
                    zIndex: idx,
                  }}
                  className={`relative shrink-0 w-15 h-23 sm:w-19 sm:h-30 md:w-23 md:h-35 rounded-xl border-[2px] sm:border-[2.5px] cursor-pointer transition-all duration-200 select-none overflow-hidden opacity-100 ${
                    colorInfo.bg
                  } shadow-[0_8px_20px_rgba(0,0,0,0.65)] ${
                    playable
                      ? `${colorInfo.border} ${colorInfo.glow} -translate-y-4 sm:-translate-y-5 hover:-translate-y-8 sm:hover:-translate-y-9 hover:scale-110 hover:z-50 ring-2 ring-white/90`
                      : 'border-slate-800 brightness-[0.7] saturate-[0.85] translate-y-0 hover:-translate-y-1 cursor-not-allowed'
                  }`}
                >
                  {/* Solid Opaque Card Interior */}
                  <div className="w-full h-full p-1 sm:p-1.5 flex flex-col justify-between relative bg-inherit">
                    {/* Top Left Corner Symbol (Solid White with outline) */}
                    <span className="text-[10px] sm:text-xs font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] leading-none">
                      {cornerLabel}
                    </span>

                    {/* Classic Center Solid White Oval */}
                    <div className="absolute inset-x-1.5 inset-y-3 sm:inset-x-2 sm:inset-y-4 rounded-[14px] sm:rounded-[18px] bg-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.25)] flex items-center justify-center transform -rotate-12 overflow-hidden border border-slate-200">
                      {renderCardSymbol(card, colorInfo)}
                    </div>

                    {/* Bottom Right Corner Symbol (Inverted) */}
                    <span className="text-[10px] sm:text-xs font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] leading-none self-end transform rotate-180">
                      {cornerLabel}
                    </span>
                  </div>

                  {/* Playable Border Pulse Effect */}
                  {playable && (
                    <div className="absolute inset-0 rounded-xl border-2 border-white/60 pointer-events-none" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};
