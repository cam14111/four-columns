import { GamePhase, GameState, GRID_SIZE } from "./types";

// In-progress game persistence. A mobile PWA gets killed and reloaded all the
// time (backgrounding, OS memory pressure, accidental refresh); saving the
// full GameState after every transition means "Reprendre la partie" always
// works, even across a reload. The state is a plain JSON-serialisable object,
// so a straight stringify round-trips it exactly.

const KEY = "four-columns:game";
const VERSION = 1;

const PHASES: GamePhase[] = [
  "setup",
  "draw",
  "decide",
  "replace",
  "flip",
  "roundOver",
  "gameOver",
];

/** Structural check so a corrupt/foreign blob can never crash the app. */
export const isValidGameState = (value: unknown): value is GameState => {
  if (!value || typeof value !== "object") return false;
  const g = value as GameState;
  return (
    (g.mode === "solo" || g.mode === "duo") &&
    Array.isArray(g.players) &&
    g.players.length === 2 &&
    g.players.every(
      (p) =>
        !!p &&
        typeof p.name === "string" &&
        typeof p.isAI === "boolean" &&
        Array.isArray(p.grid) &&
        p.grid.length === GRID_SIZE &&
        typeof p.totalScore === "number" &&
        Array.isArray(p.roundScores)
    ) &&
    Array.isArray(g.deck) &&
    Array.isArray(g.discard) &&
    PHASES.includes(g.phase) &&
    typeof g.currentPlayer === "number" &&
    g.currentPlayer >= 0 &&
    g.currentPlayer < 2 &&
    typeof g.round === "number" &&
    typeof g.scoreLimit === "number" &&
    typeof g.rngState === "number" &&
    // A decide/replace phase without a held card would soft-lock the game
    // (placeAt/keep are no-ops when nothing is held).
    (!(g.phase === "decide" || g.phase === "replace") ||
      (!!g.held && typeof g.held.value === "number"))
  );
};

export const loadSavedGame = (): GameState | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; state?: unknown };
    if (parsed?.v !== VERSION || !isValidGameState(parsed.state)) return null;
    if (parsed.state.phase === "gameOver") return null;
    // Strip stale events: they already played their sounds/stats before the
    // save, and must not replay those side effects on restore.
    return { ...parsed.state, events: [] };
  } catch {
    return null;
  }
};

/**
 * An untouched first-round setup (no card revealed, no history) is not worth
 * resuming — it is what useGame creates on mount before the player ever
 * presses "Jouer", and offering to "resume" it would be confusing.
 */
const isPristine = (s: GameState): boolean =>
  s.round === 1 &&
  s.phase === "setup" &&
  s.players.every(
    (p) =>
      p.roundScores.length === 0 && p.grid.every((c) => !c || !c.faceUp)
  );

export const saveGame = (state: GameState): void => {
  try {
    if (state.phase === "gameOver" || isPristine(state)) {
      // Also clears any stale save when a brand-new game replaces an old one.
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, state }));
  } catch {
    /* storage unavailable — resume simply won't survive a reload */
  }
};

export const clearSavedGame = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
