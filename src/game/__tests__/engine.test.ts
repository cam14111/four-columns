import { describe, expect, it } from "vitest";
import { buildDeck, cardFrequency, DECK_MEAN } from "../deck";
import {
  columnIndices,
  createGame,
  dealNextRound,
  endRound,
  gridScore,
  isGridFullyRevealed,
  reduce,
  visibleScore,
} from "../engine";
import { aiChooseAction } from "../ai";
import { Card, GameState } from "../types";

const card = (value: number, faceUp = true): Card => ({
  id: `c${value}_${Math.random()}`,
  value: value as Card["value"],
  faceUp,
});

// Build a 12-card face-up grid from explicit values (row-major). Callers pick
// values so no column holds three identical cards (which would auto-clear).
const gridFrom = (values: number[]): Card[] => values.map((v) => card(v, true));

describe("deck", () => {
  it("has the correct 150-card distribution", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(150);
    expect(deck.filter((c) => c.value === -2)).toHaveLength(5);
    expect(deck.filter((c) => c.value === -1)).toHaveLength(10);
    expect(deck.filter((c) => c.value === 0)).toHaveLength(15);
    expect(deck.filter((c) => c.value === 7)).toHaveLength(10);
  });

  it("card ids are unique", () => {
    const ids = new Set(buildDeck().map((c) => c.id));
    expect(ids.size).toBe(150);
  });

  it("deck mean is ~5.07", () => {
    expect(DECK_MEAN).toBeCloseTo(5.0667, 3);
  });
});

describe("setup", () => {
  it("deals two full 12-card grids and a discard, leaving the rest in the deck", () => {
    const s = createGame({ seed: 42 });
    expect(s.players[0].grid).toHaveLength(12);
    expect(s.players[1].grid).toHaveLength(12);
    expect(s.discard).toHaveLength(1);
    // 150 - 12 - 12 - 1 = 125
    expect(s.deck).toHaveLength(125);
    expect(s.phase).toBe("setup");
    expect(s.players[0].grid.every((c) => c && !c.faceUp)).toBe(true);
  });

  it("all 150 cards are accounted for and unique after setup", () => {
    const s = createGame({ seed: 7 });
    const all = [
      ...s.players[0].grid,
      ...s.players[1].grid,
      ...s.discard,
      ...s.deck,
    ].filter(Boolean) as Card[];
    expect(all).toHaveLength(150);
    expect(new Set(all.map((c) => c.id)).size).toBe(150);
  });

  it("reveals two initial cards then moves to next player", () => {
    let s = createGame({ seed: 1 });
    s = reduce(s, { type: "revealInitial", player: 0, index: 0 });
    s = reduce(s, { type: "revealInitial", player: 0, index: 1 });
    // player 0 done -> current player becomes 1
    expect(s.currentPlayer).toBe(1);
    expect(s.players[0].grid.filter((c) => c?.faceUp)).toHaveLength(2);
  });

  it("rejects revealing a third initial card", () => {
    let s = createGame({ seed: 1 });
    s = reduce(s, { type: "revealInitial", player: 0, index: 0 });
    s = reduce(s, { type: "revealInitial", player: 0, index: 1 });
    const before = s;
    // player 0 is no longer current, so this is a no-op
    s = reduce(s, { type: "revealInitial", player: 0, index: 2 });
    expect(s).toBe(before);
  });

  it("transitions to draw and picks a valid first player", () => {
    let s = createGame({ seed: 3 });
    s = reduce(s, { type: "revealInitial", player: 0, index: 0 });
    s = reduce(s, { type: "revealInitial", player: 0, index: 1 });
    s = reduce(s, { type: "revealInitial", player: 1, index: 0 });
    s = reduce(s, { type: "revealInitial", player: 1, index: 1 });
    expect(s.phase).toBe("draw");
    expect([0, 1]).toContain(s.currentPlayer);
    // first player has >= visible sum of the other
    const other = s.currentPlayer === 0 ? 1 : 0;
    expect(visibleScore(s.players[s.currentPlayer].grid)).toBeGreaterThanOrEqual(
      visibleScore(s.players[other].grid)
    );
  });
});

// Helper to force a game into the draw phase with controlled grids.
const draftGame = (
  humanGrid: Card[],
  aiGrid: Card[],
  overrides: Partial<GameState> = {}
): GameState => {
  const base = createGame({ seed: 99 });
  return {
    ...base,
    players: [
      { ...base.players[0], grid: humanGrid },
      { ...base.players[1], grid: aiGrid },
    ],
    currentPlayer: 0,
    phase: "draw",
    ...overrides,
  };
};

