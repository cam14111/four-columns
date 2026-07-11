// Local pointer to the online game this device is part of. This is what makes
// "close the app, reopen it, land back in your duel" work: the anonymous
// Firebase uid survives in IndexedDB, and this record tells us which game (and
// which seat) that uid belongs to.

import { Seat } from "./protocol";

export interface OnlineSession {
  code: string;
  seat: Seat;
  name: string;
}

const KEY = "four-columns:online-session";

export const loadOnlineSession = (): OnlineSession | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnlineSession;
    if (
      typeof parsed?.code !== "string" ||
      (parsed?.seat !== 0 && parsed?.seat !== 1)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const saveOnlineSession = (session: OnlineSession): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable — resume won't survive a reload */
  }
};

export const clearOnlineSession = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
