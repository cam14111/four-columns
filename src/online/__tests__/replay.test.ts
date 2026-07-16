import { describe, expect, it } from "vitest";
import { gridScore } from "@/game/engine";
import { GRID_SIZE } from "@/game/types";
import {
  fromWireAction,
  generateDeal,
  gridRef,
  isValidGameCode,
  normalizeGameCode,
  OnlineAction,
  parseRef,
  pileSize,
  randomGameCode,
  Seat,
  SecretDeal,
  toWireAction,
} from "../protocol";
import { ReplayConfig, replayGame, ReplayResult, RoundInput } from "../replay";

// ---------------------------------------------------------------------------
// A pure "table of clients" simulator: plays whole games through the exact
// same replay pipeline every phone uses, looking values up in the
// (test-visible) secrets like the real client does through rule-gated peeks.
// ---------------------------------------------------------------------------

const secretValue = (secrets: SecretDeal["secrets"], ref: string): number => {
  const parsed = parseRef(ref);
  if (!parsed) throw new Error(`bad ref ${ref}`);
  return secrets[parsed.area][parsed.index];
};

/** What an honest client would play next (simple but round-closing strategy). */
const nextAction = (
  r: ReplayResult,
  secrets: SecretDeal["secrets"],
  pile: number
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
        parsed.index < pile
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

const NAMES = ["Alice", "Bob", "Carol", "Dave", "Eve", "Fred", "Gil", "Hank"];

const cfgFor = (playerCount: number, maxPlayers = playerCount): ReplayConfig => ({
  names: NAMES.slice(0, playerCount),
  scoreLimit: 100,
  playerCount,
  maxPlayers,
});

interface SimRound {
  input: RoundInput;
  secrets: SecretDeal["secrets"];
}

/** Publishes every missing value, like the seated clients' upkeep would. */
const publishFinals = (r: ReplayResult, current: SimRound): void => {
  const final: Record<string, Record<number, number>> = {
    ...(current.input.final ?? {}),
  };
  for (const m of r.missing) {
    const seatKey = String(m.seat);
    final[seatKey] = final[seatKey] ?? {};
    final[seatKey][m.slot] = secretValue(
      current.secrets,
      gridRef(m.seat, m.slot)
    );
  }
  current.input.final = final;
};

/** Plays one full round (through replayGame after every action, like clients). */
const playRound = (
  cfg: ReplayConfig,
  rounds: SimRound[]
): { result: ReplayResult; inputs: RoundInput[] } => {
  const inputs = () => rounds.map((r) => r.input);
  const current = rounds[rounds.length - 1];
  const pile = pileSize(cfg.maxPlayers);
  for (let guard = 0; guard < 1500; guard++) {
    const r = replayGame(cfg, inputs());
    expect(r.corrupted).toBe(false);
    if (r.awaitingReveal) {
      publishFinals(r, current);
      const done = replayGame(cfg, inputs());
      expect(done.awaitingReveal).toBe(false);
      expect(["roundOver", "gameOver"]).toContain(done.state.phase);
      return { result: done, inputs: inputs() };
    }
    if (r.state.phase === "roundOver" || r.state.phase === "gameOver") {
      return { result: r, inputs: inputs() };
    }
    current.input.actions.push(nextAction(r, current.secrets, pile));
  }
  throw new Error("round did not finish");
};

const newSimRound = (round: number, maxPlayers: number): SimRound => {
  const deal = generateDeal(maxPlayers);
  return {
    secrets: deal.secrets,
    input: { round, discard0: deal.discard0, actions: [], final: {} },
  };
};

describe.each([2, 3, 4, 8])("online replay (%i players)", (n) => {
  const cfg = cfgFor(n);

  it("plays a full round to completion with correct, secret-true scores", () => {
    const rounds = [newSimRound(1, cfg.maxPlayers)];
    const { result } = playRound(cfg, rounds);
    const g = result.state;

    expect(g.players).toHaveLength(n);
    // Every grid card is now revealed and worth its secret value. Card ids
    // are deal refs, so this also holds for cards placed from the pile.
    g.players.forEach((p) => {
      p.grid.forEach((card) => {
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
    // Non-closers are never doubled: their round score equals their grid sum.
    const closer = g.closedBy!;
    g.players.forEach((p, i) => {
      if (i === closer) return;
      expect(p.lastRoundScore).toBe(gridScore(p.grid));
    });
  });

  it("is deterministic: same inputs always produce the same state", () => {
    const rounds = [newSimRound(1, cfg.maxPlayers)];
    const { inputs } = playRound(cfg, rounds);
    const a = replayGame(cfg, inputs);
    const b = replayGame(cfg, inputs);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.cursorRef).toBe(b.cursorRef);
  });

  it("chains rounds, carrying totals, until the score limit ends the game", () => {
    const rounds: SimRound[] = [newSimRound(1, cfg.maxPlayers)];
    let result = playRound(cfg, rounds).result;
    let guard = 0;
    while (result.state.phase !== "gameOver" && guard++ < 40) {
      rounds.push(newSimRound(rounds.length + 1, cfg.maxPlayers));
      result = playRound(cfg, rounds).result;
      const g = result.state;
      expect(g.players[0].roundScores).toHaveLength(rounds.length);
      for (const p of g.players) {
        expect(p.totalScore).toBe(p.roundScores.reduce((s, x) => s + x, 0));
      }
    }
    expect(result.state.phase).toBe("gameOver");
    expect(
      result.state.players.some((p) => p.totalScore >= cfg.scoreLimit)
    ).toBe(true);
  });
});

describe("online replay (specifics)", () => {
  it("plays with fewer players than dealt grids (early start)", () => {
    // 5-seat lobby started with 3 players: grids g3/g4 are never touched and
    // the pile is sized for 5 grids on every client.
    const cfg = cfgFor(3, 5);
    const rounds = [newSimRound(1, 5)];
    const { result } = playRound(cfg, rounds);
    expect(result.state.players).toHaveLength(3);
    expect(["roundOver", "gameOver"]).toContain(result.state.phase);
  });

  it("freezes just before the closing action while values are missing", () => {
    const cfg = cfgFor(3);
    const current = newSimRound(1, 3);
    const pile = pileSize(3);
    for (let guard = 0; guard < 1500; guard++) {
      const r = replayGame(cfg, [current.input]);
      if (r.awaitingReveal) {
        // Held state is playable-looking (not scored), and no missing slot
        // belongs to the closer (their grid is fully revealed).
        expect(r.state.phase).not.toBe("roundOver");
        expect(r.missing.length).toBeGreaterThan(0);
        const closer = r.state.closedBy!;
        expect(r.missing.every((m) => m.seat !== closer)).toBe(true);
        return;
      }
      if (r.state.phase === "roundOver" || r.state.phase === "gameOver") {
        // Rare but legal: nobody had face-down cards left at the close.
        return;
      }
      current.input.actions.push(nextAction(r, current.secrets, pile));
    }
    throw new Error("round did not close");
  });

  it("skips a forfeited player's turns and excludes them from scoring", () => {
    const cfg = cfgFor(4);
    const current = newSimRound(1, 4);
    const pile = pileSize(4);
    let forfeited = false;
    for (let guard = 0; guard < 2000; guard++) {
      let r = replayGame(cfg, [current.input]);
      expect(r.corrupted).toBe(false);
      // As soon as regular play starts, seat 2 leaves.
      if (!forfeited && r.state.phase === "draw") {
        current.input.actions.push({ seat: 2, type: "forfeit" });
        forfeited = true;
        r = replayGame(cfg, [current.input]);
        expect(r.corrupted).toBe(false);
        expect(r.state.players[2].out).toBe(true);
        expect(r.state.currentPlayer).not.toBe(2);
      }
      if (r.awaitingReveal) {
        // The leaver owes nothing.
        expect(r.missing.every((m) => m.seat !== 2)).toBe(true);
        publishFinals(r, current);
        r = replayGame(cfg, [current.input]);
      }
      if (r.state.phase === "roundOver" || r.state.phase === "gameOver") {
        expect(forfeited).toBe(true);
        // The leaver is scored 0 and their totals stay frozen.
        expect(r.state.players[2].roundScores).toEqual([0]);
        expect(r.state.players[2].totalScore).toBe(0);
        // Everyone else scored their grid (closer possibly doubled).
        r.state.players.forEach((p, i) => {
          if (i === 2 || i === r.state.closedBy) return;
          expect(p.lastRoundScore).toBe(gridScore(p.grid));
        });
        return;
      }
      if (forfeited) expect(r.state.currentPlayer).not.toBe(2);
      current.input.actions.push(nextAction(r, current.secrets, pile));
    }
    throw new Error("round did not finish");
  });

  it("unblocks a held reveal when the missing player forfeits", () => {
    const cfg = cfgFor(3);
    const current = newSimRound(1, 3);
    const pile = pileSize(3);
    for (let guard = 0; guard < 1500; guard++) {
      const r = replayGame(cfg, [current.input]);
      expect(r.corrupted).toBe(false);
      if (r.awaitingReveal) {
        // Instead of publishing, every seat that owes values leaves (asleep
        // players excluded by the table). The round must then score without
        // them, using only known values.
        const owing = [...new Set(r.missing.map((m) => m.seat))];
        for (const seat of owing) {
          current.input.actions.push({ seat, type: "forfeit" });
        }
        const done = replayGame(cfg, [current.input]);
        expect(done.corrupted).toBe(false);
        expect(done.awaitingReveal).toBe(false);
        if (owing.length >= 2) {
          // Only the closer remained: last one standing.
          expect(done.state.phase).toBe("gameOver");
        } else {
          expect(["roundOver", "gameOver"]).toContain(done.state.phase);
          for (const seat of owing) {
            expect(done.state.players[seat].out).toBe(true);
            expect(done.state.players[seat].roundScores).toEqual([0]);
          }
        }
        return;
      }
      if (r.state.phase === "roundOver" || r.state.phase === "gameOver") {
        return; // nobody owed anything this game — nothing to assert
      }
      current.input.actions.push(nextAction(r, current.secrets, pile));
    }
    throw new Error("round did not close");
  });

  it("ends the game for the last player standing", () => {
    const cfg = cfgFor(3);
    const current = newSimRound(1, 3);
    const pile = pileSize(3);
    // Let setup complete, then two players leave.
    for (let guard = 0; guard < 50; guard++) {
      const r = replayGame(cfg, [current.input]);
      if (r.state.phase !== "setup") break;
      current.input.actions.push(nextAction(r, current.secrets, pile));
    }
    const r0 = replayGame(cfg, [current.input]);
    const others = [0, 1, 2].filter((s) => s !== r0.state.currentPlayer);
    current.input.actions.push({ seat: others[0], type: "forfeit" });
    current.input.actions.push({ seat: others[1], type: "forfeit" });
    const r = replayGame(cfg, [current.input]);
    expect(r.corrupted).toBe(false);
    expect(r.state.phase).toBe("gameOver");
    expect(r.state.players.filter((p) => !p.out)).toHaveLength(1);
  });

  it("flags an out-of-turn or cross-seat action as corruption", () => {
    const cfg = cfgFor(2);
    const deal = newSimRound(1, 2);
    const r0 = replayGame(cfg, [deal.input]);
    const honest = nextAction(r0, deal.secrets, pileSize(2));
    // Forge the same action from the wrong seat.
    const forged = {
      ...honest,
      seat: 1 - honest.seat,
      ref: gridRef(1 - honest.seat, honest.index!),
    };
    deal.input.actions.push(forged);
    const r1 = replayGame(cfg, [deal.input]);
    // The engine rejects the reveal for the not-yet-active player.
    expect(r1.corrupted).toBe(true);
  });

  it("flags a duplicate forfeit as corruption", () => {
    const cfg = cfgFor(3);
    const current = newSimRound(1, 3);
    current.input.actions.push({ seat: 1, type: "forfeit" });
    current.input.actions.push({ seat: 1, type: "forfeit" });
    expect(replayGame(cfg, [current.input]).corrupted).toBe(true);
  });

  it("survives pile exhaustion via the deterministic internal reshuffle", () => {
    // Drain the pile with draw → keep → replace-a-face-up-card cycles: no new
    // card is ever revealed, so the round never closes and every turn burns
    // one pile card. Past the pile the engine reshuffles the (public) discard
    // deterministically and draws stop needing secret values. Eight dealt
    // grids make the pile as small as it gets (54 cards).
    const cfg = cfgFor(2, 8);
    const pile = pileSize(8);
    const sim = newSimRound(1, 8);
    const input = sim.input;
    for (let i = 0; i < 4; i++) {
      const r = replayGame(cfg, [input]);
      input.actions.push(nextAction(r, sim.secrets, pile));
    }
    let sawExhaustion = false;
    for (let guard = 0; guard < 1200 && !sawExhaustion; guard++) {
      const r = replayGame(cfg, [input]);
      expect(r.corrupted).toBe(false);
      const g = r.state;
      const seat = g.currentPlayer as Seat;
      if (g.phase === "draw") {
        const parsed = parseRef(r.cursorRef)!;
        const inPile = parsed.index < pile;
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
    const r = replayGame(cfg, [input]);
    expect(r.corrupted).toBe(false);
    expect(r.draws).toBeGreaterThan(pile - 1);
  });
});

describe("wire format", () => {
  it("round-trips seats through the string wire encoding", () => {
    const a: OnlineAction = { seat: 7, type: "flip", index: 3, ref: "g7/3", value: 5 };
    const wire = toWireAction(a);
    expect(wire.seat).toBe("7");
    expect(fromWireAction(wire)).toEqual(a);
    expect(fromWireAction({ seat: "9", type: "keep" })).toBeNull();
  });

  it("deals the right number of grids and pile cards", () => {
    for (const n of [2, 5, 8]) {
      const deal = generateDeal(n);
      const areas = Object.keys(deal.secrets);
      expect(areas.filter((a) => a.startsWith("g"))).toHaveLength(n);
      expect(Object.keys(deal.secrets.p)).toHaveLength(pileSize(n));
      expect(deal.discard0).toBe(deal.secrets.p[0]);
    }
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
