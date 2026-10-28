import { Room, PublicRoomInfo, Player } from '../types';
import { UnoGameEngine } from './unoEngine';
import { v4 as uuidv4 } from 'uuid';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private gameEngines: Map<string, UnoGameEngine> = new Map();

  public createRoom(params: {
    name: string;
    isPublic: boolean;
    password?: string;
    hostPlayer: Player;
    maxPlayers?: number;
  }): { success: boolean; room?: Room; error?: string } {
    const { name, isPublic, password, hostPlayer, maxPlayers = 6 } = params;

    if (!name || name.trim().length === 0) {
      return { success: false, error: 'Room name is required' };
    }

    if (!isPublic) {
      if (!password || password.trim().length === 0) {
        return { success: false, error: 'Password is required for private rooms' };
      }

      const trimmedPw = password.trim();
      for (const room of this.rooms.values()) {
        if (!room.isPublic && room.password === trimmedPw) {
          return {
            success: false,
            error: 'Another active private room is already using this password. Please choose a different password.',
          };
        }
      }
    }

    const roomId = uuidv4().substring(0, 8);
    const newRoom: Room = {
      id: roomId,
      name: name.trim(),
      isPublic,
      password: !isPublic ? password!.trim() : undefined,
      hostId: hostPlayer.id,
      hostName: hostPlayer.username,
      players: [{ ...hostPlayer, isHost: true }],
      status: 'waiting',
      maxPlayers: Math.min(Math.max(maxPlayers, 2), 8),
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, newRoom);
    return { success: true, room: newRoom };
  }

  public getPublicRooms(): PublicRoomInfo[] {
    const publicList: PublicRoomInfo[] = [];
    for (const room of this.rooms.values()) {
      if (room.isPublic) {
        publicList.push({
          id: room.id,
          name: room.name,
          isPublic: true,
          hostName: room.hostName,
          playerCount: room.players.length,
          maxPlayers: room.maxPlayers,
          status: room.status,
          createdAt: room.createdAt,
        });
      }
    }
    return publicList.sort((a, b) => b.createdAt - a.createdAt);
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public findPrivateRoomByPassword(password: string): Room | undefined {
    const trimmedPw = password.trim();
    for (const room of this.rooms.values()) {
      if (!room.isPublic && room.password === trimmedPw) {
        return room;
      }
    }
    return undefined;
  }

  public joinRoom(params: {
    roomId?: string;
    password?: string;
    player: Player;
  }): { success: boolean; room?: Room; error?: string } {
    let targetRoom: Room | undefined;

    if (params.password) {
      targetRoom = this.findPrivateRoomByPassword(params.password);
      if (!targetRoom) {
        return { success: false, error: 'No active private room found with that password' };
      }
    } else if (params.roomId) {
      targetRoom = this.rooms.get(params.roomId);
      if (!targetRoom) {
        return { success: false, error: 'Room not found' };
      }
      if (!targetRoom.isPublic) {
        return { success: false, error: 'This is a private room. Please join using password.' };
      }
    } else {
      return { success: false, error: 'Missing room ID or password' };
    }

    if (targetRoom.players.length >= targetRoom.maxPlayers) {
      return { success: false, error: 'Room is full' };
    }

    if (targetRoom.status !== 'waiting') {
      return { success: false, error: 'Game in progress' };
    }

    // Check if player already in room
    const existingIndex = targetRoom.players.findIndex(p => p.userId === params.player.userId);
    if (existingIndex !== -1) {
      targetRoom.players[existingIndex] = {
        ...params.player,
        isHost: targetRoom.players[existingIndex].isHost,
      };
    } else {
      targetRoom.players.push({
        ...params.player,
        isHost: false,
      });
    }

    return { success: true, room: targetRoom };
  }

  // Handle temporary network drop or page refresh (PERSISTENCE)
  public handlePlayerDisconnect(roomId: string, socketId: string): { room?: Room; player?: Player } {
    const room = this.rooms.get(roomId);
    if (!room) return {};

    const player = room.players.find(p => p.id === socketId);
    if (player) {
      player.isConnected = false;
    }

    const engine = this.gameEngines.get(roomId);
    if (engine) {
      const ep = engine.state.players.find(p => p.id === socketId);
      if (ep) {
        ep.isConnected = false;
      }
    }

    return { room, player };
  }

  // Handle user reconnecting after page refresh
  public reconnectPlayer(roomId: string, userId: string, newSocketId: string): {
    success: boolean;
    room?: Room;
    engine?: UnoGameEngine;
    player?: Player;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false };

    const player = room.players.find(p => p.userId === userId);
    if (!player) return { success: false };

    const oldSocketId = player.id;
    player.id = newSocketId;
    player.isConnected = true;

    if (room.hostId === oldSocketId) {
      room.hostId = newSocketId;
    }

    const engine = this.gameEngines.get(roomId);
    if (engine) {
      const ep = engine.state.players.find(p => p.userId === userId);
      if (ep) {
        ep.id = newSocketId;
        ep.isConnected = true;
      }

      if (engine.state.currentTurnPlayerId === oldSocketId) {
        engine.state.currentTurnPlayerId = newSocketId;
      }

      if (engine.state.unoVulnerablePlayerId === oldSocketId) {
        engine.state.unoVulnerablePlayerId = newSocketId;
      }
    }

    return { success: true, room, engine, player };
  }

  // Explicit user action: "Quit Game" / "Leave Room" or disconnect timeout expiry
  public quitRoom(roomId: string, socketOrUserId: string): {
    room?: Room;
    engine?: UnoGameEngine;
    removedPlayer?: Player;
    gameOver: boolean;
    remainingCount: number;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { gameOver: false, remainingCount: 0 };

    const playerIndex = room.players.findIndex(p => p.id === socketOrUserId || p.userId === socketOrUserId);
    if (playerIndex === -1) return { room, gameOver: false, remainingCount: room.players.length };

    const removedPlayer = room.players[playerIndex];
    room.players.splice(playerIndex, 1);

    const engine = this.gameEngines.get(roomId);
    let gameOver = false;

    if (engine) {
      const epIndex = engine.state.players.findIndex(p => p.id === removedPlayer.id || p.userId === removedPlayer.userId);
      if (epIndex !== -1) {
        const wasTurn = engine.state.currentTurnPlayerId === removedPlayer.id;
        engine.state.players.splice(epIndex, 1);

        // If it was the quitting player's turn, advance turn to next player
        if (wasTurn && engine.state.players.length > 0) {
          const nextIndex = epIndex % engine.state.players.length;
          engine.state.currentTurnPlayerId = engine.state.players[nextIndex].id;
          engine.state.players.forEach((p, idx) => {
            p.isTurn = idx === nextIndex;
          });
          engine.state.turnStartTime = Date.now();
        }
      }

      // Check how many players remain:
      // "if all but one player remains, auto declare winner only then"
      if ((room.status === 'playing' || engine.state.status === 'playing') && engine.state.players.length === 1) {
        room.status = 'ended';
        engine.state.status = 'ended';
        engine.state.winner = engine.state.players[0];
        engine.state.lastActionMessage = `All opponents have left. ${engine.state.players[0].username} wins the match! 👑`;
        gameOver = true;
      } else if ((room.status === 'playing' || engine.state.status === 'playing') && engine.state.players.length >= 2) {
        engine.state.lastActionMessage = `${removedPlayer.username} left the match. Game continues!`;
      }
    }

    // If host left, elect next host
    if (room.hostId === removedPlayer.id && room.players.length > 0) {
      room.players[0].isHost = true;
      room.hostId = room.players[0].id;
      room.hostName = room.players[0].username;
    }

    // If zero players remain, clean up room
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      this.gameEngines.delete(roomId);
      return { gameOver, remainingCount: 0 };
    }

    return { room, engine, removedPlayer, gameOver, remainingCount: room.players.length };
  }

  public startGame(roomId: string, hostPlayerId: string): { success: boolean; error?: string; engine?: UnoGameEngine } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'Room not found' };
    if (room.hostId !== hostPlayerId) return { success: false, error: 'Only the host can start the game' };
    if (room.players.length < 2) return { success: false, error: 'Need at least 2 players to start UNO' };

    room.status = 'playing';
    const engine = new UnoGameEngine(roomId, room.players);
    this.gameEngines.set(roomId, engine);

    // Update room players state from engine
    room.players = engine.state.players;

    return { success: true, engine };
  }

  public getGameEngine(roomId: string): UnoGameEngine | undefined {
    return this.gameEngines.get(roomId);
  }
}
