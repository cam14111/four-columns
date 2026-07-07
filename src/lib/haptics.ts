// Thin wrapper over the Vibration API. Silently no-ops where unsupported
// (desktop, iOS Safari). Controlled by a user setting.

let enabled = true;

export const setHapticsEnabled = (value: boolean): void => {
  enabled = value;
};

type Pattern = "light" | "medium" | "success" | "error" | "select";

const PATTERNS: Record<Pattern, number | number[]> = {
  light: 10,
  medium: 20,
  select: 8,
  success: [18, 40, 18],
  error: [40, 30, 40],
};

export const vibrate = (pattern: Pattern): void => {
  if (!enabled) return;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    /* ignore */
  }
};
