import { ALL_CARD_VALUES, Card, CardValue } from "./types";

// Deterministic RNG (mulberry32) kept in game state so every transition is a
// pure function and games can be replayed exactly in tests.
export const nextRandom = (state: number): { value: number; state: number } => {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: t >>> 0 };
};

export const randomSeed = (): number =>
  (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;

/**
 * Standard 4 Columns / Skyjo distribution (150 cards):
 *   -2 x5, -1 x10, 0 x15, and 1..12 x10 each.
 */
export const cardFrequency = (value: CardValue): number => {
  if (value === -2) return 5;
  if (value === -1) return 10;
  if (value === 0) return 15;
  return 10;
};

export const buildDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const value of ALL_CARD_VALUES) {
    const freq = cardFrequency(value);
    for (let i = 0; i < freq; i++) {
      deck.push({ id: `${value}_${i}`, value, faceUp: false });
    }
  }
  return deck;
};

/** Fisher–Yates shuffle using the in-state RNG; returns a fresh array + state. */
export const shuffle = (
  cards: Card[],
  rngState: number
): { cards: Card[]; rngState: number } => {
  const result = cards.slice();
  let state = rngState;
  for (let i = result.length - 1; i > 0; i--) {
    const rnd = nextRandom(state);
    state = rnd.state;
    const j = Math.floor(rnd.value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return { cards: result, rngState: state };
};

/** Average value of the full deck — used by the AI as a prior for unknowns. */
export const DECK_MEAN = (() => {
  let sum = 0;
  let count = 0;
  for (const value of ALL_CARD_VALUES) {
    const freq = cardFrequency(value);
    sum += value * freq;
    count += freq;
  }
  return sum / count;
})();
