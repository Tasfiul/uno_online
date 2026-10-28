import { Server, Socket } from 'socket.io';
import { RoomManager } from '../game/roomManager';
import { Player, ChatMessage, VoiceSignalPayload } from '../types';
import { v4 as uuidv4 } from 'uuid';

export function setupSocketHandler(io: Server, roomManager: RoomManager) {
  // Map of socket.id -> roomId
  const socketRoomMap = new Map<string, string>();
  // Map of socket.id -> Player info
  const socketPlayerMap = new Map<string, Player>();
  // Disconnect grace timers: userId -> NodeJS.Timeout (15s window to refresh / reconnect)
  const disconnectTimers = new Map<string, NodeJS.Timeout>();
  const DISCONNECT_GRACE_MS = 15000; // 15 seconds grace window
  // Active room head-tracking look directions: roomId -> Map<playerId, { yaw: number, pitch: number }>
  const roomPlayerLooks = new Map<string, Map<string, { yaw: number; pitch: number }>>();
  // Active room WebRTC voice chat members: roomId -> Set<socket.id>
  const roomVoicePeers = new Map<string, Set<string>>();

  function broadcastRoomUpdate(roomId: string) {
    const room = roomManager.getRoom(roomId);
    if (room) {
      const safeRoom = {
        id: room.id,
        name: room.name,
        isPublic: room.isPublic,
        hostId: room.hostId,
        hostName: room.hostName,
        players: room.players,
        status: room.status,
        maxPlayers: room.maxPlayers,
        createdAt: room.createdAt,
      };
      io.to(roomId).emit('room:updated', safeRoom);
    }
  }

  function broadcastGameState(roomId: string) {
    const engine = roomManager.getGameEngine(roomId);
    if (!engine) return;

    for (const p of engine.state.players) {
      const sanitized = engine.getSanitizedStateForPlayer(p.id);
      io.to(p.id).emit('game:state_update', sanitized);
    }

    // When game has ended, broadcast to entire room to guarantee all connected clients see final state
    if (engine.state.status === 'ended') {
      const baseState = engine.getSanitizedStateForPlayer('');
      io.to(roomId).emit('game:state_update', baseState);
    }
  }

  io.on('connection', (socket: Socket) => {
    // 1. Initial Room Listing
    socket.on('rooms:list', () => {
      socket.emit('rooms:list_response', roomManager.getPublicRooms());
    });

    // 2. Reconnect to Active Room (Page Refresh Persistence)
    socket.on('room:reconnect', (payload: { roomId: string; user: { id: string; username: string; avatar: string } }) => {
      const { roomId, user } = payload;
      if (!roomId || !user?.id) return;

      // Clear any pending disconnect timer for this user
      if (disconnectTimers.has(user.id)) {
        clearTimeout(disconnectTimers.get(user.id)!);
        disconnectTimers.delete(user.id);
      }

      const result = roomManager.reconnectPlayer(roomId, user.id, socket.id);
      if (result.success && result.room && result.player) {
        socketRoomMap.set(socket.id, roomId);
        socketPlayerMap.set(socket.id, result.player);
        socket.join(roomId);

        socket.emit('room:reconnected', { roomId, room: result.room });
        broadcastRoomUpdate(roomId);

        if (result.engine) {
          if (result.engine.state.status === 'playing') {
            result.engine.state.lastActionMessage = `✨ ${result.player.username} reconnected to the match!`;
          }
          // Immediately send sanitized game state to the reconnected player
          const sanitized = result.engine.getSanitizedStateForPlayer(socket.id);
          socket.emit('game:state_update', sanitized);
          broadcastGameState(roomId);
        }

        const sysMsg: ChatMessage = {
          id: uuidv4(),
          senderId: 'system',
          senderName: 'System',
          senderAvatar: '',
          text: `${result.player.username} reconnected to the match.`,
          timestamp: Date.now(),
          isSystem: true,
        };
        io.to(roomId).emit('chat:message', sysMsg);
      } else {
        // Room no longer exists or player not in it
        socket.emit('room:reconnect_failed');
      }
    });

    // 3. Room Creation
    socket.on('room:create', (payload: {
      name: string;
      isPublic: boolean;
      password?: string;
      user: { id: string; username: string; avatar: string };
    }) => {
      const hostPlayer: Player = {
        id: socket.id,
        userId: payload.user.id,
        username: payload.user.username,
        avatar: payload.user.avatar,
        cards: [],
        cardCount: 0,
        isTurn: false,
        hasSaidUno: false,
        isHost: true,
        isConnected: true,
        isMuted: false,
      };

      const result = roomManager.createRoom({
        name: payload.name,
        isPublic: payload.isPublic,
        password: payload.password,
        hostPlayer,
      });

      if (!result.success || !result.room) {
        socket.emit('room:error', { message: result.error || 'Failed to create room' });
        return;
      }

      socketRoomMap.set(socket.id, result.room.id);
      socketPlayerMap.set(socket.id, hostPlayer);
      socket.join(result.room.id);

      socket.emit('room:created', { roomId: result.room.id });
      broadcastRoomUpdate(result.room.id);
      io.emit('rooms:list_response', roomManager.getPublicRooms());
    });

    // 4. Join Public Room
    socket.on('room:join', (payload: {
      roomId: string;
      user: { id: string; username: string; avatar: string };
    }) => {
      const player: Player = {
        id: socket.id,
        userId: payload.user.id,
        username: payload.user.username,
        avatar: payload.user.avatar,
        cards: [],
        cardCount: 0,
        isTurn: false,
        hasSaidUno: false,
        isHost: false,
        isConnected: true,
        isMuted: false,
      };

      const result = roomManager.joinRoom({
        roomId: payload.roomId,
        player,
      });

      if (!result.success || !result.room) {
        socket.emit('room:error', { message: result.error || 'Failed to join room' });
        return;
      }

      socketRoomMap.set(socket.id, result.room.id);
      socketPlayerMap.set(socket.id, player);
      socket.join(result.room.id);

      socket.emit('room:joined', { roomId: result.room.id });
      broadcastRoomUpdate(result.room.id);

      const sysMsg: ChatMessage = {
        id: uuidv4(),
        senderId: 'system',
        senderName: 'System',
        senderAvatar: '',
        text: `${player.username} joined the room`,
        timestamp: Date.now(),
        isSystem: true,
      };
      io.to(result.room.id).emit('chat:message', sysMsg);
      io.emit('rooms:list_response', roomManager.getPublicRooms());
    });

    // 5. Join Game with Password (Private Room)
    socket.on('room:join_by_password', (payload: {
      password: string;
      user: { id: string; username: string; avatar: string };
    }) => {
      const player: Player = {
        id: socket.id,
        userId: payload.user.id,
        username: payload.user.username,
        avatar: payload.user.avatar,
        cards: [],
        cardCount: 0,
        isTurn: false,
        hasSaidUno: false,
        isHost: false,
        isConnected: true,
        isMuted: false,
      };

      const result = roomManager.joinRoom({
        password: payload.password,
        player,
      });

      if (!result.success || !result.room) {
        socket.emit('room:error', { message: result.error || 'Failed to join private room' });
        return;
      }

      socketRoomMap.set(socket.id, result.room.id);
      socketPlayerMap.set(socket.id, player);
      socket.join(result.room.id);

      socket.emit('room:joined', { roomId: result.room.id });
      broadcastRoomUpdate(result.room.id);

      const sysMsg: ChatMessage = {
        id: uuidv4(),
        senderId: 'system',
        senderName: 'System',
        senderAvatar: '',
        text: `${player.username} joined the private room`,
        timestamp: Date.now(),
        isSystem: true,
      };
      io.to(result.room.id).emit('chat:message', sysMsg);
    });

    // 6. Start Game
    socket.on('room:start', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;

      const result = roomManager.startGame(roomId, socket.id);
      if (!result.success || !result.engine) {
        socket.emit('room:error', { message: result.error || 'Could not start game' });
        return;
      }

      broadcastRoomUpdate(roomId);
      broadcastGameState(roomId);

      const sysMsg: ChatMessage = {
        id: uuidv4(),
        senderId: 'system',
        senderName: 'System',
        senderAvatar: '',
        text: `UNO Match Started! Standard UNO rules apply.`,
        timestamp: Date.now(),
        isSystem: true,
      };
      io.to(roomId).emit('chat:message', sysMsg);
      io.emit('rooms:list_response', roomManager.getPublicRooms());
    });

    // 7. Play Card
    socket.on('game:play_card', (payload: { cardId: string; chosenColor?: any }) => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;

      const engine = roomManager.getGameEngine(roomId);
      if (!engine) return;

      const result = engine.playCard(socket.id, payload.cardId, payload.chosenColor);
      if (!result.success) {
        socket.emit('game:error', { message: result.error });
        return;
      }

      if (engine.state.status === 'ended' && engine.state.winner) {
        const room = roomManager.getRoom(roomId);
        if (room) room.status = 'ended';

        io.to(roomId).emit('game:game_over', { winner: engine.state.winner });
      }

      broadcastGameState(roomId);
    });

    // 8. Draw Card
    socket.on('game:draw_card', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;

      const engine = roomManager.getGameEngine(roomId);
      if (!engine) return;

      const result = engine.drawCard(socket.id);
      if (!result.success && result.error) {
        socket.emit('game:error', { message: result.error });
        return;
      }

      broadcastGameState(roomId);
    });

    // 9. Pass Turn
    socket.on('game:pass_turn', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;

      const engine = roomManager.getGameEngine(roomId);
      if (!engine) return;

      const result = engine.passTurn(socket.id);
      if (!result.success && result.error) {
        socket.emit('game:error', { message: result.error });
        return;
      }

      broadcastGameState(roomId);
    });

    // 10. Call UNO Button
    socket.on('game:call_uno', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;

      const engine = roomManager.getGameEngine(roomId);
      if (!engine) return;

      const result = engine.callUno(socket.id);
      if (!result.success) {
        socket.emit('game:error', { message: result.error || result.message });
        return;
      }

      const player = socketPlayerMap.get(socket.id);

      io.to(roomId).emit('game:uno_called', {
        playerId: socket.id,
        username: player?.username || 'Player',
        message: result.message,
      });

      broadcastGameState(roomId);
    });

    // 11. Call Check Button
    socket.on('game:call_check', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;

      const engine = roomManager.getGameEngine(roomId);
      if (!engine) return;

      const checkResult = engine.callCheck(socket.id);

      if (checkResult.success) {
        io.to(roomId).emit('game:check_called', checkResult);

        const sysMsg: ChatMessage = {
          id: uuidv4(),
          senderId: 'system',
          senderName: 'System',
          senderAvatar: '',
          text: checkResult.message,
          timestamp: Date.now(),
          isSystem: true,
        };
        io.to(roomId).emit('chat:message', sysMsg);
        broadcastGameState(roomId);
      } else {
        socket.emit('game:check_called', checkResult);
      }
    });

    // 12. Live Chat Messaging
    socket.on('chat:send', (payload: { text: string }) => {
      const roomId = socketRoomMap.get(socket.id);
      const player = socketPlayerMap.get(socket.id);
      if (!roomId || !player || !payload.text || payload.text.trim().length === 0) return;

      const message: ChatMessage = {
        id: uuidv4(),
        senderId: player.id,
        senderName: player.username,
        senderAvatar: player.avatar,
        text: payload.text.trim(),
        timestamp: Date.now(),
      };

      io.to(roomId).emit('chat:message', message);
    });

    // 13. Live WebRTC Voice Chat Signaling
    socket.on('voice:join', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;

      let peersSet = roomVoicePeers.get(roomId);
      if (!peersSet) {
        peersSet = new Set<string>();
        roomVoicePeers.set(roomId, peersSet);
      }

      // Return current voice peers to this joining socket (excluding themselves)
      const existingPeers = Array.from(peersSet).filter(id => id !== socket.id);
      socket.emit('voice:peers', { peers: existingPeers });

      // Add socket to set and inform others
      peersSet.add(socket.id);
      socket.to(roomId).emit('voice:peer_joined', { peerId: socket.id, playerId: socket.id });
    });

    socket.on('voice:leave', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;

      const peersSet = roomVoicePeers.get(roomId);
      if (peersSet) {
        peersSet.delete(socket.id);
        if (peersSet.size === 0) {
          roomVoicePeers.delete(roomId);
        }
      }
      socket.to(roomId).emit('voice:peer_left', { peerId: socket.id, playerId: socket.id });
    });

    socket.on('voice:signal', (payload: VoiceSignalPayload) => {
      if (!payload || !payload.target) return;
      io.to(payload.target).emit('voice:signal', {
        sender: socket.id,
        signal: payload.signal,
      });
    });

    socket.on('voice:mute_change', (payload: { isMuted: boolean }) => {
      const roomId = socketRoomMap.get(socket.id);
      const player = socketPlayerMap.get(socket.id);
      if (player) {
        player.isMuted = payload.isMuted;
      }
      if (roomId) {
        io.to(roomId).emit('voice:mute_status', {
          peerId: socket.id,
          playerId: socket.id,
          isMuted: payload.isMuted,
        });
      }
    });

    socket.on('voice:speaking_change', (payload: { isSpeaking: boolean }) => {
      const roomId = socketRoomMap.get(socket.id);
      if (roomId) {
        socket.to(roomId).emit('voice:speaking_status', {
          peerId: socket.id,
          playerId: socket.id,
          isSpeaking: payload.isSpeaking,
        });
      }
    });

    // 14. Realtime First-Person Head Movement / Look Tracking
    socket.on('player:look', (payload: { yaw: number; pitch: number }) => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId || typeof payload?.yaw !== 'number' || typeof payload?.pitch !== 'number') return;

      let roomLooks = roomPlayerLooks.get(roomId);
      if (!roomLooks) {
        roomLooks = new Map();
        roomPlayerLooks.set(roomId, roomLooks);
      }
      roomLooks.set(socket.id, { yaw: payload.yaw, pitch: payload.pitch });

      socket.to(roomId).emit('player:looked', {
        playerId: socket.id,
        yaw: payload.yaw,
        pitch: payload.pitch,
      });
    });

    socket.on('player:get_looks', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;
      const roomLooks = roomPlayerLooks.get(roomId);
      if (roomLooks && roomLooks.size > 0) {
        const obj: Record<string, { yaw: number; pitch: number }> = {};
        roomLooks.forEach((val, key) => {
          obj[key] = val;
        });
        socket.emit('player:all_looks', obj);
      }
    });

    // 15. Explicit Action: Quit Match / Leave Room
    socket.on('room:quit', () => {
      handleExplicitQuit(socket);
    });

    socket.on('room:leave', () => {
      handleExplicitQuit(socket);
    });

    // 15. Temporary Socket Disconnection (Page Refresh or Network blip)
    socket.on('disconnect', () => {
      const roomId = socketRoomMap.get(socket.id);
      const player = socketPlayerMap.get(socket.id);
      if (!roomId || !player) return;

      socket.leave(roomId);
      socketRoomMap.delete(socket.id);
      socketPlayerMap.delete(socket.id);

      // Notify WebRTC peers to mute/pause audio and remove from active voice
      const voicePeers = roomVoicePeers.get(roomId);
      if (voicePeers) {
        voicePeers.delete(socket.id);
        if (voicePeers.size === 0) roomVoicePeers.delete(roomId);
      }
      socket.to(roomId).emit('voice:peer_left', { playerId: socket.id, peerId: socket.id });

      // Mark player as temporarily disconnected in room
      roomManager.handlePlayerDisconnect(roomId, socket.id);
      broadcastRoomUpdate(roomId);

      const userId = player.userId;
      const engine = roomManager.getGameEngine(roomId);

      // In an active match, notify remaining players immediately
      if (engine && engine.state.status === 'playing') {
        engine.state.lastActionMessage = `⚠️ ${player.username} disconnected. Match ends in 15s if not reconnected...`;
      }
      broadcastGameState(roomId);

      // 15-second grace window to allow page refresh / reconnecting
      // If user merely reloads page, they reconnect in ~1-3s; if they closed tab, remaining player wins in 15s
      const timer = setTimeout(() => {
        disconnectTimers.delete(userId);
        // Grace period expired: execute complete quit
        const quitRes = roomManager.quitRoom(roomId, userId);
        if (quitRes.removedPlayer) {
          const sysMsg: ChatMessage = {
            id: uuidv4(),
            senderId: 'system',
            senderName: 'System',
            senderAvatar: '',
            text: `${quitRes.removedPlayer.username} disconnected and timed out.`,
            timestamp: Date.now(),
            isSystem: true,
          };
          io.to(roomId).emit('chat:message', sysMsg);
          broadcastRoomUpdate(roomId);
          broadcastGameState(roomId);

          if (quitRes.gameOver && quitRes.engine?.state.winner) {
            io.to(roomId).emit('game:game_over', { winner: quitRes.engine.state.winner });
          }

          io.emit('rooms:list_response', roomManager.getPublicRooms());
        }
      }, DISCONNECT_GRACE_MS);

      disconnectTimers.set(userId, timer);
    });

    function handleExplicitQuit(sock: Socket) {
      const roomId = socketRoomMap.get(sock.id);
      const player = socketPlayerMap.get(sock.id);
      if (!roomId) return;

      sock.leave(roomId);
      socketRoomMap.delete(sock.id);
      socketPlayerMap.delete(sock.id);

      if (player && disconnectTimers.has(player.userId)) {
        clearTimeout(disconnectTimers.get(player.userId)!);
        disconnectTimers.delete(player.userId);
      }

      const voicePeers = roomVoicePeers.get(roomId);
      if (voicePeers) {
        voicePeers.delete(sock.id);
        if (voicePeers.size === 0) roomVoicePeers.delete(roomId);
      }
      sock.to(roomId).emit('voice:peer_left', { playerId: sock.id, peerId: sock.id });

      const quitRes = roomManager.quitRoom(roomId, player?.userId || sock.id);
      sock.emit('room:left');

      if (quitRes.removedPlayer) {
        const sysMsg: ChatMessage = {
          id: uuidv4(),
          senderId: 'system',
          senderName: 'System',
          senderAvatar: '',
          text: `${quitRes.removedPlayer.username} quit the match.`,
          timestamp: Date.now(),
          isSystem: true,
        };
        io.to(roomId).emit('chat:message', sysMsg);
        broadcastRoomUpdate(roomId);

        // Always broadcast game state to remaining players
        broadcastGameState(roomId);

        // Requirement: "if all but one player remains, auto declare winner only then"
        if (quitRes.gameOver && quitRes.engine?.state.winner) {
          io.to(roomId).emit('game:game_over', { winner: quitRes.engine.state.winner });
        }
      }

      io.emit('rooms:list_response', roomManager.getPublicRooms());
    }
  });
}
