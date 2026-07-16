// The online game client: one instance per joined game (2 to 8 players).
//
// Responsibilities:
//   • create / join / resume a game (anonymous auth, seat claiming)
//   • run the lobby: seats fill up, the game auto-starts when full, or the
//     host starts early with everyone already seated (the `start` node pins
//     how many seats play; the rules verify it matches the seated players)
//   • mirror the public game tree into a local model and project it through
//     the pure engine (replay.ts) into a regular GameState for the UI
//   • turn UI GameActions into protocol writes (with the peek→read→write
//     dance that discloses secret card values under database-rule control)
//   • keep the protocol moving by reacting to state, not to callbacks:
//     final reveals, next-round deals, results, leave-intent conversions and
//     interrupted moves are all detected from the replayed state and
//     (re)executed idempotently — which is exactly what makes refreshes and
//     reconnections safe at any moment.
//   • presence (onDisconnect) so everyone can see who is connected
//
// Departures never stall the table: a voluntary leaver posts a `leave` intent
// that the current turn holder converts into a rules-checked `forfeit` action
// in the log; an absent player can be excluded by the others (the rules
// verify 60s of absence). With two players the classic duel endings (abandon,
// claimed victory) are kept as-is.

import {
  Database,
  DataSnapshot,
  get,
  onChildAdded,
  onChildRemoved,
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import { GameAction, GameState } from "@/game/types";
import { activeCount, activeSeats, lowestTotalIndex } from "@/game/engine";
import { ensureSignedIn } from "./firebase";
import {
  actionKey,
  CLAIM_AFTER_MS,
  fromWireAction,
  GAME_EXPIRY_MS,
  GameResult,
  generateDeal,
  gridRef,
  isValidGameCode,
  LobbyInfo,
  MAX_PLAYERS,
  MIN_PLAYERS,
  normalizeGameCode,
  OnlineAction,
  pileRef,
  pileSize,
  PublicState,
  randomGameCode,
  roundKey,
  roundNumber,
  Seat,
  SeatInfo,
  StartInfo,
  toWireAction,
  WireAction,
  wireSeat,
} from "./protocol";
import { replayGame, ReplayResult, RoundInput } from "./replay";
import { clearOnlineSession, saveOnlineSession } from "./session";

export type OnlineErrorCode =
  | "not-found"
  | "full"
  | "started"
  | "expired"
  | "network"
  | "corrupted";

export class OnlineError extends Error {
  code: OnlineErrorCode;
  constructor(code: OnlineErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

/** Everything the UI needs to know about one seat. */
export interface OnlinePlayerMeta {
  seat: Seat;
  name: string;
  isMe: boolean;
  online: boolean;
  lastSeen: number | null;
  /** Left the game (forfeit applied or leave intent posted). */
  out: boolean;
  /** Pressed "next round" on the round-over panel. */
  ready: boolean;
  /**
   * This player is holding the table up (their turn, their reveal, or the
   * next-round handshake) while being away — the others may exclude them.
   */
  canExclude: boolean;
}

export interface OnlineSnapshot {
  status: "lobby" | "playing" | "over";
  code: string;
  mySeat: Seat;
  /** Seats the host opened. */
  maxPlayers: number;
  /** Seats actually playing (0 while the lobby is still filling). */
  playerCount: number;
  isHost: boolean;
  started: boolean;
  /** The host may start now with everyone currently seated. */
  canStartEarly: boolean;
  /** Seated players, by seat. In the lobby this grows as players join. */
  players: OnlinePlayerMeta[];
  scoreLimit: number;
  /** Projected engine state; null until the game has started. */
  game: GameState | null;
  /** Round closed, waiting for the last face-down cards to be disclosed. */
  awaitingReveal: boolean;
  /** The action log failed engine validation — peer client misbehaving. */
  corrupted: boolean;
  myTurn: boolean;
  /** Two-player games: the absent opponent's win may be claimed (legacy). */
  canClaimVictory: boolean;
  /** My own realtime-database link. */
  connected: boolean;
  result: GameResult | null;
  myNextReady: boolean;
  rematchCode: string | null;
  /** Last action appended after attach — drives remote-move sounds. */
  lastAction: (OnlineAction & { key: string }) | null;
  /** A write is in flight (locks the UI against double-taps). */
  busy: boolean;
}

interface RoundModel {
  discard0: number | null;
  actions: Map<string, OnlineAction>;
  final: Record<string, Record<number, number>>;
}

type Unsub = () => void;
type Flags = Record<string, boolean | undefined>;

const P = {
  game: (c: string) => `games/${c}`,
  lobby: (c: string) => `games/${c}/lobby`,
  seats: (c: string) => `games/${c}/seats`,
  seat: (c: string, s: Seat) => `games/${c}/seats/${s}`,
  start: (c: string) => `games/${c}/start`,
  state: (c: string) => `games/${c}/state`,
  presence: (c: string, s: Seat) => `games/${c}/presence/${s}`,
  leave: (c: string, s: Seat) => `games/${c}/leave/${s}`,
  forfeits: (c: string) => `games/${c}/forfeits`,
  forfeit: (c: string, s: Seat) => `games/${c}/forfeits/${s}`,
  result: (c: string) => `games/${c}/result`,
  nextReady: (c: string) => `games/${c}/nextReady`,
  rematch: (c: string) => `games/${c}/rematch`,
  rounds: (c: string) => `games/${c}/rounds`,
  deal: (c: string, r: string) => `games/${c}/rounds/${r}/deal`,
  action: (c: string, r: string, a: string) =>
    `games/${c}/rounds/${r}/actions/${a}`,
  final: (c: string, r: string, s: Seat) =>
    `games/${c}/rounds/${r}/final/${s}`,
  peek: (c: string, r: string, s: Seat) => `games/${c}/rounds/${r}/peek/${s}`,
  secrets: (c: string) => `secrets/${c}`,
  secretRound: (c: string, r: string) => `secrets/${c}/${r}`,
  secretCard: (c: string, r: string, cardRef: string) =>
    `secrets/${c}/${r}/${cardRef}`,
};

export class OnlineGame {
  readonly code: string;
  readonly mySeat: Seat;
  private db: Database;
  private uid: string;

  private lobby: LobbyInfo | null = null;
  private seats: Record<string, SeatInfo | undefined> = {};
  private start: StartInfo | null = null;
  private presence: Record<
    string,
    { online?: boolean; lastSeen?: number } | undefined
  > = {};
  private result: GameResult | null = null;
  private nextReadyFlags: Flags = {};
  private leaveFlags: Flags = {};
  private forfeitFlags: Flags = {};
  private rematchCode: string | null = null;
  private rounds = new Map<string, RoundModel>();
  private connected = false;

  private replay: ReplayResult | null = null;
  private snapshot: OnlineSnapshot;
  private listeners = new Set<() => void>();
  private unsubs: Unsub[] = [];
  private roundUnsubs = new Map<string, Unsub[]>();
  private destroyed = false;
  private busy = false;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /** False during the initial sync — actions ingested then are not "live". */
  private live = false;
  private lastAction: (OnlineAction & { key: string }) | null = null;
  private orphanChecked = false;

  private constructor(db: Database, uid: string, code: string, seat: Seat) {
    this.db = db;
    this.uid = uid;
    this.code = code;
    this.mySeat = seat;
    this.snapshot = this.buildSnapshot();
  }

  // -------------------------------------------------------------------------
  // Entry points
  // -------------------------------------------------------------------------

  static async create(
    name: string,
    scoreLimit: number,
    maxPlayers: number
  ): Promise<OnlineGame> {
    const players = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, maxPlayers));
    const { uid, db } = await ensureSignedIn();
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomGameCode();
      const deal = generateDeal(players);
      const payload: Record<string, unknown> = {
        [P.game(code)]: {
          lobby: {
            hostName: name,
            scoreLimit,
            maxPlayers: players,
            createdAt: serverTimestamp(),
          },
          seats: { 0: { uid, name } },
          state: {
            round: "r1",
            next: actionKey(0),
            turn: "0",
            phase: "setup",
            cursorRef: pileRef(1),
            nextRound: "r2",
          },
          rounds: {
            r1: { deal: { discard0: deal.discard0, at: serverTimestamp() } },
          },
        },
        [`${P.secrets(code)}/r1`]: deal.secrets,
      };
      try {
        await update(ref(db), payload);
        saveOnlineSession({ code, seat: 0, name });
        const game = new OnlineGame(db, uid, code, 0);
        await game.attach();
        return game;
      } catch (e) {
        lastErr = e; // code collision or transient error — retry with a new code
      }
    }
    throw new OnlineError("network", String(lastErr));
  }

  static async join(rawCode: string, name: string): Promise<OnlineGame> {
    const code = normalizeGameCode(rawCode);
    if (!isValidGameCode(code)) throw new OnlineError("not-found");
    const { uid, db } = await ensureSignedIn();

    const lobbySnap = await get(ref(db, P.lobby(code))).catch(() => {
      throw new OnlineError("network");
    });
    if (!lobbySnap.exists()) throw new OnlineError("not-found");
    const lobby = lobbySnap.val() as LobbyInfo;
    const maxPlayers = lobby.maxPlayers ?? 2;

    // Claim the lowest free seat; on a race, re-read and try the next one.
    for (let attempt = 0; attempt < MAX_PLAYERS; attempt++) {
      const seatsSnap = await get(ref(db, P.seats(code)));
      const seats = (seatsSnap.val() ?? {}) as Record<
        string,
        SeatInfo | undefined
      >;

      // Already seated (own link, reinstall, second tab): just re-attach.
      for (let s = 0; s < maxPlayers; s++) {
        if (seats[String(s)]?.uid === uid) {
          saveOnlineSession({ code, seat: s, name });
          const game = new OnlineGame(db, uid, code, s);
          await game.attach();
          return game;
        }
      }

      const startSnap = await get(ref(db, P.start(code)));
      if (startSnap.exists()) throw new OnlineError("started");

      let free = -1;
      for (let s = 1; s < maxPlayers; s++) {
        if (!seats[String(s)]) {
          free = s;
          break;
        }
      }
      if (free === -1) throw new OnlineError("full");
      const createdAt =
        typeof lobby.createdAt === "number" ? lobby.createdAt : 0;
      if (createdAt && Date.now() - createdAt > GAME_EXPIRY_MS) {
        throw new OnlineError("expired");
      }

      try {
        await set(ref(db, P.seat(code, free)), { uid, name });
        saveOnlineSession({ code, seat: free, name });
        const game = new OnlineGame(db, uid, code, free);
        await game.attach();
        return game;
      } catch {
        // Someone else claimed the seat (or the game just started) between
        // our read and write — loop and look again.
      }
    }
    throw new OnlineError("full");
  }

  /** Reattaches to a game this device already sits in (reload, app restart). */
  static async resume(code: string): Promise<OnlineGame> {
    const { uid, db } = await ensureSignedIn();
    const seatsSnap = await get(ref(db, P.seats(code))).catch(() => {
      throw new OnlineError("network");
    });
    if (!seatsSnap.exists()) throw new OnlineError("not-found");
    const seats = seatsSnap.val() as Record<string, SeatInfo | undefined>;
    let mySeat: Seat | null = null;
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (seats[String(s)]?.uid === uid) {
        mySeat = s;
        break;
      }
    }
    if (mySeat === null) throw new OnlineError("not-found");
    const game = new OnlineGame(db, uid, code, mySeat);
    await game.attach();
    return game;
  }

  // -------------------------------------------------------------------------
  // Subscriptions & projection
  // -------------------------------------------------------------------------

  private async attach(): Promise<void> {
    const c = this.code;

    // Initial full read so the very first snapshot is complete (and so we can
    // distinguish pre-existing actions from live ones for sound cues).
    const rootSnap = await get(ref(this.db, P.game(c)));
    if (rootSnap.exists()) this.ingestGame(rootSnap);
    this.live = true;

    const listen = (path: string, cb: (s: DataSnapshot) => void) => {
      const u = onValue(ref(this.db, path), cb, () => {
        /* permission/network hiccup — the connected flag covers UX */
      });
      this.unsubs.push(u);
    };

    // Terminal facts (result, seats, lobby, start) are kept sticky: a remote
    // cleanup that deletes the game must not blank the screen a loser is
    // still reading.
    listen(P.lobby(c), (s) => {
      this.lobby = (s.val() as LobbyInfo) ?? this.lobby;
      this.recompute();
    });
    listen(P.seats(c), (s) => {
      const v = (s.val() ?? {}) as typeof this.seats;
      if (v["0"]) this.seats = v;
      this.recompute();
    });
    listen(P.start(c), (s) => {
      this.start = (s.val() as StartInfo) ?? this.start;
      this.recompute();
    });
    listen(P.result(c), (s) => {
      this.result = (s.val() as GameResult) ?? this.result;
      this.recompute();
    });
    listen(P.nextReady(c), (s) => {
      this.nextReadyFlags = (s.val() ?? {}) as Flags;
      this.recompute();
    });
    listen(`${P.game(c)}/leave`, (s) => {
      this.leaveFlags = (s.val() ?? {}) as Flags;
      this.recompute();
    });
    listen(P.forfeits(c), (s) => {
      const v = (s.val() ?? {}) as Flags;
      this.forfeitFlags = Object.keys(v).length ? v : this.forfeitFlags;
      this.recompute();
    });
    listen(P.rematch(c), (s) => {
      this.rematchCode = (s.val()?.code as string) ?? this.rematchCode;
      this.recompute();
    });
    listen(`${P.game(c)}/presence`, (s) => {
      this.presence = (s.val() ?? {}) as typeof this.presence;
      this.recompute();
    });
    // Rounds are discovered once (child_added) and then streamed with
    // granular listeners: the deal is immutable, actions are append-only and
    // arrive one by one, `final` grows per seat. Nothing is re-downloaded.
    this.unsubs.push(
      onChildAdded(ref(this.db, P.rounds(c)), (roundSnap) => {
        this.watchRound(roundSnap.key as string);
      })
    );

    // Own connectivity + presence heartbeat.
    const connRef = ref(this.db, ".info/connected");
    this.unsubs.push(
      onValue(connRef, (s) => {
        this.connected = s.val() === true;
        if (this.connected) {
          const pRef = ref(this.db, P.presence(c, this.mySeat));
          onDisconnect(pRef)
            .set({ online: false, lastSeen: serverTimestamp() })
            .catch(() => {});
          set(pRef, { online: true, lastSeen: serverTimestamp() }).catch(
            () => {}
          );
        }
        this.recompute();
      })
    );

    // Watchdog: if the protocol owes something (final reveal, next-round
    // deal, result, auto-start, a leave intent to convert) and no data event
    // retriggers the upkeep pass — swallowed transient error, phone back from
    // sleep, missed echo — retry on a slow heartbeat. Everything the upkeep
    // does is idempotent, so spurious runs are harmless.
    this.watchdog = setInterval(() => {
      if (this.destroyed || this.result) return;
      void this.maybeAutoAct();
    }, 3000);

    this.recompute();
  }

  private ingestGame(snap: DataSnapshot): void {
    const v = snap.val() ?? {};
    this.lobby = v.lobby ?? null;
    this.seats = v.seats ?? {};
    this.start = v.start ?? null;
    this.presence = v.presence ?? {};
    this.result = v.result ?? null;
    this.nextReadyFlags = v.nextReady ?? {};
    this.leaveFlags = v.leave ?? {};
    this.forfeitFlags = v.forfeits ?? {};
    this.rematchCode = v.rematch?.code ?? null;
    const rounds = snap.child("rounds");
    rounds.forEach((roundSnap) => {
      this.ingestRound(roundSnap.key as string, roundSnap);
    });
  }

  private roundModel(key: string): RoundModel {
    let model = this.rounds.get(key);
    if (!model) {
      model = { discard0: null, actions: new Map(), final: {} };
      this.rounds.set(key, model);
    }
    return model;
  }

  private ingestRound(key: string, snap: DataSnapshot): void {
    const model = this.roundModel(key);
    const deal = snap.child("deal").val() as { discard0?: number } | null;
    if (deal && typeof deal.discard0 === "number") {
      model.discard0 = deal.discard0;
    }
    snap.child("actions").forEach((a) => {
      this.ingestAction(key, a.key as string, a.val() as WireAction);
    });
    model.final = (snap.child("final").val() ?? {}) as RoundModel["final"];
  }

  private ingestAction(rKey: string, aKey: string, wire: WireAction): void {
    const model = this.roundModel(rKey);
    if (model.actions.has(aKey)) return;
    const action = fromWireAction(wire);
    if (!action) return; // malformed — replay will flag the gap as corruption
    model.actions.set(aKey, action);
    if (this.live) this.lastAction = { ...action, key: aKey };
  }

  private watchRound(rKey: string): void {
    if (this.roundUnsubs.has(rKey)) return;
    const c = this.code;
    const noop = () => {
      /* transient permission/network errors: state converges on reconnect */
    };
    const us: Unsub[] = [
      onValue(
        ref(this.db, P.deal(c, rKey)),
        (s) => {
          const v = s.val() as { discard0?: number } | null;
          if (v && typeof v.discard0 === "number") {
            this.roundModel(rKey).discard0 = v.discard0;
          }
          this.recompute();
        },
        noop
      ),
      onChildAdded(
        ref(this.db, `${P.rounds(c)}/${rKey}/actions`),
        (a) => {
          this.ingestAction(rKey, a.key as string, a.val() as WireAction);
          this.recompute();
        },
        noop
      ),
      // A rejected write (rules denial) still echoes locally as child_added
      // before the server rolls it back with child_removed. Drop it from the
      // model so an optimistic phantom can never poison the replay.
      onChildRemoved(
        ref(this.db, `${P.rounds(c)}/${rKey}/actions`),
        (a) => {
          this.roundModel(rKey).actions.delete(a.key as string);
          this.recompute();
        },
        noop
      ),
      onValue(
        ref(this.db, `${P.rounds(c)}/${rKey}/final`),
        (s) => {
          this.roundModel(rKey).final = (s.val() ??
            {}) as RoundModel["final"];
          this.recompute();
        },
        noop
      ),
    ];
    this.roundUnsubs.set(rKey, us);
  }

  private get currentRound(): string | null {
    if (this.rounds.size === 0) return null;
    let best: string | null = null;
    for (const k of this.rounds.keys()) {
      if (best === null || roundNumber(k) > roundNumber(best)) best = k;
    }
    return best;
  }

  private roundInputs(): RoundInput[] {
    const keys = [...this.rounds.keys()].sort(
      (a, b) => roundNumber(a) - roundNumber(b)
    );
    const inputs: RoundInput[] = [];
    for (const k of keys) {
      const m = this.rounds.get(k)!;
      if (m.discard0 === null) continue;
      const actionKeys = [...m.actions.keys()].sort();
      inputs.push({
        round: roundNumber(k),
        discard0: m.discard0,
        actions: actionKeys.map((ak) => m.actions.get(ak)!),
        final: m.final,
      });
    }
    return inputs;
  }

  private get maxPlayers(): number {
    return this.lobby?.maxPlayers ?? 2;
  }

  private get playerCount(): number {
    return this.start?.count ?? 0;
  }

  private get seatedCount(): number {
    let n = 0;
    while (this.seats[String(n)]) n++;
    return n;
  }

  private names(count: number): string[] {
    return Array.from(
      { length: count },
      (_, s) => this.seats[String(s)]?.name || `Joueur ${s + 1}`
    );
  }

  private replayConfig() {
    return {
      names: this.names(this.playerCount),
      scoreLimit: this.lobby?.scoreLimit ?? 100,
      playerCount: this.playerCount,
      maxPlayers: this.maxPlayers,
    };
  }

  private recompute(): void {
    if (this.destroyed) return;
    this.replay = this.start
      ? replayGame(this.replayConfig(), this.roundInputs())
      : null;
    this.snapshot = this.buildSnapshot();
    this.emit();
    // Keep the protocol moving (starts, reveals, deals, results, recovery).
    void this.maybeAutoAct();
  }

  private seatAbsence(seat: Seat): { online: boolean; lastSeen: number | null } {
    const p = this.presence[String(seat)];
    return {
      online: p?.online === true,
      lastSeen: typeof p?.lastSeen === "number" ? p.lastSeen : null,
    };
  }

  private isAway(seat: Seat): boolean {
    const { online, lastSeen } = this.seatAbsence(seat);
    if (online) return false;
    // Never seen online (e.g. crashed before the first heartbeat): fall back
    // to the game's age so a claim/exclusion stays possible.
    const since =
      lastSeen ??
      (typeof this.lobby?.createdAt === "number" ? this.lobby.createdAt : null);
    return since !== null && Date.now() - since > CLAIM_AFTER_MS;
  }

  /** Out per the *projected* state (log) or a pending leave intent/flag. */
  private isOut(seat: Seat): boolean {
    if (this.replay?.state.players[seat]?.out) return true;
    if (this.forfeitFlags[String(seat)]) return true;
    if (this.leaveFlags[String(seat)]) return true;
    return false;
  }

  private buildSnapshot(): OnlineSnapshot {
    const r = this.replay;
    const started = !!this.start;
    const game = r?.state ?? null;
    const over =
      !!this.result || (game !== null && game.phase === "gameOver");
    const count = this.playerCount;
    const twoPlayer = count === 2;
    const metaCount = started ? count : this.seatedCount;

    const players: OnlinePlayerMeta[] = Array.from(
      { length: metaCount },
      (_, seat) => {
        const { online, lastSeen } = this.seatAbsence(seat);
        const out = started && this.isOut(seat);
        const blocking =
          started &&
          !over &&
          !out &&
          !!game &&
          (r?.awaitingReveal
            ? r.missing.some((m) => m.seat === seat)
            : game.phase === "roundOver"
              ? this.nextReadyFlags[String(seat)] !== true
              : game.currentPlayer === seat);
        return {
          seat,
          name: this.seats[String(seat)]?.name || `Joueur ${seat + 1}`,
          isMe: seat === this.mySeat,
          online,
          lastSeen,
          out,
          ready: this.nextReadyFlags[String(seat)] === true,
          canExclude:
            !twoPlayer &&
            started &&
            !over &&
            !out &&
            seat !== this.mySeat &&
            blocking &&
            this.isAway(seat),
        };
      }
    );

    const me = game?.players[this.mySeat];
    const opponent2p = twoPlayer ? (this.mySeat === 0 ? 1 : 0) : -1;

    return {
      status: !started ? "lobby" : over ? "over" : "playing",
      code: this.code,
      mySeat: this.mySeat,
      maxPlayers: this.maxPlayers,
      playerCount: count,
      isHost: this.mySeat === 0,
      started,
      canStartEarly:
        !started &&
        this.mySeat === 0 &&
        this.seatedCount >= MIN_PLAYERS &&
        this.seatedCount < this.maxPlayers,
      players,
      scoreLimit: this.lobby?.scoreLimit ?? 100,
      game,
      awaitingReveal: r?.awaitingReveal ?? false,
      corrupted: r?.corrupted ?? false,
      myTurn:
        !!game &&
        !over &&
        !r?.awaitingReveal &&
        !me?.out &&
        game.currentPlayer === this.mySeat &&
        game.phase !== "roundOver" &&
        game.phase !== "gameOver",
      canClaimVictory:
        twoPlayer &&
        started &&
        !over &&
        this.isAway(opponent2p) &&
        !this.isOut(opponent2p),
      connected: this.connected,
      result: this.result,
      myNextReady: this.nextReadyFlags[String(this.mySeat)] === true,
      rematchCode: this.rematchCode,
      lastAction: this.lastAction,
      busy: this.busy,
    };
  }

  getSnapshot(): OnlineSnapshot {
    return this.snapshot;
  }

  subscribe(cb: () => void): Unsub {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  /** Re-derives time-based flags (claim/exclude buttons) without data. */
  refresh(): void {
    this.snapshot = this.buildSnapshot();
    this.emit();
  }

  // -------------------------------------------------------------------------
  // Acting
  // -------------------------------------------------------------------------

  private setBusy(b: boolean): void {
    if (this.busy === b) return;
    this.busy = b;
    this.snapshot = this.buildSnapshot();
    this.emit();
    // Data echoes that arrived while we were busy skipped their upkeep pass
    // (most importantly: publishing the final reveal right after writing a
    // round-closing action). Run it now that the lock is released.
    if (!b) queueMicrotask(() => void this.maybeAutoAct());
  }

  /** Writes my peek marker then reads the secret it unlocks. */
  private async peekValue(round: string, cardRef: string): Promise<number> {
    await set(ref(this.db, P.peek(this.code, round, this.mySeat)), cardRef);
    const snap = await get(
      ref(this.db, P.secretCard(this.code, round, cardRef))
    );
    const v = snap.val();
    if (typeof v !== "number") throw new OnlineError("network", "peek failed");
    return v;
  }

  /**
   * Turns a UI GameAction into a protocol action, discloses the required
   * secret value, and writes action + state mirror in one atomic update.
   */
  async dispatch(action: GameAction): Promise<void> {
    const r = this.replay;
    const round = this.currentRound;
    if (!r || !round || this.busy || this.destroyed) return;
    const game = r.state;
    if (game.currentPlayer !== this.mySeat) return;

    this.setBusy(true);
    try {
      const online = await this.toOnlineAction(action, round, r);
      if (online) await this.commitAction(round, r, online);
    } finally {
      this.setBusy(false);
    }
  }

  private async toOnlineAction(
    action: GameAction,
    round: string,
    r: ReplayResult
  ): Promise<OnlineAction | null> {
    const seat = this.mySeat;
    const game = r.state;
    switch (action.type) {
      case "revealInitial": {
        if (action.player !== seat) return null;
        const cardRef = gridRef(seat, action.index);
        const value = await this.peekValue(round, cardRef);
        return { seat, type: "reveal", index: action.index, ref: cardRef, value };
      }
      case "drawFromDeck": {
        const drawn = 1 + r.draws;
        if (drawn < pileSize(this.maxPlayers)) {
          const value = await this.peekValue(round, r.cursorRef);
          return { seat, type: "draw", ref: r.cursorRef, value };
        }
        // Pile exhausted: the engine reshuffled the (public) discard
        // deterministically, so the top value is already known locally.
        const top = game.deck[0];
        return top
          ? { seat, type: "draw", ref: r.cursorRef, value: top.value }
          : null;
      }
      case "takeFromDiscard":
        return { seat, type: "takeDiscard" };
      case "keep":
        return { seat, type: "keep" };
      case "discardDrawn":
        return { seat, type: "discardDrawn" };
      case "placeAt": {
        const target = game.players[seat].grid[action.index];
        if (!target) return null;
        if (target.faceUp) {
          return { seat, type: "place", index: action.index };
        }
        const cardRef = gridRef(seat, action.index);
        const value = await this.peekValue(round, cardRef);
        return { seat, type: "place", index: action.index, ref: cardRef, value };
      }
      case "flipAt": {
        const cardRef = gridRef(seat, action.index);
        const value = await this.peekValue(round, cardRef);
        return { seat, type: "flip", index: action.index, ref: cardRef, value };
      }
      default:
        return null;
    }
  }

  private async commitAction(
    round: string,
    r: ReplayResult,
    online: OnlineAction,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    // Predict the post-action state by replaying locally with it appended.
    const inputs = this.roundInputs();
    const current = inputs[inputs.length - 1];
    const predicted = replayGame(this.replayConfig(), [
      ...inputs.slice(0, -1),
      { ...current, actions: [...current.actions, online] },
    ]);
    if (predicted.corrupted) return; // illegal locally — never send it

    const key = actionKey(r.actionCount);
    const done =
      predicted.awaitingReveal ||
      predicted.state.phase === "roundOver" ||
      predicted.state.phase === "gameOver";
    const state: PublicState = {
      round,
      next: actionKey(predicted.actionCount),
      // While the round settles (reveals, scores) the writer keeps the state
      // pen: it is the seat whose client is responsible for upkeep writes.
      turn: done
        ? wireSeat(this.mySeat)
        : wireSeat(predicted.state.currentPlayer),
      phase: done ? "revealing" : (predicted.state.phase as PublicState["phase"]),
      cursorRef: predicted.cursorRef,
      nextRound: roundKey(roundNumber(round) + 1),
    };
    await update(ref(this.db), {
      [P.action(this.code, round, key)]: {
        ...toWireAction(online),
        at: serverTimestamp(),
      },
      [P.state(this.code)]: state,
      ...extra,
    });
  }

  /** Appends a rules-checked forfeit for `seat` and mirrors the flag node. */
  private async commitForfeit(seat: Seat): Promise<void> {
    const r = this.replay;
    const round = this.currentRound;
    if (!r || !round) return;
    if (r.state.players[seat]?.out) return; // already applied
    await this.commitAction(round, r, { seat, type: "forfeit" }, {
      [P.forfeit(this.code, seat)]: true,
    });
  }

  // -------------------------------------------------------------------------
  // Protocol upkeep — reactive, idempotent, crash-safe
  // -------------------------------------------------------------------------

  private autoActing = false;
  /** A recompute fired while an upkeep pass was running/locked — rerun after. */
  private autoActQueued = false;

  private async maybeAutoAct(): Promise<void> {
    if (this.destroyed) return;
    if (this.autoActing || this.busy) {
      this.autoActQueued = true;
      return;
    }
    this.autoActing = true;
    try {
      // 0) Lobby full → pin the start (idempotent; first writer wins). The
      //    host writes at once, guests only as a delayed fallback.
      if (!this.start && this.lobby && this.seatedCount === this.maxPlayers) {
        if (this.mySeat !== 0) {
          await new Promise((res) => setTimeout(res, 800));
          if (this.start || this.destroyed) return;
        }
        await this.writeStart(this.maxPlayers);
        return;
      }

      const r = this.replay;
      if (!r || r.corrupted || this.result) return;

      // 1) Round closed and some of the missing values are mine → publish.
      if (r.awaitingReveal && r.missing.some((m) => m.seat === this.mySeat)) {
        await this.publishFinalReveal(r);
        return;
      }
      // 2) Game over by score → record the result (first writer wins).
      if (!r.awaitingReveal && r.state.phase === "gameOver") {
        await this.writeResult(r.state);
        return;
      }
      // 3) A leave intent is pending → convert it into a logged forfeit.
      //    Any client may try; the rules only accept the turn holder (or
      //    anyone, when the turn holder is the one who left/vanished).
      const leaver = this.pendingLeaver(r);
      if (leaver !== null) {
        await new Promise((res) => setTimeout(res, 300 * this.mySeat));
        if (this.destroyed) return;
        await this.commitForfeit(leaver);
        return;
      }
      // 4) Every active player ready for the next round → deal it.
      if (
        !r.awaitingReveal &&
        r.state.phase === "roundOver" &&
        this.allActiveReady(r)
      ) {
        await this.dealNextRound(r.state.round + 1);
        return;
      }
      // 5) A move of mine was interrupted between peek and action → finish it.
      await this.completeOrphanMove(r);
    } catch {
      /* transient failure — the watchdog retries shortly */
    } finally {
      this.autoActing = false;
      if (this.autoActQueued && !this.destroyed) {
        this.autoActQueued = false;
        queueMicrotask(() => void this.maybeAutoAct());
      }
    }
  }

  private pendingLeaver(r: ReplayResult): Seat | null {
    for (let seat = 0; seat < this.playerCount; seat++) {
      if (!this.leaveFlags[String(seat)]) continue;
      if (r.state.players[seat]?.out) continue;
      return seat;
    }
    return null;
  }

  private allActiveReady(r: ReplayResult): boolean {
    return r.state.players.every(
      (p, seat) => p.out || this.nextReadyFlags[String(seat)] === true
    );
  }

  private async writeStart(count: number): Promise<void> {
    try {
      await set(ref(this.db, P.start(this.code)), {
        count,
        at: serverTimestamp(),
      } satisfies StartInfo);
    } catch {
      /* someone else pinned the start first — fine */
    }
  }

  private async publishFinalReveal(r: ReplayResult): Promise<void> {
    const round = this.currentRound;
    if (!round) return;
    const model = this.rounds.get(round);
    const already = model?.final?.[String(this.mySeat)] ?? {};
    const values: Record<number, number> = {};
    for (const m of r.missing) {
      if (m.seat !== this.mySeat) continue;
      if (already[m.slot] !== undefined) continue;
      values[m.slot] = await this.peekValue(round, gridRef(this.mySeat, m.slot));
    }
    if (Object.keys(values).length === 0) return;
    await update(
      ref(this.db, P.final(this.code, round, this.mySeat)),
      values
    );
  }

  private async writeResult(state: GameState): Promise<void> {
    let result: GameResult;
    if (activeCount(state.players) <= 1) {
      // Everyone else left: last player standing.
      result = {
        winner: activeSeats(state.players)[0] ?? this.mySeat,
        reason: "forfeit",
        by: wireSeat(this.mySeat),
      };
    } else {
      const winner = lowestTotalIndex(state.players);
      const best = state.players[winner].totalScore;
      const tied =
        state.players.filter((p) => !p.out && p.totalScore === best).length > 1;
      result = {
        winner: tied ? -1 : winner,
        reason: "score",
        by: wireSeat(this.mySeat),
      };
    }
    try {
      await set(ref(this.db, P.result(this.code)), result);
    } catch {
      /* another player got there first — fine */
    }
  }

  private async dealNextRound(nextRound: number): Promise<void> {
    const rKey = roundKey(nextRound);
    if (this.rounds.get(rKey)?.discard0 != null) return; // already dealt
    // Stagger by seat so the clients don't race the write every time.
    if (this.mySeat > 0) {
      await new Promise((res) => setTimeout(res, 400 * this.mySeat));
      if (this.rounds.get(rKey)?.discard0 != null || this.destroyed) return;
    }
    const deal = generateDeal(this.maxPlayers);
    try {
      await update(ref(this.db), {
        [P.deal(this.code, rKey)]: {
          discard0: deal.discard0,
          at: serverTimestamp(),
        },
        [`${P.secretRound(this.code, rKey)}`]: deal.secrets,
        [P.state(this.code)]: {
          round: rKey,
          next: actionKey(0),
          turn: "0",
          phase: "setup",
          cursorRef: pileRef(1),
          nextRound: roundKey(nextRound + 1),
        } satisfies PublicState,
        [P.nextReady(this.code)]: null,
      });
    } catch {
      /* another client dealt first — our subscription will pick it up */
    }
  }

  /**
   * Crash recovery: if we wrote a peek marker but never the matching action
   * (tab closed mid-move), the marker is public commitment enough — finish
   * the move deterministically so the game can't stall.
   */
  private async completeOrphanMove(r: ReplayResult): Promise<void> {
    if (this.orphanChecked) return;
    const game = r.state;
    if (game.currentPlayer !== this.mySeat) return;
    if (
      game.phase !== "setup" &&
      game.phase !== "draw" &&
      game.phase !== "flip" &&
      game.phase !== "replace"
    ) {
      this.orphanChecked = true;
      return;
    }
    const round = this.currentRound;
    if (!round) return;
    this.orphanChecked = true;
    const peekSnap = await get(
      ref(this.db, P.peek(this.code, round, this.mySeat))
    );
    const peeked = peekSnap.val() as string | null;
    if (!peeked) return;

    if (game.phase === "draw") {
      if (peeked !== r.cursorRef) return; // stale marker from an earlier turn
      await this.dispatch({ type: "drawFromDeck" });
      return;
    }
    const mine = `g${this.mySeat}/`;
    if (!peeked.startsWith(mine)) return;
    const slot = Number(peeked.slice(mine.length));
    const card = game.players[this.mySeat].grid[slot];
    if (!card || card.faceUp) return; // already resolved
    if (game.phase === "setup") {
      await this.dispatch({ type: "revealInitial", player: this.mySeat, index: slot });
    } else if (game.phase === "flip") {
      await this.dispatch({ type: "flipAt", index: slot });
    } else if (game.phase === "replace") {
      await this.dispatch({ type: "placeAt", index: slot });
    }
  }

  // -------------------------------------------------------------------------
  // Round / game flow controls
  // -------------------------------------------------------------------------

  /** Host: start now with everyone currently seated (≥ 2). */
  async startEarly(): Promise<void> {
    if (this.mySeat !== 0 || this.start) return;
    const count = this.seatedCount;
    if (count < MIN_PLAYERS) return;
    await this.writeStart(count);
  }

  async setNextReady(): Promise<void> {
    await set(
      ref(this.db, `${P.nextReady(this.code)}/${this.mySeat}`),
      true
    ).catch(() => {});
  }

  /**
   * Leave the game for good. Two players: classic abandon (the opponent wins
   * immediately). More players: a forfeit — the table plays on without me.
   */
  async abandon(): Promise<void> {
    if (this.playerCount === 2) {
      const winner = this.mySeat === 0 ? 1 : 0;
      try {
        await set(ref(this.db, P.result(this.code)), {
          winner,
          reason: "abandon",
          by: wireSeat(this.mySeat),
        } satisfies GameResult);
      } catch {
        /* result already set */
      }
      clearOnlineSession();
      return;
    }
    // Post the intent first (visible to everyone, converted by whoever may
    // write), then try the direct conversion in case it is my turn.
    await set(ref(this.db, P.leave(this.code, this.mySeat)), true).catch(
      () => {}
    );
    try {
      await this.commitForfeit(this.mySeat);
    } catch {
      /* not my turn — the turn holder's upkeep converts the intent */
    }
    clearOnlineSession();
  }

  /** Two-player games: claim the win over an absent opponent (legacy). */
  async claimVictory(): Promise<void> {
    await set(ref(this.db, P.result(this.code)), {
      winner: this.mySeat,
      reason: "claim",
      by: wireSeat(this.mySeat),
    } satisfies GameResult);
  }

  /**
   * Exclude an absent player who is holding the table up (their turn, their
   * reveal, or the next-round handshake). The database rules verify the 60s
   * absence — this cannot be used against a connected player.
   */
  async excludePlayer(seat: Seat): Promise<void> {
    if (seat === this.mySeat || this.playerCount <= 2) return;
    this.setBusy(true);
    try {
      await this.commitForfeit(seat);
    } finally {
      this.setBusy(false);
    }
  }

  /** Host cancels a lobby nobody joined (deletes the game). */
  async cancelLobby(): Promise<void> {
    try {
      await update(ref(this.db), {
        [P.game(this.code)]: null,
        [P.secrets(this.code)]: null,
      });
    } catch {
      /* someone joined in the meantime — the game simply continues */
    }
    clearOnlineSession();
  }

  /** Starts a fresh game and advertises it to the table as a rematch. */
  async requestRematch(name: string): Promise<OnlineGame> {
    const next = await OnlineGame.create(
      name,
      this.lobby?.scoreLimit ?? 100,
      this.maxPlayers
    );
    await set(ref(this.db, P.rematch(this.code)), {
      code: next.code,
      by: wireSeat(this.mySeat),
    }).catch(() => {});
    return next;
  }

  /** Removes a finished game from the database (housekeeping, best-effort). */
  async cleanup(): Promise<void> {
    if (!this.result) return;
    try {
      await update(ref(this.db), {
        [P.game(this.code)]: null,
        [P.secrets(this.code)]: null,
      });
    } catch {
      /* other players may still be looking at the result screen — leave it */
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.watchdog) clearInterval(this.watchdog);
    for (const u of this.unsubs) u();
    for (const us of this.roundUnsubs.values()) for (const u of us) u();
    this.unsubs = [];
    this.roundUnsubs.clear();
    this.listeners.clear();
    // Leave an accurate presence trail (best effort — onDisconnect covers us).
    set(ref(this.db, P.presence(this.code, this.mySeat)), {
      online: false,
      lastSeen: serverTimestamp(),
    }).catch(() => {});
  }
}

// Historical name: the mode began as a two-player duel.
export { OnlineGame as OnlineDuel };
