// Deterministic replay: (deal skeleton + action log [+ final reveals]) → GameState.
//
// Both clients feed the exact same inputs through the exact same pure engine,
// so the projected GameState — grids, piles, scores, whose turn it is — is
// identical on both phones by construction. Card values start as placeholders
// (face-down cards are secret) and are injected the moment an action makes
// them public.
//
// The one wrinkle is the end of a round: the engine's endRound() flips every
// remaining face-down card to score them, but their values are still secret at
// that point. The replay therefore *intercepts* the closing action and holds
// the round in a synthetic "revealing" state until the last actor has
// published their remaining values (the round's `final` record); the closing
// action is then re-applied with real values and scoring proceeds normally.

import { reduce } from "@/game/engine";
import {
  Card,
  CardValue,
  GameAction,
  GameState,
  GRID_SIZE,
  PlayerState,
} from "@/game/types";
import { gridRef, OnlineAction, PILE_SIZE, pileRef, Seat } from "./protocol";

export interface RoundInput {
  round: number;
  discard0: number;
  /** Actions in play order (sorted by key). */
  actions: OnlineAction[];
  /** Final self-reveals, per seat: slot → value. */
  final?: Partial<Record<"0" | "1", Record<number, number>>>;
}

export interface ReplayConfig {
  names: [string, string];
  scoreLimit: number;
}

export interface ReplayResult {
  state: GameState;
  /**
   * The round has closed but face-down values are still missing; `state` is
   * frozen just before the closing action and the UI should show a
   * "revealing…" beat.
   */
  awaitingReveal: boolean;
  /** Face-down slots whose values are needed to finish the round. */
  missing: { seat: Seat; slot: number }[];
  /** An action in the log was illegal for the engine — peer misbehaved. */
  corrupted: boolean;
  /** Number of actions applied in the current round (== next action number). */
  actionCount: number;
  /** Ref of the next undrawn pile card ("p/17"). */
  cursorRef: string;
  /** Draws made this round (cursor bookkeeping survives pile reshuffles). */
  draws: number;
}

const placeholderCard = (id: string): Card => ({
  id,
  value: 0,
  faceUp: false,
});

/** Fresh engine state for one round, carrying totals from the previous one. */
export const initialRoundState = (
  prev: GameState | null,
  cfg: ReplayConfig,
  round: number,
  discard0: number
): GameState => {
  const players: PlayerState[] = ([0, 1] as Seat[]).map((seat) => ({
    id: `seat${seat}`,
    name: cfg.names[seat],
    isAI: false,
    grid: Array.from({ length: GRID_SIZE }, (_, i) =>
      placeholderCard(gridRef(seat, i))
    ),
    totalScore: prev?.players[seat].totalScore ?? 0,
    lastRoundScore: prev?.players[seat].lastRoundScore ?? 0,
    roundScores: prev?.players[seat].roundScores ?? [],
  }));
  return {
    mode: "online",
    players,
    currentPlayer: 0,
    deck: Array.from({ length: PILE_SIZE - 1 }, (_, j) =>
      placeholderCard(pileRef(j + 1))
    ),
    discard: [{ id: pileRef(0), value: discard0 as CardValue, faceUp: true }],
    phase: "setup",
    held: null,
    heldSource: null,
    closedBy: null,
    round,
    scoreLimit: cfg.scoreLimit,
    // Unused online (no AI) but part of the state shape.
    difficulty: "normal",
    events: [],
    // Fixed seed: the engine's internal pile reshuffle (rare: pile exhausted)
    // must produce the same order on both clients.
    rngState: (0xc0ffee ^ round) >>> 0,
  };
};

const setGridValue = (
  state: GameState,
  seat: Seat,
  slot: number,
  value: number
): GameState => {
  const card = state.players[seat].grid[slot];
  if (!card || card.faceUp) return state;
  const players = state.players.slice();
  const grid = players[seat].grid.slice();
  grid[slot] = { ...card, value: value as CardValue };
  players[seat] = { ...players[seat], grid };
  return { ...state, players };
};

const setDeckTopValue = (state: GameState, value: number): GameState => {
  const top = state.deck[0];
  if (!top) return state;
  const deck = state.deck.slice();
  deck[0] = { ...top, value: value as CardValue };
  return { ...state, deck };
};

const toGameAction = (a: OnlineAction): GameAction | null => {
  switch (a.type) {
    case "reveal":
      return a.index === undefined
        ? null
        : { type: "revealInitial", player: a.seat, index: a.index };
    case "draw":
      return { type: "drawFromDeck" };
    case "takeDiscard":
      return { type: "takeFromDiscard" };
    case "keep":
      return { type: "keep" };
    case "discardDrawn":
      return { type: "discardDrawn" };
    case "place":
      return a.index === undefined ? null : { type: "placeAt", index: a.index };
    case "flip":
      return a.index === undefined ? null : { type: "flipAt", index: a.index };
  }
};

