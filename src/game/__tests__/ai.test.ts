import { describe, expect, it } from "vitest";
import { nextRandom } from "../deck";
import {
  createGame,
  dealNextRound,
  lowestTotalIndex,
  reduce,
} from "../engine";
import { aiChooseAction } from "../ai";
import { Card, Difficulty, GameState } from "../types";

const card = (value: number, faceUp = true): Card => ({
  id: `c${value}_${Math.random()}`,
  value: value as Card["value"],
  faceUp,
});

const gridFrom = (values: number[]): Card[] => values.map((v) => card(v, true));

// A hand-crafted position where the AI (seat 1) is to act. Grids are supplied
// explicitly; deck/discard come from a real deal so draws always work.
const aiPosition = (
  humanGrid: Card[],
  aiGrid: Card[],
  overrides: Partial<GameState> = {}
): GameState => {
  const base = createGame({ seed: 99, difficulty: "hard" });
  return {
    ...base,
    players: [
      { ...base.players[0], grid: humanGrid },
      { ...base.players[1], grid: aiGrid },
    ],
    currentPlayer: 1,
    phase: "draw",
    ...overrides,
  };
};

// Deterministic rng for policies with a mistake rate: never triggers mistakes.
const noMistakes = () => 0.99;

describe("expert AI — column completion", () => {
  // AI column 0 holds two face-up 9s with the third card hidden; a 9 sits on
  // the discard. The expert must grab it and finish the column.
  const humanGrid = gridFrom([5, 6, 7, 8, 4, 3, 2, 1, 0, 1, 2, 3]);
  const aiGrid = gridFrom([9, 3, 4, 5, 9, 6, 2, 1, 8, 0, 7, 8]);
  aiGrid[8] = card(8, false); // column 0 third slot hidden
  aiGrid[3] = card(5, false); // a second hidden card: no closing stakes yet

  it("takes a discard that completes one of its columns", () => {
    const s = aiPosition(humanGrid, aiGrid, { discard: [card(9)] });
    expect(aiChooseAction(s)).toEqual({ type: "takeFromDiscard" });
  });

  it("places the completing card on the column's remaining slot", () => {
    const s = aiPosition(humanGrid, aiGrid, {
      phase: "replace",
      held: card(9),
      heldSource: "discard",
    });
    expect(aiChooseAction(s)).toEqual({ type: "placeAt", index: 8 });
  });
});

describe("expert AI — defense", () => {
  // The human shows two 7s in column 0 (third card a face-up 12): a discarded
  // 7 would let them clear 26 points. The expert keeps its drawn 7 and eats a
  // small loss instead of handing over the completion; normal happily tosses.
  const humanGrid = gridFrom([7, 5, 6, 8, 7, 4, 3, 2, 12, 1, 0, 9]);
  const aiGrid = gridFrom([0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1]);
  aiGrid[10] = card(0, false);
  aiGrid[11] = card(1, false);

  const state = () =>
    aiPosition(humanGrid, aiGrid, {
      phase: "decide",
      held: card(7),
      heldSource: "deck",
    });

  it("expert keeps the card rather than feeding the opponent's pair", () => {
    expect(aiChooseAction(state())).toEqual({ type: "keep" });
  });

  it("normal, oblivious to the opponent, discards it", () => {
    const s = { ...state(), difficulty: "normal" as Difficulty };
    expect(aiChooseAction(s, { rng: noMistakes })).toEqual({
      type: "discardDrawn",
    });
  });
});

