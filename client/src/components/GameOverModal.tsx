import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Player } from '../types';
import { Trophy, Home, Sparkles } from 'lucide-react';
import { sounds } from '../services/audio';

interface GameOverModalProps {
  winner: Player | null;
  onLeave: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  onLeave,
}) => {
  useEffect(() => {
    sounds.playWin();

    // Trigger celebratory confetti burst
    const end = Date.now() + 3.5 * 1000;
    const colors = ['#dc2626', '#facc15', '#16a34a', '#2563eb'];

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
      <div className="glass-modal max-w-md w-full p-6 sm:p-8 rounded-3xl border border-yellow-500/30 text-center shadow-2xl relative overflow-hidden">
        
        {/* Glow backdrop */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-yellow-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-tr from-yellow-400 to-amber-600 p-1 shadow-2xl shadow-yellow-500/30 mb-4 animate-bounce">
            <div className="w-full h-full bg-slate-900 rounded-2xl flex items-center justify-center">
              <Trophy className="w-10 h-10 text-yellow-400" />
            </div>
          </div>

          <h2 className="text-3xl font-black italic tracking-tight text-white mb-1 flex items-center justify-center gap-2">
            <span>WINNER!</span>
          </h2>

          <p className="text-xs text-slate-400 mb-6">Game finished! Champion crowned.</p>

          {/* Winner Profile Card */}
          <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 mb-6 flex items-center justify-center gap-3">
            {winner?.avatar ? (
              <img
                src={winner.avatar}
                alt={winner.username}
                className="w-14 h-14 rounded-2xl object-cover border-2 border-yellow-400 shadow"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 border-2 border-yellow-400 flex items-center justify-center text-xl font-black text-white">
                {winner?.username.charAt(0).toUpperCase() || 'P'}
              </div>
            )}
            <div className="text-left">
              <span className="text-lg font-bold text-white block">{winner?.username || 'Player'}</span>
              <span className="text-xs text-yellow-400 font-semibold">UNO Champion 👑</span>
            </div>
          </div>

          {/* Action: Return to Lobby */}
          <div>
            <button
              onClick={() => {
                sounds.playClick();
                onLeave();
              }}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 hover:from-red-500 hover:to-yellow-400 text-white font-extrabold text-sm shadow-xl shadow-orange-500/25 transition-transform active:scale-95 flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              <span>Back to Lobby</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
