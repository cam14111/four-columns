import { describe, expect, it } from "vitest";
import { gridScore } from "@/game/engine";
import { GRID_SIZE } from "@/game/types";
import {
  generateDeal,
  gridRef,
  isValidGameCode,
  normalizeGameCode,
  OnlineAction,
  parseRef,
  PILE_SIZE,
  randomGameCode,
  Seat,
  SecretDeal,
} from "../protocol";
import { replayGame, ReplayResult, RoundInput } from "../replay";

// ---------------------------------------------------------------------------
// A pure "client pair" simulator: plays whole games through the exact same
// replay pipeline both phones use, looking values up in the (test-visible)
// secrets like the real client does through rule-gated peeks.
// ---------------------------------------------------------------------------

const secretValue = (secrets: SecretDeal["secrets"], ref: string): number => {
  const parsed = parseRef(ref);
  if (!parsed) throw new Error(`bad ref ${ref}`);
  return secrets[parsed.area][parsed.index];
};

/** What an honest client would play next (simple but round-closing strategy). */
const nextAction = (
  r: ReplayResult,
  secrets: SecretDeal["secrets"]
): OnlineAction => {
  const g = r.state;
  const seat = g.currentPlayer as Seat;
  const grid = g.players[seat].grid;
  switch (g.phase) {
    case "setup": {
      const idx = grid.findIndex((c) => c && !c.faceUp);
      const ref = gridRef(seat, idx);
      return {
        seat,
        type: "reveal",
        index: idx,
        ref,
        value: secretValue(secrets, ref),
      };
    }
    case "draw": {
      const parsed = parseRef(r.cursorRef)!;
      const value =
        parsed.index < PILE_SIZE
          ? secrets.p[parsed.index]
          : (g.deck[0]?.value as number);
      return { seat, type: "draw", ref: r.cursorRef, value };
    }
    case "decide":
      return { seat, type: "keep" };
    case "replace": {
      let idx = grid.findIndex((c) => c && !c.faceUp);
      if (idx < 0) idx = grid.findIndex((c) => c !== null);
      const target = grid[idx]!;
      if (!target.faceUp) {
        const ref = gridRef(seat, idx);
        return {
          seat,
          type: "place",
          index: idx,
          ref,
          value: secretValue(secrets, ref),
        };
      }
      return { seat, type: "place", index: idx };
    }
    case "flip": {
      const idx = grid.findIndex((c) => c && !c.faceUp);
      const ref = gridRef(seat, idx);
      return {
        seat,
        type: "flip",
        index: idx,
        ref,
        value: secretValue(secrets, ref),
      };
    }
    default:
      throw new Error(`no action in phase ${g.phase}`);
  }
};

const CFG = { names: ["Alice", "Bob"] as [string, string], scoreLimit: 100 };

interface SimRound {
  input: RoundInput;
  secrets: SecretDeal["secrets"];
}

/** Plays one full round (through replayGame after every action, like clients). */
const playRound = (
  rounds: SimRound[]
): { result: ReplayResult; inputs: RoundInput[] } => {
  const inputs = () => rounds.map((r) => r.input);
  const current = rounds[rounds.length - 1];
  for (let guard = 0; guard < 500; guard++) {
    const r = replayGame(CFG, inputs());
    expect(r.corrupted).toBe(false);
    if (r.awaitingReveal) {
      // The last actor publishes their remaining face-down values.
      const final: Record<string, Record<number, number>> = {};
      for (const m of r.missing) {
        const seatKey = String(m.seat);
        final[seatKey] = final[seatKey] ?? {};
        final[seatKey][m.slot] = secretValue(
          current.secrets,
          gridRef(m.seat, m.slot)
        );
      }
      current.input.final = final;
      const done = replayGame(CFG, inputs());
      expect(done.awaitingReveal).toBe(false);
      expect(["roundOver", "gameOver"]).toContain(done.state.phase);
      return { result: done, inputs: inputs() };
    }
    if (r.state.phase === "roundOver" || r.state.phase === "gameOver") {
      return { result: r, inputs: inputs() };
    }
    current.input.actions.push(nextAction(r, current.secrets));
  }
  throw new Error("round did not finish");
};

const newSimRound = (round: number): SimRound => {
  const deal = generateDeal();
  return {
    secrets: deal.secrets,
    input: { round, discard0: deal.discard0, actions: [], final: {} },
  };
};