describe("drawing and replacing", () => {
  it("draw from deck then keep goes to replace", () => {
    let s = draftGame(
      Array.from({ length: 12 }, () => card(5, false)),
      Array.from({ length: 12 }, () => card(5, false))
    );
    s = reduce(s, { type: "drawFromDeck" });
    expect(s.phase).toBe("decide");
    expect(s.heldSource).toBe("deck");
    s = reduce(s, { type: "keep" });
    expect(s.phase).toBe("replace");
  });

  it("placing a card discards the replaced card and passes turn", () => {
    let s = draftGame(
      [card(12), ...Array.from({ length: 11 }, () => card(5, false))],
      Array.from({ length: 12 }, () => card(5, false))
    );
    s = reduce(s, { type: "drawFromDeck" });
    s = reduce(s, { type: "keep" });
    const held = s.held!;
    s = reduce(s, { type: "placeAt", index: 0 });
    // replaced "12" is now on top of discard, held card is placed
    expect(s.discard[0].value).toBe(12);
    expect(s.players[0].grid[0]!.value).toBe(held.value);
    expect(s.players[0].grid[0]!.faceUp).toBe(true);
    expect(s.currentPlayer).toBe(1);
    expect(s.phase).toBe("draw");
  });

  it("discard-drawn then flip reveals a hidden card", () => {
    // index 5 hidden; column 1 (idx 1,5,9 = 4,6,1) is not a triple, so no clear.
    const humanGrid = gridFrom([3, 4, 7, 8, 5, 6, 9, 10, 2, 1, 0, 11]);
    humanGrid[5] = card(6, false);
    let s = draftGame(
      humanGrid,
      Array.from({ length: 12 }, () => card(5, false))
    );
    s = reduce(s, { type: "drawFromDeck" });
    s = reduce(s, { type: "discardDrawn" });
    expect(s.phase).toBe("flip");
    s = reduce(s, { type: "flipAt", index: 5 });
    expect(s.players[0].grid[5]!.faceUp).toBe(true);
    expect(s.currentPlayer).toBe(1);
  });

  it("taking from discard forces a replace (no discard-back option)", () => {
    let s = draftGame(
      [card(12), ...Array.from({ length: 11 }, () => card(2, false))],
      Array.from({ length: 12 }, () => card(5, false)),
      { discard: [card(-2)] }
    );
    s = reduce(s, { type: "takeFromDiscard" });
    expect(s.phase).toBe("replace");
    expect(s.held!.value).toBe(-2);
  });
});

describe("column clearing", () => {
  it("clears a column of three identical face-up cards", () => {
    // Column 0 = indices 0,4,8. Put 7 at 0 and 4 (face up), 7 hidden at 8.
    const humanGrid = Array.from({ length: 12 }, () => card(5, false));
    humanGrid[0] = card(7, true);
    humanGrid[4] = card(7, true);
    humanGrid[8] = card(7, false); // will be revealed by placing a 7
    let s = draftGame(humanGrid, Array.from({ length: 12 }, () => card(5, false)));
    s = { ...s, phase: "replace", held: card(7), heldSource: "deck" };
    s = reduce(s, { type: "placeAt", index: 8 });
    expect(columnIndices(0).every((i) => s.players[0].grid[i] === null)).toBe(true);
    expect(s.events.some((e) => e.type === "columnCleared")).toBe(true);
  });
});