describe("expert AI — closing judgement", () => {
  it("refuses to close the round when clearly behind", () => {
    // AI has one hidden card left and a terrible board (77 visible); the
    // human sits around 40 expected. Closing would double ~80 points.
    const humanGrid = gridFrom([0, 1, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5]);
    for (let i = 4; i < 12; i++) humanGrid[i] = card(5, false);
    const aiGrid = gridFrom([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 0]);
    aiGrid[11] = card(0, false); // last hidden card

    let s = aiPosition(humanGrid, aiGrid, {
      phase: "decide",
      held: card(0),
      heldSource: "deck",
    });
    // Keep (placing beats digging the last card blind)...
    expect(aiChooseAction(s)).toEqual({ type: "keep" });
    // ...and place anywhere but the hidden slot that would close the round.
    s = { ...s, phase: "replace" };
    const action = aiChooseAction(s);
    expect(action?.type).toBe("placeAt");
    expect((action as { index: number }).index).not.toBe(11);
  });

  it("closes the round when clearly ahead", () => {
    // AI board is nearly perfect (5 visible + one hidden); the human shows 68
    // with four cards still hidden. Locking the round in is right.
    const humanGrid = gridFrom([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    for (let i = 8; i < 12; i++) humanGrid[i] = card(5, false);
    const aiGrid = gridFrom([0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 2]);
    aiGrid[11] = card(2, false); // last hidden card

    let s = aiPosition(humanGrid, aiGrid, {
      phase: "decide",
      held: card(2),
      heldSource: "deck",
    });
    expect(aiChooseAction(s)).toEqual({ type: "keep" });
    s = { ...s, phase: "replace" };
    expect(aiChooseAction(s)).toEqual({ type: "placeAt", index: 11 });
  });
});

describe("expert AI — whole-game awareness", () => {
  // A near-perfect board with one hidden card left (closing = revealing it).
  const closerGrid = () => {
    const g = gridFrom([0, 1, 2, 1, 0, -1, 1, 0, 1, 0, 1, 5]);
    g[11] = card(5, false); // last hidden card
    return g;
  };
  // A modest opponent board: 13 visible, 4 hidden -> round estimate ~32.
  const oppGrid = () => {
    const g = gridFrom([3, 2, 4, 1, 5, 5, 5, 5, 0, 1, 2, 0]);
    for (let i = 4; i < 8; i++) g[i] = card(5, false);
    return g;
  };

  const withTotals = (me: number, opp: number): GameState => {
    const s = aiPosition(oppGrid(), closerGrid(), {
      phase: "replace",
      held: card(1),
      heldSource: "deck",
    });
    s.players = [
      { ...s.players[0], totalScore: opp },
      { ...s.players[1], totalScore: me },
    ];
    return s;
  };

  it("closes a safe round when the game is not at stake", () => {
    // Totals far from the limit: closing at ~7 vs ~32 is plainly right.
    expect(aiChooseAction(withTotals(0, 0))).toEqual({
      type: "placeAt",
      index: 11,
    });
  });

  it("refuses to end the game in a losing position", () => {
    // Same board, but we sit at 95/100: closing adds ~7 -> 102, game over,
    // and the opponent (50 + ~30) finishes below us. Round-safe, game-fatal.
    const action = aiChooseAction(withTotals(95, 50));
    expect(action?.type).toBe("placeAt");
    expect((action as { index: number }).index).not.toBe(11);
  });

  it("ends the game through the doubling penalty to bust the rival", () => {
    // We hold 11 visible + one hidden; the rival shows a tiny board but sits
    // at 95/100. Closing scores us ~12 >= their ~4: doubled to ~24. Still a
    // win — any round score busts them past the limit while we stay lower.
    const humanGrid = gridFrom([1, 0, 2, 1, 0, 0, 1, 0, 0, 0, 0, 0]);
    humanGrid[11] = card(0, false); // one hidden -> their est stays tiny
    const aiGrid = gridFrom([2, 1, 3, 1, 0, 2, 1, 0, 1, 0, 0, 6]);
    aiGrid[11] = card(6, false); // our last hidden card

    const base = aiPosition(humanGrid, aiGrid, {
      phase: "replace",
      held: card(1),
      heldSource: "deck",
    });

    // Neutral totals: closing while not the lowest would just double us.
    const neutral = { ...base };
    const a1 = aiChooseAction(neutral);
    expect((a1 as { index: number }).index).not.toBe(11);

    // Rival at 95: closing ends the game with us far below their total.
    const endgame = { ...base };
    endgame.players = [
      { ...endgame.players[0], totalScore: 95 },
      { ...endgame.players[1], totalScore: 40 },
    ];
    expect(aiChooseAction(endgame)).toEqual({ type: "placeAt", index: 11 });
  });

  it("races to reveal when clearly ahead in the round", () => {
    // Two hidden cards left on a strong board, a drawn 5 in hand: covering
    // the visible 6 gains a point now, covering a hidden slot gains about
    // nothing — but reveals a card, marching the round toward its end.
    // Ahead (opponent all face-down, huge estimate), the expert prefers the
    // hidden slot; with no lead, it just takes the visible point.
    const mine = () => {
      const g = gridFrom([6, 3, 2, 1, 0, -1, 1, 2, 5, 5, 0, -1]);
      g[8] = card(5, false);
      g[9] = card(5, false);
      return g;
    };
    const held = { phase: "replace" as const, held: card(5), heldSource: "deck" as const };

    const allHidden = Array.from({ length: 12 }, () => card(5, false));
    const ahead = aiPosition(allHidden, mine(), held);
    const aheadAction = aiChooseAction(ahead) as { index: number };
    expect([8, 9]).toContain(aheadAction.index);

    const lowOpp = gridFrom([1, 0, 2, 1, 0, 1, 0, 1, 2, 0, 1, 1]);
    const noLead = aiPosition(lowOpp, mine(), held);
    expect(aiChooseAction(noLead)).toEqual({ type: "placeAt", index: 0 });
  });
});

describe("expert AI — plays without hidden information", () => {
  it("decisions are unchanged when face-down values are permuted", () => {
    // Same public position, different hidden truth: the policy must not care.
    const humanGrid = gridFrom([5, 6, 7, 8, 4, 3, 2, 1, 0, 1, 2, 3]);
    const build = (a: number, b: number) => {
      const aiGrid = gridFrom([9, 3, 4, 5, 9, 6, 2, 1, 8, 0, 7, 8]);
      aiGrid[8] = card(a, false);
      aiGrid[3] = card(b, false);
      return aiGrid;
    };
    const phases: Partial<GameState>[] = [
      { phase: "draw", discard: [card(6)] },
      { phase: "decide", held: card(4), heldSource: "deck" },
      { phase: "replace", held: card(4), heldSource: "deck" },
      { phase: "flip" },
    ];
    for (const overrides of phases) {
      const s1 = aiPosition(humanGrid, build(-2, 12), overrides);
      const s2 = aiPosition(humanGrid, build(12, -2), overrides);
      expect(aiChooseAction(s1)).toEqual(aiChooseAction(s2));
    }
  });
});

// ---------------------------------------------------------------------------
// Balance simulations — each level must beat the one below it
// ---------------------------------------------------------------------------

const makeRng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    const r = nextRandom(s);
    s = r.state;
    return r.value;
  };
};

