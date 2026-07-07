// Local persistence for round scores.
//
// This replaces the former Supabase `round_history` table. Since the game is
// played solo (one human + one AI on a single device), a remote database is
// unnecessary: the score history only needs to survive page reloads on the
// same browser, which localStorage does perfectly, for free and offline.

export interface RoundHistoryRecord {
  id: string;
  player_name: string;
  round_number: number;
  round_score: number;
  created_at: string;
}

const STORAGE_KEY = "four-columns:round-history";

const generateId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const read = (): RoundHistoryRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RoundHistoryRecord[]) : [];
  } catch (error) {
    console.error("Error reading round history from localStorage:", error);
    return [];
  }
};

const write = (records: RoundHistoryRecord[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.error("Error writing round history to localStorage:", error);
  }
};

/** Returns all recorded round scores, ordered by creation time (ascending). */
export const getRoundHistory = (): RoundHistoryRecord[] => {
  return read().sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
};

/** Highest round number recorded so far (0 when the history is empty). */
export const getLastRoundNumber = (): number => {
  return read().reduce(
    (max, record) => Math.max(max, record.round_number),
    0
  );
};

/** Appends new round scores, deduplicating on (player_name, round_number). */
export const addRoundScores = (
  scores: { player_name: string; round_number: number; round_score: number }[]
): void => {
  const existing = read();

  const toInsert = scores
    .filter(
      (score) =>
        !existing.some(
          (record) =>
            record.player_name === score.player_name &&
            record.round_number === score.round_number
        )
    )
    .map((score) => ({
      id: generateId(),
      created_at: new Date().toISOString(),
      ...score,
    }));

  if (toInsert.length > 0) {
    write([...existing, ...toInsert]);
  }
};

/** Clears the whole history (used when starting a brand new game). */
export const clearRoundHistory = (): void => {
  write([]);
};
