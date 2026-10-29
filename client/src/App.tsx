import React, { useState, useEffect, useRef } from 'react';
import { api, AuthUser } from './services/api';
import { socket, connectSocket, disconnectSocket } from './services/socket';
import { Room, PublicRoomInfo, GameState, ChatMessage, CardColor } from './types';
import { AuthModal } from './components/AuthModal';
import { LobbyView } from './components/LobbyView';
import { UnoScene3D } from './components/UnoScene3D';
import { TopCardHUD } from './components/TopCardHUD';
import { PlayerHand } from './components/PlayerHand';
import { ChatDrawer } from './components/ChatDrawer';
import { GameOverModal } from './components/GameOverModal';
import { sounds } from './services/audio';

function clearAllChatCache() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('uno_chat_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.error('Failed to clear chat cache:', e);
  }
}

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [socketId, setSocketId] = useState<string>(socket.id || '');
  const [publicRooms, setPublicRooms] = useState<PublicRoomInfo[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [handVisible, setHandVisible] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isChatOpenRef = useRef(isChatOpen);
  isChatOpenRef.current = isChatOpen;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  // Persist chat messages to localStorage per room only during an active room session
  useEffect(() => {
    const roomId = currentRoom?.id;
    if (!roomId || gameState?.status === 'ended') {
      clearAllChatCache();
      return;
    }

    if (chatMessages.length > 0) {
      try {
        localStorage.setItem(`uno_chat_${roomId}`, JSON.stringify(chatMessages.slice(-100)));
      } catch (e) {
        console.error('Failed to persist chat messages:', e);
      }
    } else {
      try {
        localStorage.removeItem(`uno_chat_${roomId}`);
      } catch (e) {
        // ignore
      }
    }
  }, [chatMessages, currentRoom?.id, gameState?.status]);

  // Clear unread badge when chat is opened
  useEffect(() => {
    if (isChatOpen) {
      setUnreadChatCount(0);
    }
  }, [isChatOpen]);

  // Check saved login session on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const user = await api.getMe();
        if (user) {
          setCurrentUser(user);
        }
      } catch (e) {
        console.error('Session check failed:', e);
      } finally {
        setAuthChecking(false);
      }
    }
    checkAuth();
  }, []);

  // Connect socket and handle room persistence when user is logged in
  useEffect(() => {
    if (!currentUser) return;

    connectSocket();

    const onConnect = () => {
      setSocketId(socket.id || '');
      socket.emit('rooms:list');
      const savedRoomId = localStorage.getItem('uno_active_room_id');
      if (savedRoomId) {
        socket.emit('room:reconnect', { roomId: savedRoomId, user: currentUser });
      }
    };

    socket.on('connect', onConnect);
    if (socket.connected) {
      setSocketId(socket.id || '');
      onConnect();
    }

    socket.on('rooms:list_response', (rooms: PublicRoomInfo[]) => {
      setPublicRooms(rooms);
    });

    socket.on('room:created', ({ roomId }: { roomId: string }) => {
      clearAllChatCache();
      setChatMessages([]);
      setUnreadChatCount(0);
      localStorage.setItem('uno_active_room_id', roomId);
    });

    socket.on('room:joined', ({ roomId }: { roomId: string }) => {
      clearAllChatCache();
      setChatMessages([]);
      setUnreadChatCount(0);
      localStorage.setItem('uno_active_room_id', roomId);
    });

    socket.on('room:reconnected', ({ roomId, room, messages }: { roomId: string; room: Room; messages?: ChatMessage[] }) => {
      localStorage.setItem('uno_active_room_id', roomId);
      setCurrentRoom(room);
      const serverMsgs = messages || room.messages || [];
      setChatMessages(serverMsgs);
    });

    socket.on('chat:history', ({ messages }: { messages: ChatMessage[] }) => {
      setChatMessages(Array.isArray(messages) ? messages : []);
    });

    socket.on('chat:clear', () => {
      setChatMessages([]);
      setUnreadChatCount(0);
      clearAllChatCache();
    });

    socket.on('room:reconnect_failed', () => {
      clearAllChatCache();
      localStorage.removeItem('uno_active_room_id');
      setCurrentRoom(null);
      setGameState(null);
      setChatMessages([]);
      setUnreadChatCount(0);
    });

    socket.on('room:updated', (room: Room) => {
      setCurrentRoom(room);
    });

    socket.on('room:left', () => {
      clearAllChatCache();
      localStorage.removeItem('uno_active_room_id');
      setCurrentRoom(null);
      setGameState(null);
      setChatMessages([]);
      setUnreadChatCount(0);
    });

    socket.on('room:error', ({ message }: { message: string }) => {
      showToast(message);
    });

    socket.on('game:state_update', (state: GameState) => {
      setGameState(state);

      if (state.status === 'ended') {
        if (state.winner) {
          sounds.playWin();
        }
        // Match ended: clean entire chat slate and purge leftover cache
        setChatMessages([]);
        setUnreadChatCount(0);
        clearAllChatCache();
      } else if (state.currentTurnPlayerId === socket.id) {
        sounds.playTurnNotification();
      }
    });

    socket.on('game:uno_called', ({ username }: { username: string }) => {
      sounds.playUno();
      showToast(`📢 ${username} CALLED UNO!`);
    });

    socket.on('game:check_called', (res: any) => {
      sounds.playCheck();
      showToast(res.message);
    });

    socket.on('game:error', ({ message }: { message: string }) => {
      showToast(`⚠️ ${message}`);
    });

    socket.on('game:game_over', ({ winner }: { winner?: any } = {}) => {
      setGameState(prev => {
        if (!prev) return null;
        return {
          ...prev,
          status: 'ended',
          winner: winner || prev.winner,
          lastActionMessage: winner ? `👑 All opponents left. ${winner.username} wins!` : prev.lastActionMessage,
        };
      });
      sounds.playWin();
      // Match ended: clean entire chat slate and purge leftover cache
      setChatMessages([]);
      setUnreadChatCount(0);
      clearAllChatCache();
    });

    socket.on('chat:message', (msg: ChatMessage) => {
      setChatMessages(prev => [...prev, msg]);
      // Only increment unread counter if chat is closed and sender is not current user
      if (!isChatOpenRef.current && msg.senderId !== currentUserRef.current?.id) {
        setUnreadChatCount(prev => prev + 1);
      }
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('rooms:list_response');
      socket.off('room:created');
      socket.off('room:joined');
      socket.off('room:reconnected');
      socket.off('room:reconnect_failed');
      socket.off('room:updated');
      socket.off('room:left');
      socket.off('room:error');
      socket.off('game:state_update');
      socket.off('game:uno_called');
      socket.off('game:check_called');
      socket.off('game:error');
      socket.off('game:game_over');
      socket.off('chat:message');
      socket.off('chat:history');
      socket.off('chat:clear');
    };
  }, [currentUser]);

  function showToast(text: string) {
    setToastMessage(text);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }

  const handleLogout = () => {
    clearAllChatCache();
    localStorage.removeItem('uno_active_room_id');
    api.clearToken();
    setCurrentUser(null);
    setCurrentRoom(null);
    setGameState(null);
    setChatMessages([]);
    setUnreadChatCount(0);
    disconnectSocket();
  };

  const handleCreateRoom = (params: { name: string; isPublic: boolean; password?: string }) => {
    if (!currentUser) return;
    clearAllChatCache();
    setChatMessages([]);
    setUnreadChatCount(0);
    socket.emit('room:create', {
      name: params.name,
      isPublic: params.isPublic,
      password: params.password,
      user: currentUser,
    });
  };

  const handleJoinPublicRoom = (roomId: string) => {
    if (!currentUser) return;
    clearAllChatCache();
    setChatMessages([]);
    setUnreadChatCount(0);
    socket.emit('room:join', { roomId, user: currentUser });
  };

  const handleJoinPrivateRoom = (password: string) => {
    if (!currentUser) return;
    clearAllChatCache();
    setChatMessages([]);
    setUnreadChatCount(0);
    socket.emit('room:join_by_password', { password, user: currentUser });
  };

  const handleStartGame = () => {
    socket.emit('room:start');
  };

  const handleLeaveRoom = () => {
    clearAllChatCache();
    localStorage.removeItem('uno_active_room_id');
    socket.emit('room:leave');
    setCurrentRoom(null);
    setGameState(null);
    setChatMessages([]);
    setUnreadChatCount(0);
  };

  const handleQuitMatch = () => {
    clearAllChatCache();
    localStorage.removeItem('uno_active_room_id');
    socket.emit('room:quit');
    setCurrentRoom(null);
    setGameState(null);
    setChatMessages([]);
    setUnreadChatCount(0);
  };

  const handleToggleChat = () => {
    setIsChatOpen(prev => {
      const next = !prev;
      if (next) {
        setUnreadChatCount(0);
      }
      return next;
    });
  };

  const handlePlayCard = (cardId: string, chosenColor?: CardColor) => {
    socket.emit('game:play_card', { cardId, chosenColor });
  };

  const handleDrawCard = () => {
    socket.emit('game:draw_card');
  };

  const handlePassTurn = () => {
    socket.emit('game:pass_turn');
  };

  const handleCallUno = () => {
    socket.emit('game:call_uno');
  };

  const handleCallCheck = () => {
    socket.emit('game:call_check');
  };

  const handleSendMessage = (text: string) => {
    socket.emit('chat:send', { text });
  };

  if (authChecking) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold tracking-wide text-slate-400">Loading Uno Online...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthModal onSuccess={user => setCurrentUser(user)} />;
  }

  const myPlayer = gameState?.players.find(p => p.id === socket.id);
  const isMyTurn = gameState ? gameState.currentTurnPlayerId === socket.id : false;
  const currentTurnPlayer = gameState?.players.find(p => p.id === gameState.currentTurnPlayerId);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-amber-500/90 text-slate-950 font-bold text-xs sm:text-sm shadow-2xl border border-amber-300 backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200">
          {toastMessage}
        </div>
      )}

      {/* Main View Switcher: Lobby vs 3D Game */}
      {!gameState || gameState.status === 'waiting' ? (
        <LobbyView
          user={currentUser}
          publicRooms={publicRooms}
          currentRoom={currentRoom}
          onRefreshRooms={() => socket.emit('rooms:list')}
          onCreateRoom={handleCreateRoom}
          onJoinPublicRoom={handleJoinPublicRoom}
          onJoinPrivateRoom={handleJoinPrivateRoom}
          onStartGame={handleStartGame}
          onLeaveRoom={handleLeaveRoom}
          onLogout={handleLogout}
        />
      ) : (
        <div className="relative w-full h-full">
          {/* 3D Canvas with Three.js */}
          <UnoScene3D gameState={gameState} myPlayerId={socketId || socket.id || ''} myUserId={currentUser?.id || ''} />

          {/* Top HUD: Top card preview, turn status, Uno/Check buttons, Draw card button, Quit button, integrated Chat */}
          <TopCardHUD
            topCard={gameState.topCard}
            currentColor={gameState.currentColor}
            isMyTurn={isMyTurn}
            currentTurnPlayerName={currentTurnPlayer?.username || 'Opponent'}
            onDrawCard={handleDrawCard}
            onPassTurn={handlePassTurn}
            onCallUno={handleCallUno}
            onCallCheck={handleCallCheck}
            handVisible={handVisible}
            onToggleHand={() => setHandVisible(!handVisible)}
            direction={gameState.direction}
            lastActionMessage={gameState.lastActionMessage}
            hasDrawnThisTurn={gameState.hasDrawnThisTurn || false}
            pendingDrawCount={gameState.pendingDrawCount || 0}
            onQuitGame={handleQuitMatch}
            isChatOpen={isChatOpen}
            onToggleChat={handleToggleChat}
            unreadChatCount={unreadChatCount}
          />

          {/* Player's Hand Tray (Playable cards highlighted, collapsible) */}
          <PlayerHand
            cards={myPlayer?.cards || []}
            isMyTurn={isMyTurn}
            currentColor={gameState.currentColor}
            topCard={gameState.topCard}
            onPlayCard={handlePlayCard}
            visible={handVisible}
            pendingDrawCount={gameState.pendingDrawCount || 0}
          />

          {/* Game Over Modal when a player wins */}
          {gameState.status === 'ended' && (
            <GameOverModal
              winner={gameState.winner || null}
              onLeave={handleLeaveRoom}
            />
          )}
        </div>
      )}

      {/* Live Chat Drawer */}
      {currentRoom && (
        <ChatDrawer
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          isOpen={isChatOpen}
          onToggle={handleToggleChat}
          unreadCount={unreadChatCount}
          showTriggerButton={!gameState || gameState.status === 'waiting'}
        />
      )}
    </div>
  );
};

export default App;
