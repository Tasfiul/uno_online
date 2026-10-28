import { GameState, UnoCard, Player, CardColor, CheckCallResult } from '../types';
import { createUnoDeck, shuffleDeck } from './unoDeck';

export class UnoGameEngine {
  public state: GameState;
  private drawPile: UnoCard[] = [];
  private discardPile: UnoCard[] = [];
  private drawnThisTurn: boolean = false;

  constructor(roomId: string, players: Player[]) {
    this.drawPile = createUnoDeck();
    this.discardPile = [];

    // Clone players and reset cards
    const initializedPlayers: Player[] = players.map((p, idx) => ({
      ...p,
      cards: [],
      cardCount: 7,
      isTurn: idx === 0,
      hasSaidUno: false,
    }));

    // Deal 7 cards each
    for (let i = 0; i < 7; i++) {
      for (const player of initializedPlayers) {
        const card = this.drawFromPile();
        if (card) {
          player.cards.push(card);
        }
      }
    }

    // Determine initial top card: if it is a power card or wild, reshuffle back into deck until a regular number card is drawn
    let initialTopCard = this.drawFromPile()!;
    while (initialTopCard.type !== 'number') {
      this.drawPile.push(initialTopCard);
      this.drawPile = shuffleDeck(this.drawPile);
      initialTopCard = this.drawFromPile()!;
    }

    this.discardPile.push(initialTopCard);

    const startingColor: CardColor = initialTopCard.color;

    this.state = {
      roomId,
      status: 'playing',
      players: initializedPlayers,
      currentTurnPlayerId: initializedPlayers[0].id,
      direction: 1,
      drawPileCount: this.drawPile.length,
      topCard: initialTopCard,
      currentColor: startingColor,
      winner: null,
      unoVulnerablePlayerId: null,
      lastActionMessage: `Game started! Top card is ${initialTopCard.color.toUpperCase()} ${initialTopCard.value}`,
      turnStartTime: Date.now(),
      hasDrawnThisTurn: false,
    };

    // Apply starting card effects if any
    this.applyInitialCardEffect(initialTopCard);
  }

  private drawFromPile(): UnoCard | null {
    if (this.drawPile.length === 0) {
      if (this.discardPile.length <= 1) {
        return null;
      }
      const top = this.discardPile.pop()!;
      this.drawPile = shuffleDeck(this.discardPile);
      this.discardPile = [top];
    }
    return this.drawPile.pop() || null;
  }

  private applyInitialCardEffect(card: UnoCard) {
    const numPlayers = this.state.players.length;
    if (card.type === 'skip') {
      this.advanceTurn(1);
      this.state.lastActionMessage = `Initial Skip card! First player's turn was skipped.`;
    } else if (card.type === 'reverse') {
      if (numPlayers === 2) {
        this.advanceTurn(1);
        this.state.lastActionMessage = `Initial Reverse card! First player was skipped in 2-player match.`;
      } else {
        this.state.direction = -1;
        this.setTurnPlayerIndex(numPlayers - 1);
        this.state.lastActionMessage = `Initial Reverse card! Direction is counter-clockwise.`;
      }
    } else if (card.type === 'draw2') {
      const firstPlayer = this.state.players[0];
      this.giveCardsToPlayer(firstPlayer.id, 2);
      this.advanceTurn(1);
      this.state.lastActionMessage = `Initial Draw 2 card! ${firstPlayer.username} drew 2 cards and turn skipped.`;
    }
  }

  public canPlayCard(card: UnoCard, remainingCardCount?: number): boolean {
    // RULE: Cannot finish match with a Power card (Skip, Reverse, Draw 2) or Wild card (Wild, Wild 4)
    if (remainingCardCount === 1 && card.type !== 'number') {
      return false;
    }

    if (card.color === 'wild') return true;
    if (card.color === this.state.currentColor) return true;
    if (card.type === this.state.topCard.type && card.type !== 'number') return true;
    if (card.type === 'number' && this.state.topCard.type === 'number' && card.value === this.state.topCard.value) return true;
    return false;
  }

