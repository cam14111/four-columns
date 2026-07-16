// Wire protocol for the online live mode (2 to 8 players).
//
// The whole multiplayer design rests on one idea: every client replays the
// same append-only action log through the existing pure engine (`reduce`), so
// their GameStates — and therefore every animation, score and turn change —
// are derived from identical inputs and never drift.
//
// Hidden information (face-down grid cards, the undrawn pile) lives in a
// `secrets/{code}` subtree that no client can read wholesale. A card's value
// only ever becomes public *embedded in an action*, and the database rules
// verify that the embedded value matches the secret — so a client can neither
// read ahead nor lie about what it drew.
//
// Card references ("refs") are stable string paths into the secret deal:
//   g0/0..g0/11    — seat 0's grid slots (row-major, same order as Grid index)
//   …
//   g7/0..g7/11    — seat 7's grid slots (as many grids as the game's
//                    maxPlayers; grids of unfilled seats are simply never read)
//   p/0            — the initial discard (public from the deal)
//   p/1..          — the draw pile, in draw order (150 - 12·maxPlayers cards)
// Refs double as engine card ids, which keeps the replay bookkeeping trivial.
//
// Numbers vs strings on the wire: seat indices that the *database rules* need
// to splice into paths (`state.turn`, an action's `seat`, a result's `by`)
// travel as strings ("0".."7"), because the rules language can only
// concatenate strings. The TypeScript layer keeps seats as numbers and
// converts at the read/write boundary (see `wireSeat` / `parseSeat`).

import { buildDeck, randomSeed, shuffle } from "@/game/deck";
import { GRID_SIZE } from "@/game/types";

/** A seat index. 0 is always the host. */
export type Seat = number;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const wireSeat = (s: Seat): string => String(s);

export const parseSeat = (v: unknown): Seat | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= 0 && n < MAX_PLAYERS ? n : null;
};

// ---------------------------------------------------------------------------
// Game codes
// ---------------------------------------------------------------------------

/** Unambiguous alphabet (no O/0, I/1/L, U/V confusion). 28^6 ≈ 4.8e8 codes. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXZ";
export const CODE_LENGTH = 6;

export const randomGameCode = (): string => {
  let out = "";
  const bytes = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
};

/** Uppercases and strips separators so pasted/typed codes are forgiving. */
export const normalizeGameCode = (raw: string): string =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");

export const isValidGameCode = (code: string): boolean =>
  code.length === CODE_LENGTH &&
  [...code].every((c) => CODE_ALPHABET.includes(c));

// ---------------------------------------------------------------------------
// Deal
// ---------------------------------------------------------------------------

/**
 * Pile size for a deal of `grids` grids (the deck holds 150 cards; p/0 is the
 * first discard). Every round of a game deals `maxPlayers` grids — even when
 * fewer seats ended up playing — so the layout never depends on who joined.
 */
export const pileSize = (grids: number): number => 150 - grids * GRID_SIZE;

export interface SecretDeal {
  /** secrets payload: { g0: {0: v, …}, g1: {…}, …, p: {0: v, …} } */
  secrets: Record<string, Record<number, number>>;
  /** Value of p/0, public from the start (initial discard). */
  discard0: number;
}

/** Shuffles a fresh 150-card deck into the fixed deal layout. */
export const generateDeal = (grids: number): SecretDeal => {
  const { cards } = shuffle(buildDeck(), randomSeed());
  const secrets: SecretDeal["secrets"] = {};
  for (let g = 0; g < grids; g++) {
    const grid: Record<number, number> = {};
    for (let i = 0; i < GRID_SIZE; i++) grid[i] = cards[g * GRID_SIZE + i].value;
    secrets[`g${g}`] = grid;
  }
  const p: Record<number, number> = {};
  const pile = pileSize(grids);
  for (let k = 0; k < pile; k++) p[k] = cards[grids * GRID_SIZE + k].value;
  secrets.p = p;
  return { secrets, discard0: p[0] };
};

// ---------------------------------------------------------------------------
// Refs
// ---------------------------------------------------------------------------

export const gridRef = (seat: Seat, slot: number): string => `g${seat}/${slot}`;
export const pileRef = (k: number): string => `p/${k}`;

