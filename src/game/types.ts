// Core domain types for the 4 Columns game engine.
//
// The engine is intentionally framework-agnostic and pure: every state
// transition is a plain function of (state, action) -> state. No React, no
// timers, no I/O. This makes the rules fully unit-testable and keeps the UI a
// thin rendering layer over a single, authoritative source of truth.

export type CardValue =
  | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const ALL_CARD_VALUES: CardValue[] = [
  -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
];

/** A card is either face-down (hidden) or face-up (revealed). */
export interface Card {
  id: string;
  value: CardValue;
  faceUp: boolean;
}

/**
 * A grid is exactly 12 slots laid out as 3 rows x 4 columns.
 * Index = row * COLS + col. A slot becomes `null` when its whole column has
 * been cleared (three identical face-up cards).
 */
export type Grid = (Card | null)[];

export const ROWS = 3;
export const COLS = 4;
export const GRID_SIZE = ROWS * COLS; // 12

export type Difficulty = "easy" | "normal" | "hard";

/**
 * "solo" — one human (index 0) versus the AI (index 1).
 * "duo"  — two humans sharing the same device (hot-seat / pass-and-play).
 */
export type GameMode = "solo" | "duo";

/**
 * How a two-human game is laid out on the shared device. Purely a display
 * preference — it never affects the game rules.
 * "pass" — "passe le téléphone": the active player always takes the bottom of
 *          the screen; the board flips as play changes hands.
 * "face" — "face à face": each player keeps a fixed side of the device with
 *          their grid oriented toward them (the far side is rotated 180°).
 */
export type DuoLayout = "pass" | "face";

export interface PlayerState {
  id: string;
  name: string;
  isAI: boolean;
  grid: Grid;
  /** Cumulative score across all completed rounds in the current game. */
  totalScore: number;
  /** Score of the most recently completed round (for display). */
  lastRoundScore: number;
  /** One entry per completed round. */
  roundScores: number[];
}

export const ALL_PHASES = [
  "setup", // players are revealing their two initial cards
  "draw", // current player must draw from deck or discard
  "decide", // a card was drawn from the deck: keep or discard it
  "replace", // player must pick a grid slot to place the held card
  "flip", // player discarded the drawn card: pick a face-down card to flip
  "roundOver", // the round finished; scores computed
  "gameOver", // a player passed the score limit; game finished
] as const;

export type GamePhase = (typeof ALL_PHASES)[number];

/** Where the currently held card came from (affects the legal choices). */
export type HeldSource = "deck" | "discard" | null;

export interface GameState {
  /** Solo (vs AI) or duo (two humans on one device). */
  mode: GameMode;
  players: PlayerState[];
  currentPlayer: number;
  deck: Card[];
  discard: Card[];
  phase: GamePhase;
  /** The card the current player is holding (drawn from deck or discard). */
  held: Card | null;
  heldSource: HeldSource;
  /**
   * Index of the player who "closed" the round by revealing their whole grid,
   * or null while the round is still open. Once set, every other player takes
   * exactly one final turn before the round is scored.
   */
  closedBy: number | null;
  /** Round counter within the current game (1-based). */
  round: number;
  /** Score at which the game ends. */
  scoreLimit: number;
  difficulty: Difficulty;
  /**
   * Log of notable events produced by the last transition, for the UI to
   * surface (toasts, sounds, animations). Cleared at the start of each action.
   */
  events: GameEvent[];
  /** RNG seed state, kept in-state so transitions stay pure & reproducible. */
  rngState: number;
}

export type GameEvent =
  | { type: "columnCleared"; player: number; column: number; value: CardValue }
  | {
      type: "cardPlaced";
      player: number;
      index: number;
      placed: CardValue;
      replaced: CardValue;
    }
  | { type: "cardFlipped"; player: number; index: number; value: CardValue }
  | { type: "roundClosed"; player: number }
  | { type: "finalTurn"; player: number }
  | { type: "roundOver"; closedBy: number; penalized: boolean }
  | { type: "gameOver"; winner: number }
  | { type: "firstPlayer"; player: number };

export type GameAction =
  | { type: "revealInitial"; player: number; index: number }
  | { type: "drawFromDeck" }
  | { type: "takeFromDiscard" }
  | { type: "keep" } // keep the drawn deck card -> go place it
  | { type: "discardDrawn" } // discard the drawn deck card -> flip a card
  | { type: "placeAt"; index: number } // place held card at grid slot
  | { type: "flipAt"; index: number }; // flip a face-down grid card
