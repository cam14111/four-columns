import { beforeEach, describe, expect, it } from "vitest";
import { createGame, endRound, reduce } from "../engine";
import {
  clearSavedGame,
  isValidGameState,
  loadSavedGame,
  saveGame,
} from "../persistence";
import { GameState } from "../types";

// Minimal localStorage stand-in for the node test environment.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

beforeEach(() => store.clear());

describe("game persistence", () => {
  it("round-trips an in-progress game exactly (minus events)", () => {
    let s = createGame({ seed: 5, playerName: "Léa" });
    s = reduce(s, { type: "revealInitial", player: 0, index: 0 });
    saveGame(s);
    const loaded = loadSavedGame();
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual({ ...s, events: [] });
  });

  it("validates shape and rejects junk", () => {
    expect(isValidGameState(createGame({ seed: 1 }))).toBe(true);
    expect(isValidGameState(null)).toBe(false);
    expect(isValidGameState({})).toBe(false);
    expect(isValidGameState({ players: [] })).toBe(false);

    store.set("four-columns:game", "not json{");
    expect(loadSavedGame()).toBeNull();
    store.set("four-columns:game", JSON.stringify({ v: 1, state: { players: [] } }));
    expect(loadSavedGame()).toBeNull();
    store.set("four-columns:game", JSON.stringify({ v: 999, state: createGame({ seed: 2 }) }));
    expect(loadSavedGame()).toBeNull();
  });

  it("a finished game is never offered for resume", () => {
    const s = createGame({ seed: 9, scoreLimit: 1 });
    // Force a game-over state through the real scoring path.
    const cloned: GameState = {
      ...s,
      players: s.players.map((p) => ({
        ...p,
        grid: p.grid.map((c) => (c ? { ...c, faceUp: true } : null)),
      })),
      closedBy: 0,
      events: [],
    };
    const over = endRound(cloned);
    expect(over.phase).toBe("gameOver");
    saveGame(over);
    expect(loadSavedGame()).toBeNull();
  });

  it("a pristine never-started game is not saved and evicts a stale save", () => {
    let s = createGame({ seed: 5 });
    s = reduce(s, { type: "revealInitial", player: 0, index: 0 });
    saveGame(s);
    expect(loadSavedGame()).not.toBeNull();
    // Starting a new game writes a pristine state -> the old save must go.
    saveGame(createGame({ seed: 6 }));
    expect(loadSavedGame()).toBeNull();
  });

  it("clearSavedGame removes the save", () => {
    let s = createGame({ seed: 3 });
    s = reduce(s, { type: "revealInitial", player: 0, index: 0 });
    saveGame(s);
    expect(loadSavedGame()).not.toBeNull();
    clearSavedGame();
    expect(loadSavedGame()).toBeNull();
  });
});