describe("online replay", () => {
  it("plays a full round to completion with correct, secret-true scores", () => {
    const rounds = [newSimRound(1)];
    const { result } = playRound(rounds);
    const g = result.state;

    // Every grid card is now revealed and worth its secret value. Card ids
    // are deal refs, so this also holds for cards placed from the pile.
    ([0, 1] as Seat[]).forEach((seat) => {
      g.players[seat].grid.forEach((card) => {
        if (!card) return; // cleared column
        expect(card.faceUp).toBe(true);
        expect(card.value).toBe(secretValue(rounds[0].secrets, card.id));
      });
    });

    // Scores are consistent: one round recorded, totals match.
    for (const p of g.players) {
      expect(p.roundScores).toHaveLength(1);
      expect(p.totalScore).toBe(p.roundScores[0]);
    }
    // The closer either won the round or was penalised (doubled) — in every
    // case the non-doubled score equals the grid sum.
    const closer = g.closedBy!;
    const other = closer === 0 ? 1 : 0;
    expect(g.players[other].lastRoundScore).toBe(gridScore(g.players[other].grid));
  });

  it("is deterministic: same inputs always produce the same state", () => {
    const rounds = [newSimRound(1)];
    const { inputs } = playRound(rounds);
    const a = replayGame(CFG, inputs);
    const b = replayGame(CFG, inputs);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.cursorRef).toBe(b.cursorRef);
  });

  it("chains rounds, carrying totals, until the score limit ends the game", () => {
    const rounds: SimRound[] = [newSimRound(1)];
    let result = playRound(rounds).result;
    let guard = 0;
    while (result.state.phase !== "gameOver" && guard++ < 30) {
      rounds.push(newSimRound(rounds.length + 1));
      result = playRound(rounds).result;
      const g = result.state;
      expect(g.players[0].roundScores).toHaveLength(rounds.length);
      for (const p of g.players) {
        expect(p.totalScore).toBe(p.roundScores.reduce((s, x) => s + x, 0));
      }
    }
    expect(result.state.phase).toBe("gameOver");
    expect(
      result.state.players.some((p) => p.totalScore >= CFG.scoreLimit)
    ).toBe(true);
  });

  it("freezes just before the closing action while values are missing", () => {
    const rounds = [newSimRound(1)];
    const current = rounds[0];
    for (let guard = 0; guard < 500; guard++) {
      const r = replayGame(CFG, [current.input]);
      if (r.awaitingReveal) {
        // Held state is playable-looking (not scored), and every missing slot
        // belongs to the non-closer (the last actor).
        expect(r.state.phase).not.toBe("roundOver");
        expect(r.missing.length).toBeGreaterThan(0);
        const closer = r.state.closedBy!;
        expect(r.missing.every((m) => m.seat !== closer)).toBe(true);
        return;
      }
      if (r.state.phase === "roundOver" || r.state.phase === "gameOver") {
        // Rare but legal: the last actor had no face-down cards left.
        return;
      }
      current.input.actions.push(nextAction(r, current.secrets));
    }
    throw new Error("round did not close");
  });

  it("flags an out-of-turn or cross-seat action as corruption", () => {
    const deal = newSimRound(1);
    const r0 = replayGame(CFG, [deal.input]);
    const honest = nextAction(r0, deal.secrets);
    // Forge the same action from the wrong seat.
    const forged = { ...honest, seat: (1 - honest.seat) as Seat, ref: gridRef((1 - honest.seat) as Seat, honest.index!) };
    deal.input.actions.push(forged);
    // Setup reveals carry an explicit player; other phases check currentPlayer.
    const r1 = replayGame(CFG, [deal.input]);
    // The engine rejects the reveal for the not-yet-active player.
    expect(r1.corrupted).toBe(true);
  });

  it("survives pile exhaustion via the deterministic internal reshuffle", () => {
    // Drain the pile with draw → keep → replace-a-face-up-card cycles: no new
    // card is ever revealed, so the round never closes and every turn burns
    // one pile card. Past p/125 the engine reshuffles the (public) discard
    // deterministically and draws stop needing secret values.
    const sim = newSimRound(1);
    const input = sim.input;
    for (let i = 0; i < 4; i++) {
      const r = replayGame(CFG, [input]);
      input.actions.push(nextAction(r, sim.secrets));
    }
    let sawExhaustion = false;
    for (let guard = 0; guard < 1200 && !sawExhaustion; guard++) {
      const r = replayGame(CFG, [input]);
      expect(r.corrupted).toBe(false);
      const g = r.state;
      const seat = g.currentPlayer as Seat;
      if (g.phase === "draw") {
        const parsed = parseRef(r.cursorRef)!;
        const inPile = parsed.index < PILE_SIZE;
        const value = inPile
          ? sim.secrets.p[parsed.index]
          : (g.deck[0]?.value as number);
        input.actions.push({ seat, type: "draw", ref: r.cursorRef, value });
        if (!inPile) sawExhaustion = true;
      } else if (g.phase === "decide") {
        input.actions.push({ seat, type: "keep" });
      } else if (g.phase === "replace") {
        const grid = g.players[seat].grid;
        const idx = grid.findIndex((c) => c !== null && c.faceUp);
        expect(idx).toBeGreaterThanOrEqual(0);
        input.actions.push({ seat, type: "place", index: idx });
      } else {
        throw new Error(`unexpected phase ${g.phase}`);
      }
    }
    expect(sawExhaustion).toBe(true);
    const r = replayGame(CFG, [input]);
    expect(r.corrupted).toBe(false);
    expect(r.draws).toBeGreaterThan(PILE_SIZE - 1);
  });
});

describe("game codes", () => {
  it("generates valid, normalizable codes", () => {
    for (let i = 0; i < 50; i++) {
      const code = randomGameCode();
      expect(isValidGameCode(code)).toBe(true);
      expect(normalizeGameCode(` ${code.toLowerCase()} `)).toBe(code);
    }
  });
  it("rejects malformed codes", () => {
    expect(isValidGameCode("")).toBe(false);
    expect(isValidGameCode("ABC")).toBe(false);
    expect(isValidGameCode("ABCDE1")).toBe(false); // '1' not in alphabet
  });
});
