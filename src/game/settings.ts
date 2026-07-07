import { Difficulty } from "./types";

// User settings, persisted locally. No account, no server — a single JSON blob
// in localStorage keyed per concern.

export interface Settings {
  playerName: string;
  difficulty: Difficulty;
  sound: boolean;
  haptics: boolean;
}

const KEY = "four-columns:settings";

export const DEFAULT_SETTINGS: Settings = {
  playerName: "",
  difficulty: "normal",
  sound: true,
  haptics: true,
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