export const parseRef = (
  ref: string
): { area: string; index: number } | null => {
  const m = /^(g[0-7]|p)\/(\d+)$/.exec(ref);
  if (!m) return null;
  return { area: m[1], index: Number(m[2]) };
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type OnlineActionType =
  | "reveal" // setup: flip one of the two initial cards
  | "draw" // take the top of the pile
  | "takeDiscard"
  | "keep"
  | "discardDrawn"
  | "place" // put the held card on a grid slot
  | "flip" // flip a face-down grid card after discarding the drawn one
  | "forfeit"; // a player leaves the game (voluntarily or excluded as absent)

export interface OnlineAction {
  /**
   * For play actions: the acting seat (always the turn holder). For
   * "forfeit": the seat *leaving the game* — written either by that player
   * or, when they are absent, by the turn holder on everyone's behalf.
   */
  seat: Seat;
  type: OnlineActionType;
  /** Grid slot for reveal/place/flip. */
  index?: number;
  /**
   * Secret ref whose value this action makes public (rules-verified):
   * the flipped/replaced grid slot, or the drawn pile card.
   */
  ref?: string;
  /** The revealed value (must match the secret at `ref`). */
  value?: number;
  /** Client timestamp, display only. */
  at?: number | object;
}

/** Serialized action as stored in RTDB (seat as a string for the rules). */
export type WireAction = Omit<OnlineAction, "seat"> & { seat: string };

export const toWireAction = (a: OnlineAction): WireAction => ({
  ...a,
  seat: wireSeat(a.seat),
});

export const fromWireAction = (w: WireAction): OnlineAction | null => {
  const seat = parseSeat(w.seat);
  if (seat === null) return null;
  return { ...w, seat };
};

/** Action keys: zero-padded so RTDB key order == play order. */
export const actionKey = (n: number): string =>
  `a${String(n).padStart(4, "0")}`;

export const actionNumber = (key: string): number => Number(key.slice(1));

export const roundKey = (n: number): string => `r${n}`;

export const roundNumber = (key: string): number => Number(key.slice(1));

// ---------------------------------------------------------------------------
// Database layout (types only — paths are built in client.ts)
// ---------------------------------------------------------------------------

export interface LobbyInfo {
  hostName: string;
  scoreLimit: number;
  /** Number of seats the host opened (2..8); grids dealt every round. */
  maxPlayers: number;
  createdAt: number | object;
}

/**
 * Written once when the game actually begins: pins how many seats take part.
 * Auto-written (by any member) the moment the lobby is full, or early by the
 * host once at least two players are seated.
 */
export interface StartInfo {
  count: number;
  at: number | object;
}

export interface SeatInfo {
  uid: string;
  name: string;
}

export interface PublicState {
  /** Current round key, e.g. "r1". */
  round: string;
  /** Key the next action must use, e.g. "a0012". */
  next: string;
  /**
   * Seat allowed to write the next action, as a string ("0".."7") so the
   * database rules can splice it into paths. During the end-of-round reveal
   * ("revealing") it names the seat that wrote the closing action — the one
   * responsible for protocol upkeep until the round is scored.
   */
  turn: string;
  /**
   * Engine phase, plus the synthetic "revealing" phase: the round has ended
   * but some players still have face-down cards to disclose (their `final`
   * records) before scores can be computed identically everywhere.
   */
  phase:
    | "setup"
    | "draw"
    | "decide"
    | "replace"
    | "flip"
    | "revealing";
  /** Ref of the next undrawn pile card, e.g. "p/17". */
  cursorRef: string;
  /**
   * Key of the round that would come after this one ("r2"). The database
   * rules only accept a deal at exactly this key, which pins new rounds to
   * the proper sequence.
   */
  nextRound: string;
}

export interface PresenceInfo {
  online: boolean;
  lastSeen: number | object;
}

export type ResultReason = "abandon" | "claim" | "score" | "forfeit";

export interface GameResult {
  winner: Seat | -1; // -1 = draw
  reason: ResultReason;
  /** Seat that recorded the result, as a string (rules splice it in paths). */
  by: string;
}

export interface RoundData {
  deal?: { discard0: number; at?: number | object };
  actions?: Record<string, WireAction>;
  /** Final self-reveals, per seat: slot → value. */
  final?: Record<string, Record<number, number>>;
  /** Per-seat peek markers (each player peeks their own secrets). */
  peek?: Record<string, string>;
}

/** Player absence (ms) before the UI offers to claim/exclude. Rules enforce 60s. */
export const CLAIM_AFTER_MS = 75_000;

/** A lobby nobody joined for this long is treated as expired client-side. */
export const GAME_EXPIRY_MS = 24 * 60 * 60 * 1000;
