import { Difficulty } from "./types";

// Lightweight player statistics, persisted locally.

export interface Stats {
  gamesPlayed: number;
  gamesWon: number;
  roundsPlayed: number;
  columnsCleared: number;
  bestRoundScore: number | null; // lowest round score achieved (nulls = none)
  bestGameScore: number | null; // lowest winning game total
  currentStreak: number;
  bestStreak: number;
  winsByDifficulty: Record<Difficulty, number>;
}

const KEY = "four-columns:stats";

export const DEFAULT_STATS: Stats = {
  gamesPlayed: 0,
  gamesWon: 0,
  roundsPlayed: 0,
  columnsCleared: 0,
  bestRoundScore: null,
  bestGameScore: null,
  currentStreak: 0,
  bestStreak: 0,
  winsByDifficulty: { easy: 0, normal: 0, hard: 0 },
};

export const loadStats = (): Stats => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATS,
      ...parsed,
      winsByDifficulty: {
        ...DEFAULT_STATS.winsByDifficulty,
        ...(parsed.winsByDifficulty ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
};

export const saveStats = (stats: Stats): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    /* ignore */
  }
};

export const resetStats = (): Stats => {
  const fresh = { ...DEFAULT_STATS, winsByDifficulty: { easy: 0, normal: 0, hard: 0 } };
  saveStats(fresh);
  return fresh;
};

export interface RoundOutcome {
  playerRoundScore: number;
  columnsClearedThisRound: number;
}

export const recordRound = (stats: Stats, outcome: RoundOutcome): Stats => {
  const next: Stats = {
    ...stats,
    roundsPlayed: stats.roundsPlayed + 1,
    columnsCleared: stats.columnsCleared + outcome.columnsClearedThisRound,
    bestRoundScore:
      stats.bestRoundScore === null
        ? outcome.playerRoundScore
        : Math.min(stats.bestRoundScore, outcome.playerRoundScore),
  };
  return next;
};

export interface GameOutcome {
  won: boolean;
  playerTotal: number;
  difficulty: Difficulty;
}

export const recordGame = (stats: Stats, outcome: GameOutcome): Stats => {
  const currentStreak = outcome.won ? stats.currentStreak + 1 : 0;
  return {
    ...stats,
    gamesPlayed: stats.gamesPlayed + 1,
    gamesWon: stats.gamesWon + (outcome.won ? 1 : 0),
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
    bestGameScore:
      outcome.won
        ? stats.bestGameScore === null
          ? outcome.playerTotal
          : Math.min(stats.bestGameScore, outcome.playerTotal)
        : stats.bestGameScore,
    winsByDifficulty: outcome.won
      ? {
          ...stats.winsByDifficulty,
          [outcome.difficulty]: stats.winsByDifficulty[outcome.difficulty] + 1,
        }
      : stats.winsByDifficulty,
  };
};