  public playCard(playerId: string, cardId: string, chosenColor?: CardColor): { success: boolean; error?: string } {
    if (this.state.status !== 'playing') {
      return { success: false, error: 'Game is not active' };
    }

    if (this.state.currentTurnPlayerId !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    const cardIndex = player.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return { success: false, error: 'Card not in hand' };
    }

    const card = player.cards[cardIndex];

    // Check finishing rule
    if (player.cards.length === 1 && card.type !== 'number') {
      return {
        success: false,
        error: 'Cannot finish the game with a Power or Wild card! The winning card must be a number card (0-9).',
      };
    }

    if (!this.canPlayCard(card, player.cards.length)) {
      return { success: false, error: 'Invalid card move' };
    }

    if (card.color === 'wild') {
      if (!chosenColor || !['red', 'yellow', 'green', 'blue'].includes(chosenColor)) {
        return { success: false, error: 'Must select a valid color for Wild card' };
      }
    }

    // Remove card from hand
    player.cards.splice(cardIndex, 1);
    player.cardCount = player.cards.length;

    // Put onto discard pile
    this.discardPile.push(card);
    this.state.topCard = card;
    this.state.currentColor = card.color === 'wild' ? chosenColor! : card.color;
    this.state.lastPlayedBy = playerId;
    this.drawnThisTurn = false;
    this.state.hasDrawnThisTurn = false;

    // Optional UNO rule tracking:
    // If player reaches 1 card and has NOT called UNO, mark vulnerable internally.
    // DO NOT announce vulnerability to the room! Opponents must notice it themselves.
    if (player.cardCount === 1) {
      if (!player.hasSaidUno) {
        this.state.unoVulnerablePlayerId = player.id;
      }
    } else if (player.cardCount > 1) {
      player.hasSaidUno = false;
      if (this.state.unoVulnerablePlayerId === player.id) {
        this.state.unoVulnerablePlayerId = null;
      }
    }

    // Win check (if player reached 0 cards and nobody called Check while they had 1 card)
    if (player.cardCount === 0) {
      this.state.status = 'ended';
      this.state.winner = player;
      this.state.lastActionMessage = `🎉 ${player.username} played their last card and WON the game! 🎉`;
      return { success: true };
    }

    // Apply card special actions & advance turns
    const numPlayers = this.state.players.length;

    if (card.type === 'skip') {
      this.state.lastActionMessage = `${player.username} played Skip! Next player skipped.`;
      this.advanceTurn(2);
    } else if (card.type === 'reverse') {
      if (numPlayers === 2) {
        this.state.lastActionMessage = `${player.username} played Reverse! Next player skipped.`;
        this.advanceTurn(2);
      } else {
        this.state.direction = (this.state.direction * -1) as 1 | -1;
        this.state.lastActionMessage = `${player.username} played Reverse! Turn direction reversed.`;
        this.advanceTurn(1);
      }
    } else if (card.type === 'draw2') {
      const nextPlayer = this.getNextPlayer(1);
      this.giveCardsToPlayer(nextPlayer.id, 2);
      this.state.lastActionMessage = `${player.username} played Draw Two! ${nextPlayer.username} drew 2 cards and missed turn.`;
      this.advanceTurn(2);
    } else if (card.type === 'wild4') {
      const nextPlayer = this.getNextPlayer(1);
      this.giveCardsToPlayer(nextPlayer.id, 4);
      this.state.lastActionMessage = `${player.username} played Wild Draw 4! Color is ${chosenColor?.toUpperCase()}. ${nextPlayer.username} drew 4 cards and missed turn.`;
      this.advanceTurn(2);
    } else if (card.type === 'wild') {
      this.state.lastActionMessage = `${player.username} played Wild! New color is ${chosenColor?.toUpperCase()}.`;
      this.advanceTurn(1);
    } else {
      this.state.lastActionMessage = `${player.username} played ${card.color.toUpperCase()} ${card.value}.`;
      this.advanceTurn(1);
    }

    this.state.drawPileCount = this.drawPile.length;
    return { success: true };
  }

