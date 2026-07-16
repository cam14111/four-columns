// Deterministic replay: (deal skeleton + action log [+ final reveals]) → GameState.
//
// Every client feeds the exact same inputs through the exact same pure engine,
// so the projected GameState — grids, piles, scores, whose turn it is — is
// identical on every device by construction. Card values start as placeholders
// (face-down cards are secret) and are injected the moment an action or a
// final reveal makes them public.
//
// The one wrinkle is the end of a round: the engine's endRound() flips every
// remaining face-down card to score them, but their values may still be secret
// at that point. The replay therefore *holds* the round-closing action until
// every player still in the game has published their remaining values (the
// round's `final` records, one per seat); the closing action is then applied
// with real values and scoring proceeds normally. While the closing action is
// held, only forfeits may be appended (a player who never publishes can be
// excluded, which shrinks the requirement instead of stalling the table).
//
// Forfeits travel *in the action log*, so the exact point at which a player
// leaves is totally ordered with the moves around it — every client applies
// them at the same position and stays in lockstep.

import { activeCount, activeSeats, forfeitPlayer, reduce } from "@/game/engine";
import {
  Card,
  CardValue,
  GameAction,
  GameState,
  GRID_SIZE,
  PlayerState,
} from "@/game/types";
import {
  gridRef,
  OnlineAction,
  parseSeat,
  pileRef,
  pileSize,
  Seat,
} from "./protocol";

export interface RoundInput {
  round: number;
  discard0: number;
  /** Actions in play order (sorted by key). */
  actions: OnlineAction[];
  /** Final self-reveals, per seat ("0".."7"): slot → value. */
  final?: Record<string, Record<number, number>>;
}

export interface ReplayConfig {
  /** Display names, by seat. */
  names: string[];
  scoreLimit: number;
  /** Seats actually playing this game (start.count). */
  playerCount: number;
  /** Grids dealt each round (the lobby's maxPlayers) — fixes the pile size. */
  maxPlayers: number;
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
  /** An action in the log was illegal for the engine — peer misbehaving. */
  corrupted: boolean;
  /** Number of actions in the current round (== next action number). */
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
  const players: PlayerState[] = Array.from(
    { length: cfg.playerCount },
    (_, seat) => ({
      id: `seat${seat}`,
      name: cfg.names[seat] ?? `Joueur ${seat + 1}`,
      isAI: false,
      grid: Array.from({ length: GRID_SIZE }, (_, i) =>
        placeholderCard(gridRef(seat, i))
      ),
      totalScore: prev?.players[seat].totalScore ?? 0,
      lastRoundScore: prev?.players[seat].lastRoundScore ?? 0,
      roundScores: prev?.players[seat].roundScores ?? [],
      out: prev?.players[seat].out ?? false,
    })
  );
  return {
    mode: "online",
    players,
    currentPlayer: activeSeats(players)[0] ?? 0,
    deck: Array.from({ length: pileSize(cfg.maxPlayers) - 1 }, (_, j) =>
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
    // must produce the same order on every client.
    rngState: (0xc0ffee ^ round) >>> 0,
  };
};

const setGridValue = (
  state: GameState,
  seat: Seat,
  slot: number,
  value: number
): GameState => {
  const card = state.players[seat]?.grid[slot];
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
    case "forfeit":
      return null; // handled out of band (forfeitPlayer)
  }
};

/** Injects the value an action discloses, then runs it through the engine. */
const applyOnlineAction = (
  state: GameState,
  a: OnlineAction
): GameState | null => {
  if (a.type === "forfeit") {
    const target = state.players[a.seat];
    if (!target || target.out) return null;
    const next = forfeitPlayer(state, a.seat);
    return next === state ? null : next;
  }
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

/** Did `next` score a round that `prev` had not? (endRound ran for real.) */
const scoredRound = (next: GameState, prev: GameState): boolean =>
  next.players.some(
    (p, i) => p.roundScores.length > prev.players[i].roundScores.length
  );

/** Marks a seat out with no turn bookkeeping (used while a close is held). */
const markOut = (state: GameState, seat: Seat): GameState => {
  const players = state.players.slice();
  players[seat] = { ...players[seat], out: true };
  return { ...state, players };
};

export const replayRound = (
  prev: GameState | null,
  cfg: ReplayConfig,
  input: RoundInput
): ReplayResult => {
  let state = initialRoundState(prev, cfg, input.round, input.discard0);
  const final = input.final ?? {};

  // Inject published final values eagerly. This only fixes placeholder values
  // on still-face-down cards — it never flips anything, so it is invisible to
  // gameplay until the engine's endRound reveal actually needs the values.
  for (const [seatKey, values] of Object.entries(final)) {
    const seat = parseSeat(seatKey);
    if (seat === null || seat >= cfg.playerCount || !values) continue;
    for (const [slot, value] of Object.entries(values)) {
      state = setGridValue(state, seat, Number(slot), value as number);
    }
  }

  /**
   * Face-down slots (of players still in the game) whose values are neither
   * published in `final` nor disclosed by the closing action itself.
   */
  const missingFor = (st: GameState, closing: OnlineAction) => {
    const out: { seat: Seat; slot: number }[] = [];
    st.players.forEach((p, seat) => {
      if (p.out) return;
      if (closing.type === "forfeit" && closing.seat === seat) return;
      p.grid.forEach((card, slot) => {
        if (!card || card.faceUp) return;
        if (final[String(seat)]?.[slot] !== undefined) return;
        if (
          (closing.type === "flip" || closing.type === "place") &&
          closing.seat === seat &&
          closing.index === slot
        ) {
          return;
        }
        out.push({ seat, slot });
      });
    });
    return out;
  };

  let corrupted = false;
  let pending: OnlineAction | null = null;
  let missing: { seat: Seat; slot: number }[] = [];
  let draws = 0;

  for (const a of input.actions) {
    if (a.type === "draw") draws += 1;

    if (pending) {
      // A round-closing move is on hold. The database rules only accept
      // forfeits in this window; each one excludes that player from scoring
      // (and from the reveal requirement).
      if (a.type !== "forfeit" || !state.players[a.seat] || state.players[a.seat].out) {
        corrupted = true;
        break;
      }
      state = markOut(state, a.seat);
      if (activeCount(state.players) <= 1) {
        // Everyone else left while the reveal was pending: last one standing.
        const winner = activeSeats(state.players)[0] ?? 0;
        state = {
          ...state,
          held: null,
          heldSource: null,
          phase: "gameOver",
          events: [...state.events, { type: "gameOver", winner }],
        };
        pending = null;
        missing = [];
        continue;
      }
      missing = missing.filter((m) => m.seat !== a.seat);
      if (missing.length === 0) {
        const next = applyOnlineAction(state, pending);
        if (!next) {
          corrupted = true;
          break;
        }
        state = next;
        pending = null;
      }
      continue;
    }

    const next = applyOnlineAction(state, a);
    if (!next) {
      corrupted = true;
      break;
    }
    if (scoredRound(next, state)) {
      const need = missingFor(state, a);
      if (need.length > 0) {
        // Hold just before the closing action until the values arrive.
        pending = a;
        missing = need;
        continue;
      }
    }
    state = next;
  }

  return {
    state,
    awaitingReveal: pending !== null,
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
