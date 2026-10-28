import { UnoCard, CardColor, CardType } from '../types';

export function createUnoDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  const colors: CardColor[] = ['red', 'yellow', 'green', 'blue'];
  let cardIdCounter = 1;

  for (const color of colors) {
    // One 0 card per color
    deck.push({
      id: `${color}-0-${cardIdCounter++}`,
      color,
      type: 'number',
      value: 0,
    });

    // Two cards each of 1-9 per color
    for (let val = 1; val <= 9; val++) {
      deck.push({
        id: `${color}-${val}-a-${cardIdCounter++}`,
        color,
        type: 'number',
        value: val,
      });
      deck.push({
        id: `${color}-${val}-b-${cardIdCounter++}`,
        color,
        type: 'number',
        value: val,
      });
    }

    // Action cards: 2 of each per color
    const actions: CardType[] = ['skip', 'reverse', 'draw2'];
    for (const action of actions) {
      deck.push({
        id: `${color}-${action}-a-${cardIdCounter++}`,
        color,
        type: action,
        value: -1,
      });
      deck.push({
        id: `${color}-${action}-b-${cardIdCounter++}`,
        color,
        type: action,
        value: -1,
      });
    }
  }

  // Wild cards: 4 Wild, 4 Wild Draw Four
  for (let i = 1; i <= 4; i++) {
    deck.push({
      id: `wild-${i}-${cardIdCounter++}`,
      color: 'wild',
      type: 'wild',
      value: -1,
    });
    deck.push({
      id: `wild4-${i}-${cardIdCounter++}`,
      color: 'wild',
      type: 'wild4',
      value: -1,
    });
  }

  return shuffleDeck(deck);
}

export function shuffleDeck(deck: UnoCard[]): UnoCard[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

