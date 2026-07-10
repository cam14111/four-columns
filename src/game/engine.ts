import { buildDeck, DECK_MEAN, randomSeed, shuffle } from "./deck";
import {
  Card,
  COLS,
  Difficulty,
  GameAction,
  GameEvent,
  GameMode,
  GameState,
  Grid,
  GRID_SIZE,
  PlayerState,
  ROWS,
} from "./types";

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

export const columnIndices = (col: number): number[] => {
  const out: number[] = [];
  for (let row = 0; row < ROWS; row++) out.push(row * COLS + col);
  return out;
};

/** A round "closes" for a player when they have no face-down cards left. */
export const isGridFullyRevealed = (grid: Grid): boolean =>
  grid.every((c) => c === null || c.faceUp);

export const countFaceUp = (grid: Grid): number =>
  grid.filter((c): c is Card => c !== null && c.faceUp).length;

/** Sum of every remaining (non-cleared) card in a grid. */
export const gridScore = (grid: Grid): number =>
  grid.reduce((sum, c) => sum + (c ? c.value : 0), 0);

/** Sum of only the face-up cards — used for live, in-progress display. */
export const visibleScore = (grid: Grid): number =>
  grid.reduce((sum, c) => (c && c.faceUp ? sum + c.value : sum), 0);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface CreateGameOptions {
  mode?: GameMode;
  playerName?: string;
  /** Second human's name — only used in duo (hot-seat) mode. */
  player2Name?: string;
  difficulty?: Difficulty;
  scoreLimit?: number;
  seed?: number;
}

const dealGrid = (
  deck: Card[],
  from: number
): { grid: Grid; next: number } => {
  const grid: Grid = [];
  for (let i = 0; i < GRID_SIZE; i++) grid.push({ ...deck[from + i], faceUp: false });
  return { grid, next: from + GRID_SIZE };
};

/** Builds a fresh game (new totals) in the "setup" phase. */
export const createGame = (opts: CreateGameOptions = {}): GameState => {
  const mode: GameMode = opts.mode ?? "solo";
  const seed = opts.seed ?? randomSeed();
  const built = buildDeck();
  const shuffled = shuffle(built, seed);
  let cursor = 0;

  const human = dealGrid(shuffled.cards, cursor);
  cursor = human.next;
  const ai = dealGrid(shuffled.cards, cursor);
  cursor = ai.next;

  const firstDiscard: Card = { ...shuffled.cards[cursor], faceUp: true };
  cursor += 1;
  const deck = shuffled.cards.slice(cursor);

  const duo = mode === "duo";
  const players: PlayerState[] = [
    {
      id: "human",
      name: opts.playerName?.trim() || (duo ? "Joueur 1" : "Vous"),
      isAI: false,
      grid: human.grid,
      totalScore: 0,
      lastRoundScore: 0,
      roundScores: [],
    },
    {
      id: duo ? "human2" : "ai",
      name: duo ? opts.player2Name?.trim() || "Joueur 2" : "Ordinateur",
      isAI: !duo,
      grid: ai.grid,
      totalScore: 0,
      lastRoundScore: 0,
      roundScores: [],
    },
  ];

  return {
    mode,
    players,
    currentPlayer: 0,
    deck,
    discard: [firstDiscard],
    phase: "setup",
    held: null,
    heldSource: null,
    closedBy: null,
    round: 1,
    scoreLimit: opts.scoreLimit ?? 100,
    difficulty: opts.difficulty ?? "normal",
    events: [],
    rngState: shuffled.rngState,
  };
};

/** Re-deals grids for the next round, preserving totals and round history. */
export const dealNextRound = (state: GameState): GameState => {
  const built = buildDeck();
  const shuffled = shuffle(built, state.rngState);
  let cursor = 0;

  const grids: Grid[] = [];
  for (let p = 0; p < state.players.length; p++) {
    const dealt = dealGrid(shuffled.cards, cursor);
    cursor = dealt.next;
    grids.push(dealt.grid);
  }

  const firstDiscard: Card = { ...shuffled.cards[cursor], faceUp: true };
  cursor += 1;
  const deck = shuffled.cards.slice(cursor);

  return {
    ...state,
    players: state.players.map((p, i) => ({ ...p, grid: grids[i] })),
    currentPlayer: 0,
    deck,
    discard: [firstDiscard],
    phase: "setup",
    held: null,
    heldSource: null,
    closedBy: null,
    round: state.round + 1,
    events: [],
    rngState: shuffled.rngState,
  };
};