  public drawCard(playerId: string): { success: boolean; drawnCard?: UnoCard; canPlayDrawn?: boolean; error?: string } {
    if (this.state.status !== 'playing') {
      return { success: false, error: 'Game is not active' };
    }

    if (this.state.currentTurnPlayerId !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Fix: Prevent drawing multiple times in the same turn
    if (this.drawnThisTurn) {
      return { success: false, error: 'You have already drawn a card this turn. Choose to play it or pass.' };
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    const card = this.drawFromPile();
    if (!card) {
      this.advanceTurn(1);
      return { success: false, error: 'No cards available in deck' };
    }

    player.cards.push(card);
    player.cardCount = player.cards.length;
    player.hasSaidUno = false;
    if (this.state.unoVulnerablePlayerId === player.id) {
      this.state.unoVulnerablePlayerId = null;
    }

    this.state.drawPileCount = this.drawPile.length;

    // Player took a card: stays on their turn so they can either play or manually pass (no auto-pass)
    this.drawnThisTurn = true;
    this.state.hasDrawnThisTurn = true;
    this.state.lastActionMessage = `${player.username} took a card from the deck.`;

    const hasPlayableCard = player.cards.some(c => this.canPlayCard(c, player.cards.length));
    return { success: true, drawnCard: card, canPlayDrawn: hasPlayableCard };
  }

  public passTurn(playerId: string): { success: boolean; error?: string } {
    if (this.state.currentTurnPlayerId !== playerId) {
      return { success: false, error: 'Not your turn' };
    }
    if (!this.drawnThisTurn) {
      return { success: false, error: 'Must draw before passing' };
    }
    const player = this.state.players.find(p => p.id === playerId);
    this.drawnThisTurn = false;
    this.state.hasDrawnThisTurn = false;
    this.state.lastActionMessage = `${player?.username || 'Player'} passed turn.`;
    this.advanceTurn(1);
    return { success: true };
  }

  public callUno(playerId: string): { success: boolean; message: string; error?: string } {
    if (this.state.status !== 'playing') {
      return { success: false, message: 'Game is not active', error: 'Game is not active' };
    }

    if (this.state.currentTurnPlayerId !== playerId) {
      return {
        success: false,
        message: 'You can only call UNO on your turn before playing down to 1 card.',
        error: 'You can only call UNO on your turn before playing down to 1 card.',
      };
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, message: 'Player not found', error: 'Player not found' };
    }

    if (player.cardCount > 2) {
      return {
        success: false,
        message: 'You can only call UNO when you have 2 cards in hand.',
        error: 'You can only call UNO when you have 2 cards in hand.',
      };
    }

    // Player calls UNO on their turn with 2 cards (or 1 card)
    player.hasSaidUno = true;
    if (this.state.unoVulnerablePlayerId === player.id) {
      this.state.unoVulnerablePlayerId = null;
    }

    this.state.lastActionMessage = `📢 ${player.username} called "UNO!"`;
    return {
      success: true,
      message: `${player.username} called UNO!`,
    };
  }

  public callCheck(checkerId: string): CheckCallResult {
    const checker = this.state.players.find(p => p.id === checkerId);
    const checkerName = checker ? checker.username : 'Unknown';

    // Find any opponent who ended their turn with 1 card without calling UNO
    const vulnerableOpponent = this.state.players.find(
      p => p.id !== checkerId && p.id === this.state.unoVulnerablePlayerId
    );

    if (vulnerableOpponent) {
      // PENALIZE: Give 2 penalty cards
      this.giveCardsToPlayer(vulnerableOpponent.id, 2);
      vulnerableOpponent.hasSaidUno = false;
      this.state.unoVulnerablePlayerId = null;

      const msg = `⚡ CHECK! ${checkerName} caught ${vulnerableOpponent.username} without calling UNO! ${vulnerableOpponent.username} drew 2 penalty cards!`;
      this.state.lastActionMessage = msg;

      return {
        checkerId,
        checkerName,
        targetId: vulnerableOpponent.id,
        targetName: vulnerableOpponent.username,
        success: true,
        penaltyCount: 2,
        message: msg,
      };
    } else {
      // No one was vulnerable -> return subtle response without altering room state or leaking
      return {
        checkerId,
        checkerName,
        targetId: '',
        targetName: '',
        success: false,
        penaltyCount: 0,
        message: 'No players are currently vulnerable to Check.',
      };
    }
  }

  private giveCardsToPlayer(playerId: string, count: number) {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    for (let i = 0; i < count; i++) {
      const card = this.drawFromPile();
      if (card) {
        player.cards.push(card);
      }
    }
    player.cardCount = player.cards.length;
    if (player.cardCount > 1) {
      player.hasSaidUno = false;
      if (this.state.unoVulnerablePlayerId === player.id) {
        this.state.unoVulnerablePlayerId = null;
      }
    }
    this.state.drawPileCount = this.drawPile.length;
  }

  private getNextPlayer(steps: number): Player {
    const currentIndex = this.state.players.findIndex(p => p.id === this.state.currentTurnPlayerId);
    const total = this.state.players.length;
    const nextIndex = (currentIndex + steps * this.state.direction + total * 10) % total;
    return this.state.players[nextIndex];
  }

  private advanceTurn(steps: number) {
    const nextPlayer = this.getNextPlayer(steps);
    this.setTurnPlayerIndex(this.state.players.findIndex(p => p.id === nextPlayer.id));
  }

  private setTurnPlayerIndex(index: number) {
    for (let i = 0; i < this.state.players.length; i++) {
      this.state.players[i].isTurn = i === index;
    }
    const nextPlayer = this.state.players[index];
    this.state.currentTurnPlayerId = nextPlayer.id;
    this.state.turnStartTime = Date.now();
    this.drawnThisTurn = false;
    this.state.hasDrawnThisTurn = false;

    // If nextPlayer ended their previous turn with 1 card without calling UNO,
    // their vulnerability window expires now that it is their turn again!
    if (this.state.unoVulnerablePlayerId === nextPlayer.id) {
      this.state.unoVulnerablePlayerId = null;
    }
  }

  public getSanitizedStateForPlayer(forPlayerId: string): GameState {
    return {
      ...this.state,
      players: this.state.players.map(p => ({
        ...p,
        cards: p.id === forPlayerId ? p.cards : [],
        cardCount: p.cardCount,
      })),
    };
  }

  // Returns total card count across draw pile, discard pile, and all players' hands (always 108)
  public getTotalCardCount(): number {
    const handCards = this.state.players.reduce((sum, p) => sum + p.cards.length, 0);
    return this.drawPile.length + this.discardPile.length + handCards;
  }
}
