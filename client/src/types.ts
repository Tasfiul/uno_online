export type CardColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';

export type CardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface UnoCard {
  id: string;
  color: CardColor;
  type: CardType;
  value: number; // 0-9 for numbers, -1 for special
}

export interface Player {
  id: string; // Socket ID
  userId: string;
  username: string;
  avatar: string;
  cards: UnoCard[];
  cardCount: number;
  isTurn: boolean;
  hasSaidUno: boolean;
  isHost: boolean;
  isConnected: boolean;
  isMuted: boolean;
  isSpeaking?: boolean;
}

export type GameStatus = 'waiting' | 'playing' | 'ended';

export interface GameState {
  roomId: string;
  status: GameStatus;
  players: Player[];
  currentTurnPlayerId: string;
  direction: 1 | -1; // 1 = clockwise, -1 = counter-clockwise
  drawPileCount: number;
  topCard: UnoCard;
  currentColor: CardColor; // Active color (especially when wild played)
  lastPlayedBy?: string;
  winner?: Player | null;
  unoVulnerablePlayerId?: string | null; // Player who has 1 card without saying UNO
  lastActionMessage?: string;
  turnStartTime?: number;
  hasDrawnThisTurn?: boolean;
  pendingDrawCount?: number;
}

export interface Room {
  id: string;
  name: string;
  isPublic: boolean;
  hostId: string;
  hostName: string;
  players: Player[];
  status: GameStatus;
  maxPlayers: number;
  createdAt: number;
  messages?: ChatMessage[];
}

export interface PublicRoomInfo {
  id: string;
  name: string;
  isPublic: boolean;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: GameStatus;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface VoiceSignalPayload {
  target: string;
  sender: string;
  signal: any;
}

export interface CheckCallResult {
  checkerId: string;
  checkerName: string;
  targetId: string;
  targetName: string;
  success: boolean;
  penaltyCount: number;
  message: string;
}