describe("round scoring", () => {
  it("closer with the strictly lowest score is NOT penalized", () => {
    // Human closes with all cards revealed, low score; AI higher.
    // Rows chosen so no column is a triple (avoids auto-clear). Sum = 4.
    const humanGrid = gridFrom([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    const aiGrid = gridFrom([5, 5, 5, 5, 6, 6, 6, 6, 4, 4, 4, 4]); // 60
    let s = draftGame(humanGrid, aiGrid, {
      phase: "replace",
      held: card(1),
      heldSource: "deck",
    });
    // Human already fully revealed; placing keeps it revealed and closes.
    s = reduce(s, { type: "placeAt", index: 0 });
    // AI gets a final turn: give it a trivial move
    expect(s.closedBy).toBe(0);
    // fast-forward AI's final turn by drawing+discarding+flip (no hidden -> keep/place)
    while (s.phase !== "roundOver" && s.phase !== "gameOver") {
      const a = aiChooseAction(s);
      if (!a) break;
      s = reduce(s, a);
    }
    expect(["roundOver", "gameOver"]).toContain(s.phase);
    expect(s.players[0].lastRoundScore).toBe(4); // not doubled
  });

  it("closer without the lowest score IS penalized (doubled)", () => {
    const humanGrid = gridFrom([5, 5, 5, 5, 6, 6, 6, 6, 4, 4, 4, 4]); // 60
    const aiGrid = gridFrom([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]); // 4
    let s = draftGame(humanGrid, aiGrid, {
      phase: "replace",
      held: card(5),
      heldSource: "deck",
    });
    s = reduce(s, { type: "placeAt", index: 0 });
    while (s.phase !== "roundOver" && s.phase !== "gameOver") {
      const a = aiChooseAction(s);
      if (!a) break;
      s = reduce(s, a);
    }
    // Human closed with 60 >= AI 4 -> doubled to 120
    expect(s.players[0].lastRoundScore).toBe(120);
  });

  it("a non-positive closing score is never penalized", () => {
    // Both grids sum to -8; no column is a triple. Tie, but score < 0.
    const humanGrid = gridFrom([-2, -2, -2, -2, -1, -1, -1, -1, 1, 1, 1, 1]); // -8
    const aiGrid = gridFrom([-2, -2, -2, -2, -1, -1, -1, -1, 1, 1, 1, 1]); // -8
    let s = draftGame(humanGrid, aiGrid, {
      phase: "replace",
      held: card(-2),
      heldSource: "deck",
    });
    s = reduce(s, { type: "placeAt", index: 0 });
    while (s.phase !== "roundOver" && s.phase !== "gameOver") {
      const a = aiChooseAction(s);
      if (!a) break;
      s = reduce(s, a);
    }
    expect(s.players[0].lastRoundScore).toBe(-8); // not doubled despite tie
  });

  it("ends the game when a total passes the score limit", () => {
    const humanGrid = gridFrom([10, 10, 10, 10, 9, 9, 9, 9, 11, 11, 11, 11]); // 120
    const aiGrid = gridFrom([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    let s = draftGame(humanGrid, aiGrid, {
      phase: "replace",
      held: card(10),
      heldSource: "deck",
      scoreLimit: 100,
    });
    s = reduce(s, { type: "placeAt", index: 0 });
    while (s.phase !== "roundOver" && s.phase !== "gameOver") {
      const a = aiChooseAction(s);
      if (!a) break;
      s = reduce(s, a);
    }
    expect(s.phase).toBe("gameOver");
  });
});

describe("end-of-round reveal clears completed columns", () => {
  // endRound mutates its argument (it expects a cloned state) — give it one.
  const cloned = (s: GameState): GameState => ({
    ...s,
    players: s.players.map((p) => ({ ...p, grid: p.grid.slice() })),
    deck: s.deck.slice(),
    discard: s.discard.slice(),
    events: [],
  });

  it("a column completed by the final reveal is discarded before scoring", () => {
    // Human closed with 4. AI holds a hidden 9 completing column 0 (9,9,9);
    // other columns are mixed. Raw sum 63, minus the cleared 27 = 36.
    const humanGrid = gridFrom([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    const aiGrid = gridFrom([9, 5, 6, 7, 9, 8, 4, 3, 9, 2, 1, 0]);
    aiGrid[8] = card(9, false);
    const s = cloned(draftGame(humanGrid, aiGrid, { closedBy: 0 }));
    const r = endRound(s);

    expect(columnIndices(0).every((i) => r.players[1].grid[i] === null)).toBe(true);
    expect(r.players[1].lastRoundScore).toBe(36);
    expect(r.players[0].lastRoundScore).toBe(4); // 4 < 36 -> no penalty
    expect(
      r.events.some((e) => e.type === "columnCleared" && e.player === 1)
    ).toBe(true);
    // The three 9s went to the discard pile.
    expect(r.discard.filter((c) => c.value === 9).length).toBeGreaterThanOrEqual(3);
  });

  it("an opponent's reveal-clear counts before the doubling penalty", () => {
    // Closer sits at 9. The opponent's hidden 12 completes a 12,12,12 column:
    // 39 -> 3, now below the closer, so the closer IS doubled (9 -> 18).
    // Before the fix the opponent scored 39 and the closer kept 9.
    const humanGrid = gridFrom([4, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0]); // 9
    const aiGrid = gridFrom([12, 1, 1, 1, 12, 0, 0, 0, 12, 0, 0, 0]);
    aiGrid[8] = card(12, false);
    const s = cloned(draftGame(humanGrid, aiGrid, { closedBy: 0 }));
    const r = endRound(s);

    expect(r.players[1].lastRoundScore).toBe(3);
    expect(r.players[0].lastRoundScore).toBe(18);
    expect(
      r.events.find((e) => e.type === "roundOver" && e.penalized)
    ).toBeTruthy();
  });
});

describe("full self-play does not crash and conserves cards", () => {
  const cardCount = (s: GameState): number => {
    const all = [
      ...s.players.flatMap((p) => p.grid),
      ...s.discard,
      ...s.deck,
      s.held,
    ].filter(Boolean);
    return all.length;
  };

  it("plays 30 full games (AI vs AI) end to end", () => {
    for (let g = 0; g < 30; g++) {
      let s = createGame({ seed: 1000 + g, difficulty: "hard" });
      // make both players AI to auto-drive
      s = { ...s, players: s.players.map((p) => ({ ...p, isAI: true })) };
      let guard = 0;
      while (s.phase !== "gameOver" && guard < 5000) {
        guard++;
        if (s.phase === "roundOver") {
          s = dealNextRound(s);
          s = { ...s, players: s.players.map((p) => ({ ...p, isAI: true })) };
          continue;
        }
        const a = aiChooseAction(s);
        expect(a).not.toBeNull();
        const before = s;
        s = reduce(s, a!);
        // an action must always make progress (no infinite no-op loop)
        expect(s).not.toBe(before);
        // card conservation (>=150 during a turn because held is separate,
        // exactly 150 at rest)
        expect(cardCount(s)).toBe(150);
      }
      expect(s.phase).toBe("gameOver");
      expect(guard).toBeLessThan(5000);
    }
  });
});
