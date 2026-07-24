import { Difficulty, DuoLayout, GameMode } from "./types";

// User settings, persisted locally. No account, no server — a single JSON blob
// in localStorage keyed per concern.

export interface Settings {
  mode: GameMode;
  playerName: string;
  /** Second human's name, used in duo (two-players-on-one-device) mode. */
  player2Name: string;
  /** On-device layout for duo games (pass-the-phone vs. face-to-face). */
  duoLayout: DuoLayout;
  difficulty: Difficulty;
  /** Total at which the game ends (applies to the next game). */
  scoreLimit: number;
  /** Number of seats to open when creating an online game (2..8). */
  onlinePlayers: number;
  sound: boolean;
  haptics: boolean;
  /** Solo coach: suggest and explain the best move on each of your turns. */
  hints: boolean;
}

export const SCORE_LIMITS = [50, 100, 150] as const;

const KEY = "four-columns:settings";

export const DEFAULT_SETTINGS: Settings = {
  mode: "solo",
  playerName: "",
  player2Name: "",
  duoLayout: "pass",
  difficulty: "normal",
  scoreLimit: 100,
  onlinePlayers: 2,
  sound: true,
  haptics: true,
  hints: false,
};

export const loadSettings = (): Settings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = (settings: Settings): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable (private mode) — degrade gracefully */
  }
};
