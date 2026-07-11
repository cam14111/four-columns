// Wire protocol for the online duel mode.
//
// The whole multiplayer design rests on one idea: both clients replay the same
// append-only action log through the existing pure engine (`reduce`), so their
// GameStates — and therefore every animation, score and turn change — are
// derived from identical inputs and never drift.
//
// Hidden information (face-down grid cards, the undrawn pile) lives in a
// `secrets/{code}` subtree that no client can read wholesale. A card's value
// only ever becomes public *embedded in an action*, and the database rules
// verify that the embedded value matches the secret — so a client can neither
// read ahead nor lie about what it drew.
//
// Card references ("refs") are stable string paths into the secret deal:
//   g0/0..g0/11  — seat 0's grid slots (row-major, same order as Grid index)
//   g1/0..g1/11  — seat 1's grid slots
//   p/0          — the initial discard (public from the deal)
//   p/1..p/125   — the draw pile, in draw order
// Refs double as engine card ids, which keeps the replay bookkeeping trivial.

import { buildDeck, randomSeed, shuffle } from "@/game/deck";
import { GRID_SIZE } from "@/game/types";

export type Seat = 0 | 1;

export const otherSeat = (s: Seat): Seat => (s === 0 ? 1 : 0);

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

export const PILE_SIZE = 150 - 2 * GRID_SIZE; // 126: p/0 is the first discard

export interface SecretDeal {
  /** secrets payload: { g0: {0: v, ...}, g1: {...}, p: {0: v, ...} } */
  secrets: {
    g0: Record<number, number>;
    g1: Record<number, number>;
    p: Record<number, number>;
  };
  /** Value of p/0, public from the start (initial discard). */
  discard0: number;
}

/** Shuffles a fresh 150-card deck into the fixed deal layout. */
export const generateDeal = (): SecretDeal => {
  const { cards } = shuffle(buildDeck(), randomSeed());
  const g0: Record<number, number> = {};
  const g1: Record<number, number> = {};
  const p: Record<number, number> = {};
  for (let i = 0; i < GRID_SIZE; i++) g0[i] = cards[i].value;
  for (let i = 0; i < GRID_SIZE; i++) g1[i] = cards[GRID_SIZE + i].value;
  for (let k = 0; k < PILE_SIZE; k++) p[k] = cards[2 * GRID_SIZE + k].value;
  return { secrets: { g0, g1, p }, discard0: p[0] };
};

// ---------------------------------------------------------------------------
// Refs
// ---------------------------------------------------------------------------

export const gridRef = (seat: Seat, slot: number): string => `g${seat}/${slot}`;
export const pileRef = (k: number): string => `p/${k}`;

export const parseRef = (
  ref: string
): { area: "g0" | "g1" | "p"; index: number } | null => {
  const m = /^(g0|g1|p)\/(\d+)$/.exec(ref);
  if (!m) return null;
  return { area: m[1] as "g0" | "g1" | "p", index: Number(m[2]) };
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
  | "flip"; // flip a face-down grid card after discarding the drawn one

export interface OnlineAction {
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

/** Action keys: zero-padded so RTDB key order == play order. */
export const actionKey = (n: number): string =>
  `a${String(n).padStart(4, "0")}`;

export const actionNumber = (key: string): number => Number(key.slice(1));

export const roundKey = (n: number): string => `r${n}`;

export const roundNumber = (key: string): number => Number(key.slice(1));

// ---------------------------------------------------------------------------
// Database layout (types only — paths are built in client.ts)
// ---------------------------------------------------------------------------

export type GameStatus = "waiting" | "playing" | "over";

export interface LobbyInfo {
  status: GameStatus;
  hostName: string;
  scoreLimit: number;
  createdAt: number | object;
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
  turn: Seat;
  /**
   * Engine phase, plus the synthetic "revealing" phase: the round has ended
   * but the last actor still has face-down cards to disclose (their `final`
   * record) before scores can be computed identically everywhere.
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

export type ResultReason = "abandon" | "claim" | "score";

export interface GameResult {
  winner: Seat | -1; // -1 = draw
  reason: ResultReason;
  by: Seat;
}

export interface RoundData {
  deal?: { discard0: number; at?: number | object };
  actions?: Record<string, OnlineAction>;
  /** Final self-reveal of the last actor's remaining face-down slots. */
  final?: Partial<Record<Seat | "0" | "1", Record<number, number>>>;
  peek?: string;
}

/** Opponent absence (ms) before the UI offers to claim the win. Rules enforce 60s. */
export const CLAIM_AFTER_MS = 75_000;

/** A lobby nobody joined for this long is treated as expired client-side. */
export const GAME_EXPIRY_MS = 24 * 60 * 60 * 1000;