// ---------------------------------------------------------------------------
// Core transitions
// ---------------------------------------------------------------------------

const clone = (state: GameState): GameState => ({
  ...state,
  players: state.players.map((p) => ({ ...p, grid: p.grid.slice() })),
  deck: state.deck.slice(),
  discard: state.discard.slice(),
  events: [],
});

const setGrid = (state: GameState, player: number, grid: Grid): void => {
  state.players[player] = { ...state.players[player], grid };
};

/** Draw the top of the deck, reshuffling the discard back in if needed. */
const drawFromDeckPile = (state: GameState): Card => {
  if (state.deck.length === 0) {
    // Keep the visible top of the discard; shuffle everything else back.
    const top = state.discard[0];
    const rest = state.discard.slice(1).map((c) => ({ ...c, faceUp: false }));
    const reshuffled = shuffle(rest, state.rngState);
    state.deck = reshuffled.cards;
    state.rngState = reshuffled.rngState;
    state.discard = top ? [top] : [];
  }
  return state.deck.shift() as Card;
};

/**
 * After a slot at `index` changes, clear its column if the three cards are all
 * face-up and equal. Returns the (possibly) updated grid and any event.
 */
const applyColumnClear = (
  grid: Grid,
  index: number,
  player: number
): { grid: Grid; event: GameEvent | null; cleared: Card[] } => {
  const col = index % COLS;
  const idxs = columnIndices(col);
  const cards = idxs.map((i) => grid[i]);
  const allPresent = cards.every((c): c is Card => c !== null && c.faceUp);
  if (!allPresent) return { grid, event: null, cleared: [] };
  const value = cards[0].value;
  if (!cards.every((c) => c.value === value)) {
    return { grid, event: null, cleared: [] };
  }
  const next = grid.slice();
  for (const i of idxs) next[i] = null;
  return {
    grid: next,
    event: { type: "columnCleared", player, column: col, value },
    cleared: cards as Card[],
  };
};

/**
 * Finalises the current player's turn: handles column clears already applied,
 * round-close detection, the mandatory final turn for opponents, and passing
 * play to the next player (or ending the round).
 */
const finishTurn = (state: GameState): GameState => {
  const player = state.currentPlayer;
  state.held = null;
  state.heldSource = null;

  if (state.closedBy === null && isGridFullyRevealed(state.players[player].grid)) {
    state.closedBy = player;
    state.events.push({ type: "roundClosed", player });
  }

  const next = (player + 1) % state.players.length;

  if (state.closedBy !== null && next === state.closedBy) {
    return endRound(state);
  }

  state.currentPlayer = next;
  state.phase = "draw";
  if (state.closedBy !== null) {
    state.events.push({ type: "finalTurn", player: next });
  }
  return state;
};

/** Reveals every card, scores the round, and updates totals. */
export const endRound = (state: GameState): GameState => {
  const closedBy = state.closedBy ?? state.currentPlayer;

  // Reveal everything for display.
  state.players = state.players.map((p) => ({
    ...p,
    grid: p.grid.map((c) => (c ? { ...c, faceUp: true } : null)),
  }));

  // The final reveal can complete columns of three identical cards; official
  // rules discard them exactly as during play, before any scoring.
  state.players.forEach((p, playerIndex) => {
    let grid = p.grid;
    for (let col = 0; col < COLS; col++) {
      const idxs = columnIndices(col);
      const cards = idxs.map((i) => grid[i]);
      if (!cards.every((c): c is Card => c !== null)) continue;
      const value = cards[0].value;
      if (!cards.every((c) => c.value === value)) continue;
      grid = grid.slice();
      for (const i of idxs) grid[i] = null;
      for (const c of cards) state.discard.unshift({ ...c, faceUp: true });
      state.events.push({
        type: "columnCleared",
        player: playerIndex,
        column: col,
        value,
      });
    }
    if (grid !== p.grid) setGrid(state, playerIndex, grid);
  });

  const rawScores = state.players.map((p) => gridScore(p.grid));
  const closerScore = rawScores[closedBy];
  const minOther = Math.min(
    ...rawScores.filter((_, i) => i !== closedBy)
  );

  // Skyjo penalty: the player who closed doubles their round score if it is
  // not the strictly lowest, and only when that score is positive.
  const penalized = closerScore > 0 && closerScore >= minOther;

  state.players = state.players.map((p, i) => {
    let round = rawScores[i];
    if (i === closedBy && penalized) round *= 2;
    return {
      ...p,
      lastRoundScore: round,
      roundScores: [...p.roundScores, round],
      totalScore: p.totalScore + round,
    };
  });

  state.events.push({ type: "roundOver", closedBy, penalized });

  const overLimit = state.players.some((p) => p.totalScore >= state.scoreLimit);
  if (overLimit) {
    const winner = lowestTotalIndex(state.players);
    state.phase = "gameOver";
    state.events.push({ type: "gameOver", winner });
  } else {
    state.phase = "roundOver";
  }
  return state;
};