/** Injects the value an action discloses, then runs it through the engine. */
const applyOnlineAction = (
  state: GameState,
  a: OnlineAction
): GameState | null => {
  let st = state;
  if (
    (a.type === "reveal" || a.type === "flip" || a.type === "place") &&
    a.index !== undefined &&
    a.value !== undefined
  ) {
    st = setGridValue(st, a.seat, a.index, a.value);
  } else if (a.type === "draw" && a.value !== undefined) {
    st = setDeckTopValue(st, a.value);
  }
  const ga = toGameAction(a);
  if (!ga) return null;
  // The engine ignores out-of-turn actors implicitly (it acts for
  // currentPlayer); enforce explicitly so a forged log can't act cross-seat.
  if (a.type !== "reveal" && st.currentPlayer !== a.seat) return null;
  const next = reduce(st, ga);
  return next === st ? null : next;
};

/** Face-down slots of both grids, minus the one this action itself reveals. */
const missingAfter = (
  state: GameState,
  closing: OnlineAction
): { seat: Seat; slot: number }[] => {
  const out: { seat: Seat; slot: number }[] = [];
  ([0, 1] as Seat[]).forEach((seat) => {
    state.players[seat].grid.forEach((card, slot) => {
      if (!card || card.faceUp) return;
      if (
        closing.seat === seat &&
        closing.index === slot &&
        (closing.type === "flip" || closing.type === "place")
      ) {
        return;
      }
      out.push({ seat, slot });
    });
  });
  return out;
};

/**
 * Would applying `a` end the round? Mirrors the engine's finishTurn logic
 * without running it (running it would score placeholder values).
 *
 * With two players a round only ever ends on the *non*-closer's turn: the
 * moment a player closes, the opponent gets exactly one final turn, and it is
 * that turn-ending move — with closedBy already set — that finishes the round.
 */
const closesRound = (state: GameState, a: OnlineAction): boolean =>
  (a.type === "place" || a.type === "flip") && state.closedBy !== null;

export const replayRound = (
  prev: GameState | null,
  cfg: ReplayConfig,
  input: RoundInput
): ReplayResult => {
  let state = initialRoundState(prev, cfg, input.round, input.discard0);
  let corrupted = false;
  let awaitingReveal = false;
  let missing: { seat: Seat; slot: number }[] = [];
  let applied = 0;
  let draws = 0;

  for (const a of input.actions) {
    if (a.type === "draw") draws += 1;

    if (closesRound(state, a)) {
      // Inject any published final values first, then check completeness.
      const final = input.final ?? {};
      ([0, 1] as Seat[]).forEach((seat) => {
        const values = final[String(seat) as "0" | "1"];
        if (!values) return;
        for (const [slot, value] of Object.entries(values)) {
          state = setGridValue(state, seat, Number(slot), value as number);
        }
      });
      const known = new Set(
        ([0, 1] as Seat[]).flatMap((seat) => {
          const values = final[String(seat) as "0" | "1"] ?? {};
          return Object.keys(values).map((slot) => `${seat}:${slot}`);
        })
      );
      missing = missingAfter(state, a).filter(
        ({ seat, slot }) => !known.has(`${seat}:${slot}`)
      );
      if (missing.length > 0) {
        awaitingReveal = true;
        break; // hold just before the closing action
      }
    }

    const next = applyOnlineAction(state, a);
    if (!next) {
      corrupted = true;
      break;
    }
    state = next;
    applied += 1;
  }

  return {
    state,
    awaitingReveal,
    missing,
    corrupted,
    actionCount: input.actions.length,
    cursorRef: pileRef(1 + draws),
    draws,
  };
};

/** Replays a whole game (all rounds in order). */
export const replayGame = (
  cfg: ReplayConfig,
  rounds: RoundInput[]
): ReplayResult => {
  let prev: GameState | null = null;
  let last: ReplayResult | null = null;
  for (const round of rounds) {
    last = replayRound(prev, cfg, round);
    if (last.corrupted || last.awaitingReveal) return last;
    prev = last.state;
  }
  return (
    last ?? {
      state: initialRoundState(null, cfg, 1, 0),
      awaitingReveal: false,
      missing: [],
      corrupted: false,
      actionCount: 0,
      cursorRef: pileRef(1),
      draws: 0,
    }
  );
};
