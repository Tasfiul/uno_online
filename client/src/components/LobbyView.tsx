import React, { useState } from 'react';
import { Room, PublicRoomInfo, Player } from '../types';
import { AuthUser } from '../services/api';
import {
  Users,
  Plus,
  KeyRound,
  Lock,
  Globe,
  Play,
  LogOut,
  RefreshCw,
  Crown,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { sounds } from '../services/audio';

interface LobbyViewProps {
  user: AuthUser;
  publicRooms: PublicRoomInfo[];
  currentRoom: Room | null;
  onRefreshRooms: () => void;
  onCreateRoom: (params: { name: string; isPublic: boolean; password?: string }) => void;
  onJoinPublicRoom: (roomId: string) => void;
  onJoinPrivateRoom: (password: string) => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onLogout: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  user,
  publicRooms,
  currentRoom,
  onRefreshRooms,
  onCreateRoom,
  onJoinPublicRoom,
  onJoinPrivateRoom,
  onStartGame,
  onLeaveRoom,
  onLogout,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [roomPassword, setRoomPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const isHost = currentRoom?.hostId === user.id || currentRoom?.players.find(p => p.userId === user.id)?.isHost;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    sounds.playClick();

    if (!roomName.trim()) {
      setErrorMsg('Please enter a room name');
      return;
    }

    if (!isPublic && !roomPassword.trim()) {
      setErrorMsg('Please enter a password for your private room');
      return;
    }

    onCreateRoom({
      name: roomName.trim(),
      isPublic,
      password: !isPublic ? roomPassword.trim() : undefined,
    });

    setShowCreateModal(false);
    setRoomName('');
    setRoomPassword('');
  };

  const handleJoinPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playClick();

    if (!joinPassword.trim()) return;
    onJoinPrivateRoom(joinPassword.trim());
    setShowPasswordModal(false);
    setJoinPassword('');
  };

  // If user is currently in a room lobby waiting for match to start
  if (currentRoom) {
    const canStart = (currentRoom.players?.length || 0) >= 2;

    return (
      <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 text-white">

        {/* Glow ambient */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="glass-modal max-w-xl w-full p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">

          {/* Room Header */}
          <div className="flex items-start justify-between border-b border-white/10 pb-5 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl sm:text-2xl font-black text-white">{currentRoom.name}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${currentRoom.isPublic
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    }`}
                >
                  {currentRoom.isPublic ? 'Public' : 'Private'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Host: <span className="text-slate-200 font-semibold">{currentRoom.hostName}</span>
              </p>
            </div>

            <button
              onClick={() => {
                sounds.playClick();
                onLeaveRoom();
              }}
              className="px-3 py-1.5 rounded-xl glass-panel hover:bg-red-500/20 hover:border-red-500/40 text-slate-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave</span>
            </button>
          </div>

          {/* Players in Room */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Players in Room ({currentRoom.players?.length || 0} / {currentRoom.maxPlayers})
              </span>
              <span className="text-xs text-slate-400">Min 2 players required</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentRoom.players?.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-slate-800/60 border border-slate-700/80"
                >
                  {player.avatar ? (
                    <img
                      src={player.avatar}
                      alt={player.username}
                      className="w-10 h-10 rounded-xl object-cover border border-slate-600 bg-slate-900 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-blue-600 border border-blue-400 flex items-center justify-center font-bold text-white shrink-0">
                      {player.username.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white truncate">{player.username}</span>
                      {player.isHost && (
                        <span title="Room Host">
                          <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">Ready to play</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Start Action */}
          <div className="pt-2">
            {isHost ? (
              <button
                onClick={() => {
                  sounds.playClick();
                  onStartGame();
                }}
                disabled={!canStart}
                className={`w-full py-4 rounded-2xl font-black text-sm tracking-wide shadow-2xl transition-all transform active:scale-98 flex items-center justify-center gap-2 border ${canStart
                    ? 'bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 hover:from-red-500 hover:to-yellow-400 text-white border-orange-400 shadow-orange-500/25 cursor-pointer'
                    : 'bg-slate-800/80 border-slate-700 text-slate-500 cursor-not-allowed'
                  }`}
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{canStart ? 'START UNO MATCH' : 'WAITING FOR PLAYERS (MIN 2)'}</span>
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/5 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                <span>Waiting for the host ({currentRoom.hostName}) to start the match...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main Room Browser View
  return (
    <div className="relative min-h-screen w-full flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 text-white overflow-y-auto">

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 w-full glass-panel border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 via-yellow-500 to-blue-600 p-0.5 shadow-md">
            <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
              <span className="text-sm font-black italic tracking-tighter text-yellow-400">UNO</span>
            </div>
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white leading-none">
              UNO 3D ONLINE
            </h1>
            <span className="text-[10px] text-slate-400">Multiplayer & Live Voice</span>
          </div>
        </div>

        {/* User Profile Pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-slate-800/80 border border-slate-700">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.username}
                className="w-7 h-7 rounded-lg object-cover border border-yellow-400/80 bg-slate-900"
              />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs sm:text-sm font-bold text-white">{user.username}</span>
          </div>

          <button
            onClick={() => {
              sounds.playClick();
              onLogout();
            }}
            title="Log out"
            className="p-2 rounded-xl glass-panel hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* Banner with Action Buttons */}
        <div className="p-6 sm:p-8 rounded-3xl glass-panel border border-white/10 shadow-2xl relative overflow-hidden mb-8">
          <div className="relative z-10 max-w-xl">
            <h2 className="text-2xl sm:text-4xl font-black italic tracking-tight text-white mb-2">
              PLAY WITH FRIENDS & VOICE CHAT
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mb-6">
              Host a public or private room, look around the 3D table, challenge players, call UNO, and catch opponents with Check!
            </p>

            <div className="flex flex-wrap gap-3">
              {/* Host Game Button */}
              <button
                onClick={() => {
                  sounds.playClick();
                  setShowCreateModal(true);
                }}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 hover:from-red-500 hover:to-yellow-400 text-white font-bold text-xs sm:text-sm shadow-xl shadow-orange-500/25 transition-transform active:scale-95 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Host Game / Room</span>
              </button>

              {/* Requirement: "Join Game with password" */}
              <button
                onClick={() => {
                  sounds.playClick();
                  setShowPasswordModal(true);
                }}
                className="px-5 py-3 rounded-2xl glass-panel hover:bg-slate-800/90 border border-white/20 text-white font-bold text-xs sm:text-sm shadow-xl transition-all active:scale-95 flex items-center gap-2"
              >
                <KeyRound className="w-4 h-4 text-yellow-400" />
                <span>Join Game with password</span>
              </button>
            </div>
          </div>
        </div>

        {/* Public Rooms Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-bold text-white">Public Rooms</h3>
              <span className="text-xs text-slate-400">({publicRooms.length} active)</span>
            </div>

            <button
              onClick={() => {
                sounds.playClick();
                onRefreshRooms();
              }}
              className="p-2 rounded-xl glass-panel hover:bg-slate-800 text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {publicRooms.length === 0 ? (
            <div className="p-8 sm:p-12 rounded-3xl glass-panel border border-white/5 text-center text-slate-400">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-base font-bold text-slate-300">No public rooms available</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Be the first to host a public match or create a private room for your friends!
              </p>
              <button
                onClick={() => {
                  sounds.playClick();
                  setShowCreateModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all shadow"
              >
                Create Room Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {publicRooms.map((room) => (
                <div
                  key={room.id}
                  className="p-5 rounded-2xl glass-panel border border-white/10 shadow-lg flex flex-col justify-between hover:border-blue-500/40 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-base font-bold text-white truncate">{room.name}</h4>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                        Public
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">
                      Host: <span className="text-slate-200 font-medium">{room.hostName}</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {room.playerCount} / {room.maxPlayers} Players
                    </span>

                    <button
                      onClick={() => {
                        sounds.playClick();
                        onJoinPublicRoom(room.id);
                      }}
                      disabled={room.status !== 'waiting' || room.playerCount >= room.maxPlayers}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs transition-all shadow"
                    >
                      {room.status === 'playing' ? 'In Progress' : 'Join Table'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Host Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass-modal max-w-md w-full p-6 sm:p-8 rounded-3xl border border-white/15 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-1">Host a Game Room</h3>
            <p className="text-xs text-slate-400 mb-5">Set up your room name and visibility</p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Room Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Uno Masters Lounge"
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Public or Private Switch */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Room Visibility
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPublic(true)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${isPublic
                        ? 'bg-blue-600 text-white border-blue-400 shadow'
                        : 'glass-panel text-slate-400 border-white/5 hover:text-white'
                      }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Public Room
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPublic(false)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${!isPublic
                        ? 'bg-amber-600 text-white border-amber-400 shadow'
                        : 'glass-panel text-slate-400 border-white/5 hover:text-white'
                      }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Private Room
                  </button>
                </div>
              </div>

              {/* Password for Private Room */}
              {!isPublic && (
                <div className="animate-in fade-in duration-200">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Room Password (Unique)
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Set unique room password"
                      value={roomPassword}
                      onChange={e => setRoomPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Friends will use "Join Game with password" and type this password.
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl glass-panel hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 hover:from-red-500 hover:to-yellow-400 text-white font-bold text-xs shadow-lg transition-transform active:scale-95"
                >
                  Create & Enter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Game with Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass-modal max-w-sm w-full p-6 sm:p-8 rounded-3xl border border-white/15 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-white text-center mb-1">Join Game with Password</h3>
            <p className="text-xs text-slate-400 text-center mb-5">
              Enter the password provided by the room host
            </p>

            <form onSubmit={handleJoinPasswordSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Enter private room password"
                  value={joinPassword}
                  onChange={e => setJoinPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-center text-sm font-semibold tracking-wider focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-2.5 rounded-xl glass-panel hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-xs shadow-lg transition-transform active:scale-95"
                >
                  Join Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