export const lowestTotalIndex = (players: PlayerState[]): number => {
  let best = 0;
  for (let i = 1; i < players.length; i++) {
    if (players[i].totalScore < players[best].totalScore) best = i;
  }
  return best;
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export const reduce = (prev: GameState, action: GameAction): GameState => {
  const state = clone(prev);
  const player = state.currentPlayer;

  switch (action.type) {
    case "revealInitial": {
      if (state.phase !== "setup") return prev;
      const grid = state.players[action.player].grid.slice();
      const card = grid[action.index];
      if (!card || card.faceUp) return prev;
      if (action.player !== state.currentPlayer) return prev;
      if (countFaceUp(grid) >= 2) return prev;
      grid[action.index] = { ...card, faceUp: true };
      setGrid(state, action.player, grid);

      if (countFaceUp(grid) >= 2) {
        // This player is done revealing; move on.
        const everyoneReady = state.players.every(
          (p, i) =>
            (i === action.player ? true : countFaceUp(p.grid) >= 2)
        );
        if (everyoneReady) {
          const first = determineFirstPlayer(state);
          state.currentPlayer = first;
          state.phase = "draw";
          state.events.push({ type: "firstPlayer", player: first });
        } else {
          state.currentPlayer =
            (state.currentPlayer + 1) % state.players.length;
        }
      }
      return state;
    }

    case "drawFromDeck": {
      if (state.phase !== "draw") return prev;
      const card = drawFromDeckPile(state);
      state.held = { ...card, faceUp: true };
      state.heldSource = "deck";
      state.phase = "decide";
      return state;
    }

    case "takeFromDiscard": {
      if (state.phase !== "draw" || state.discard.length === 0) return prev;
      const card = state.discard.shift() as Card;
      state.held = { ...card, faceUp: true };
      state.heldSource = "discard";
      state.phase = "replace";
      return state;
    }

    case "keep": {
      if (state.phase !== "decide" || !state.held) return prev;
      state.phase = "replace";
      return state;
    }

    case "discardDrawn": {
      if (state.phase !== "decide" || !state.held) return prev;
      state.discard.unshift({ ...state.held, faceUp: true });
      state.held = null;
      state.phase = "flip";
      return state;
    }

    case "placeAt": {
      if (state.phase !== "replace" || !state.held) return prev;
      const grid = state.players[player].grid.slice();
      const target = grid[action.index];
      if (!target) return prev;
      // The replaced card is discarded face-up; the held card takes its place.
      state.discard.unshift({ ...target, faceUp: true });
      grid[action.index] = { ...state.held, faceUp: true };
      const cleared = applyColumnClear(grid, action.index, player);
      setGrid(state, player, cleared.grid);
      if (cleared.event) {
        for (const c of cleared.cleared) {
          state.discard.unshift({ ...c, faceUp: true });
        }
        state.events.push(cleared.event);
      }
      return finishTurn(state);
    }

    case "flipAt": {
      if (state.phase !== "flip") return prev;
      const grid = state.players[player].grid.slice();
      const target = grid[action.index];
      if (!target || target.faceUp) return prev;
      grid[action.index] = { ...target, faceUp: true };
      const cleared = applyColumnClear(grid, action.index, player);
      setGrid(state, player, cleared.grid);
      if (cleared.event) {
        for (const c of cleared.cleared) {
          state.discard.unshift({ ...c, faceUp: true });
        }
        state.events.push(cleared.event);
      }
      return finishTurn(state);
    }

    default:
      return prev;
  }
};

/**
 * First player is the one with the highest sum of revealed initial cards.
 * Ties are broken in favour of the human (index 0) for a friendlier start.
 */
export const determineFirstPlayer = (state: GameState): number => {
  let best = 0;
  let bestSum = -Infinity;
  state.players.forEach((p, i) => {
    const sum = visibleScore(p.grid);
    if (sum > bestSum) {
      bestSum = sum;
      best = i;
    }
  });
  return best;
};

// Re-export for convenience.
export { DECK_MEAN };