/** Full AI-vs-AI game; returns the winning seat (0 or 1). */
const playGame = (d0: Difficulty, d1: Difficulty, seed: number): number => {
  let s = createGame({ seed, difficulty: "hard", scoreLimit: 100 });
  s = { ...s, players: s.players.map((p) => ({ ...p, isAI: true })) };
  const rng = makeRng(seed ^ 0x9e3779b9);
  let guard = 0;
  while (s.phase !== "gameOver") {
    if (++guard > 8000) throw new Error(`stalled game (seed ${seed})`);
    if (s.phase === "roundOver") {
      s = dealNextRound(s);
      s = { ...s, players: s.players.map((p) => ({ ...p, isAI: true })) };
      continue;
    }
    const difficulty = s.currentPlayer === 0 ? d0 : d1;
    const a = aiChooseAction(s, { difficulty, rng });
    if (!a) throw new Error(`no action in phase ${s.phase} (seed ${seed})`);
    s = reduce(s, a);
  }
  return lowestTotalIndex(s.players);
};

/** Win rate of `a` against `b`, alternating seats to cancel any seat bias. */
const winRate = (
  a: Difficulty,
  b: Difficulty,
  games: number,
  seedBase: number
): number => {
  let wins = 0;
  for (let g = 0; g < games; g++) {
    const aFirst = g % 2 === 0;
    const winner = aFirst
      ? playGame(a, b, seedBase + g)
      : playGame(b, a, seedBase + g);
    if ((aFirst && winner === 0) || (!aFirst && winner === 1)) wins++;
  }
  return wins / games;
};

describe("AI balance (fixed-seed simulations)", () => {
  const GAMES = 120;

  it("expert clearly beats easy", () => {
    const rate = winRate("hard", "easy", GAMES, 10_000);
    console.log(`expert vs easy: ${rate}`);
    expect(rate).toBeGreaterThanOrEqual(0.85);
  });

  it("expert beats normal", () => {
    const rate = winRate("hard", "normal", GAMES, 20_000);
    console.log(`expert vs normal: ${rate}`);
    expect(rate).toBeGreaterThanOrEqual(0.7);
  });

  it("normal beats easy", () => {
    const rate = winRate("normal", "easy", GAMES, 30_000);
    console.log(`normal vs easy: ${rate}`);
    expect(rate).toBeGreaterThanOrEqual(0.62);
  });
});
