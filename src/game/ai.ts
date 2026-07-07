import { DECK_MEAN } from "./deck";
import { columnIndices, countFaceUp, gridScore, visibleScore } from "./engine";
import { Card, GameAction, GameState, Grid } from "./types";

// The AI is a *policy*: given a state whose current player is the AI, it returns
// the next single action to apply. The host applies actions one at a time (with
// animation delays), calling back in for the next one. Decisions are driven by
// an expected-value model where face-down cards are worth the deck average.

const EST_HIDDEN = DECK_MEAN;

/** Estimated final score of a grid, treating face-down cards as the mean. */
const estScore = (grid: Grid): number =>
  grid.reduce((sum, c) => {
    if (!c) return sum;
    return sum + (c.faceUp ? c.value : EST_HIDDEN);
  }, 0);

/** Simulate placing `value` (face-up) at `index`, clearing the column if done. */
const gridAfterPlace = (grid: Grid, value: number, index: number): Grid => {
  const next = grid.slice();
  next[index] = { id: "sim", value: value as Card["value"], faceUp: true };
  const col = index % 4;
  const idxs = columnIndices(col);
  const cards = idxs.map((i) => next[i]);
  if (
    cards.every((c) => c !== null && c.faceUp) &&
    cards.every((c) => c!.value === cards[0]!.value)
  ) {
    for (const i of idxs) next[i] = null;
  }
  return next;
};

interface Placement {
  index: number;
  gain: number; // reduction in estimated score (higher is better)
}

/** Best slot to place a card of known `value`, by estimated-score reduction. */
const bestPlacement = (grid: Grid, value: number): Placement => {
  const before = estScore(grid);
  let best: Placement = { index: -1, gain: -Infinity };
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === null) continue;
    const after = estScore(gridAfterPlace(grid, value, i));
    const gain = before - after;
    if (gain > best.gain) best = { index: i, gain };
  }
  return best;
};

const faceUpValues = (grid: Grid): number[] =>
  grid.filter((c): c is Card => c !== null && c.faceUp).map((c) => c.value);

const hiddenIndices = (grid: Grid): number[] => {
  const out: number[] = [];
  grid.forEach((c, i) => {
    if (c && !c.faceUp) out.push(i);
  });
  return out;
};

/** Expected gain from drawing an unknown deck card (rough, but effective). */
const expectedDeckGain = (grid: Grid): number => {
  const ups = faceUpValues(grid);
  const worst = ups.length ? Math.max(...ups) : EST_HIDDEN;
  // You'll usually replace your worst face-up card with a roughly average card.
  return Math.max(0, worst - EST_HIDDEN);
};

/** Choose which face-down card to reveal when flipping, avoiding good pairs. */
const chooseFlip = (grid: Grid): number => {
  const hidden = hiddenIndices(grid);
  if (hidden.length === 0) return -1;
  // Prefer flipping in a column that does NOT already hold a matching face-up
  // pair (so we don't waste a potential column completion).
  const scored = hidden.map((i) => {
    const col = i % 4;
    const others = columnIndices(col)
      .filter((j) => j !== i)
      .map((j) => grid[j])
      .filter((c): c is Card => c !== null && c.faceUp);
    let penalty = 0;
    if (others.length === 2 && others[0].value === others[1].value) {
      penalty = 100; // a promising pair — avoid disturbing with a random flip
    }
    return { i, penalty };
  });
  scored.sort((a, b) => a.penalty - b.penalty);
  return scored[0].i;
};

const randomOf = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Endgame awareness (hard mode): would revealing our last hidden card close
 * the round, and if so, are we ahead? Used to avoid self-inflicted penalties.
 */
const closingIsSafe = (state: GameState): boolean => {
  const me = state.currentPlayer;
  const myGrid = state.players[me].grid;
  const myScore = gridScore(myGrid);
  const others = state.players
    .filter((_, i) => i !== me)
    .map((p) => visibleScore(p.grid) + hiddenIndices(p.grid).length * EST_HIDDEN);
  return others.every((o) => myScore < o);
};

export const aiChooseAction = (state: GameState): GameAction | null => {
  const me = state.currentPlayer;
  const player = state.players[me];
  if (!player.isAI) return null;
  const grid = player.grid;
  const difficulty = state.difficulty;
  const mistake =
    difficulty === "easy" ? 0.35 : difficulty === "normal" ? 0.1 : 0;

  switch (state.phase) {
    case "setup": {
      const hidden = hiddenIndices(grid);
      if (hidden.length === 0) return null;
      return { type: "revealInitial", player: me, index: randomOf(hidden) };
    }

    case "draw": {
      const top = state.discard[0];
      const discardGain = top ? bestPlacement(grid, top.value).gain : -Infinity;
      const deckGain = expectedDeckGain(grid);

      if (difficulty === "easy") {
        // Naive: only grab clearly good discards.
        if (top && (top.value <= 3 || discardGain > 4)) {
          return { type: "takeFromDiscard" };
        }
        return { type: "drawFromDeck" };
      }

      if (top && discardGain > 0 && discardGain >= deckGain) {
        if (Math.random() < mistake) return { type: "drawFromDeck" };
        return { type: "takeFromDiscard" };
      }
      return { type: "drawFromDeck" };
    }

    case "decide": {
      const held = state.held!;
      const place = bestPlacement(grid, held.value);
      const canFlip = hiddenIndices(grid).length > 0;

      if (difficulty === "easy") {
        if (held.value <= 5 && place.index !== -1) return { type: "keep" };
        return canFlip ? { type: "discardDrawn" } : { type: "keep" };
      }

      // Hard: don't dig our last card if closing now would be penalized.
      if (
        difficulty === "hard" &&
        canFlip &&
        hiddenIndices(grid).length === 1 &&
        place.gain <= 1 &&
        !closingIsSafe(state)
      ) {
        return { type: "keep" }; // replace instead of flipping the last card
      }

      if (place.gain > 0.5 || !canFlip) {
        if (Math.random() < mistake && canFlip) return { type: "discardDrawn" };
        return { type: "keep" };
      }
      return { type: "discardDrawn" };
    }

    case "replace": {
      const held = state.held!;
      const place = bestPlacement(grid, held.value);
      const index =
        place.index !== -1 ? place.index : firstNonNull(grid);
      return { type: "placeAt", index };
    }

    case "flip": {
      const index = chooseFlip(grid);
      if (index === -1) return null;
      // On easy, sometimes flip a purely random hidden card.
      if (difficulty === "easy" && Math.random() < mistake) {
        const hidden = hiddenIndices(grid);
        return { type: "flipAt", index: randomOf(hidden) };
      }
      return { type: "flipAt", index };
    }

    default:
      return null;
  }
};

const firstNonNull = (grid: Grid): number => {
  for (let i = 0; i < grid.length; i++) if (grid[i] !== null) return i;
  return 0;
};

// Exposed for tests / potential hints.
export { bestPlacement, estScore };
