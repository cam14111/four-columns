// The online duel client: one instance per joined game.
//
// Responsibilities:
//   • create / join / resume a game (anonymous auth, seat claiming)
//   • mirror the public game tree into a local model and project it through
//     the pure engine (replay.ts) into a regular GameState for the UI
//   • turn UI GameActions into protocol writes (with the peek→read→write
//     dance that discloses secret card values under database-rule control)
//   • keep the protocol moving by reacting to state, not to callbacks:
//     final reveals, next-round deals, game-over results and interrupted
//     moves are all detected from the replayed state and (re)executed
//     idempotently — which is exactly what makes refreshes and reconnections
//     safe at any moment.
//   • presence (onDisconnect) so each player can see the other's connectivity

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
import { ensureSignedIn } from "./firebase";
import {
  actionKey,
  CLAIM_AFTER_MS,
  GAME_EXPIRY_MS,
  GameResult,
  generateDeal,
  gridRef,
  isValidGameCode,
  LobbyInfo,
  normalizeGameCode,
  OnlineAction,
  otherSeat,
  PILE_SIZE,
  pileRef,
  PublicState,
  randomGameCode,
  roundKey,
  roundNumber,
  Seat,
  SeatInfo,
} from "./protocol";
import { replayGame, ReplayResult, RoundInput } from "./replay";
import { clearOnlineSession, saveOnlineSession } from "./session";

export type OnlineErrorCode =
  | "not-found"
  | "full"
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

export interface OnlineSnapshot {
  status: "lobby" | "playing" | "over";
  code: string;
  mySeat: Seat;
  names: [string, string];
  scoreLimit: number;
  /** Projected engine state; null until the opponent has joined. */
  game: GameState | null;
  /** Round closed, waiting for the last face-down cards to be disclosed. */
  awaitingReveal: boolean;
  /** The action log failed engine validation — peer client misbehaving. */
  corrupted: boolean;
  myTurn: boolean;
  opponentJoined: boolean;
  opponentOnline: boolean;
  /** ms epoch of the opponent's last presence beat (null before first). */
  opponentLastSeen: number | null;
  /** Whether the opponent has been away long enough to claim the win. */
  canClaimVictory: boolean;
  /** My own realtime-database link. */
  connected: boolean;
  result: GameResult | null;
  nextReady: { me: boolean; them: boolean };
  rematchCode: string | null;
  /** Last action appended after attach — drives remote-move sounds. */
  lastAction: (OnlineAction & { key: string }) | null;
  /** A write is in flight (locks the UI against double-taps). */
  busy: boolean;
}

interface RoundModel {
  discard0: number | null;
  actions: Map<string, OnlineAction>;
  final: Partial<Record<"0" | "1", Record<number, number>>>;
}

type Unsub = () => void;

const P = {
  game: (c: string) => `games/${c}`,
  lobby: (c: string) => `games/${c}/lobby`,
  seats: (c: string) => `games/${c}/seats`,
  seat: (c: string, s: Seat) => `games/${c}/seats/${s}`,
  state: (c: string) => `games/${c}/state`,
  presence: (c: string, s: Seat) => `games/${c}/presence/${s}`,
  result: (c: string) => `games/${c}/result`,
  nextReady: (c: string) => `games/${c}/nextReady`,
  rematch: (c: string) => `games/${c}/rematch`,
  rounds: (c: string) => `games/${c}/rounds`,
  deal: (c: string, r: string) => `games/${c}/rounds/${r}/deal`,
  action: (c: string, r: string, a: string) =>
    `games/${c}/rounds/${r}/actions/${a}`,
  final: (c: string, r: string, s: Seat) =>
    `games/${c}/rounds/${r}/final/${s}`,
  peek: (c: string, r: string) => `games/${c}/rounds/${r}/peek`,
  secrets: (c: string) => `secrets/${c}`,
  secretRound: (c: string, r: string) => `secrets/${c}/${r}`,
  secretCard: (c: string, r: string, cardRef: string) =>
    `secrets/${c}/${r}/${cardRef}`,
};

export class OnlineDuel {
  readonly code: string;
  readonly mySeat: Seat;
  private db: Database;
  private uid: string;

  private lobby: LobbyInfo | null = null;
  private seats: Partial<Record<"0" | "1", SeatInfo>> = {};
  private presence: Partial<
    Record<"0" | "1", { online?: boolean; lastSeen?: number }>
  > = {};
  private result: GameResult | null = null;
  private nextReadyFlags: Partial<Record<"0" | "1", boolean>> = {};
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

  static async create(name: string, scoreLimit: number): Promise<OnlineDuel> {
    const { uid, db } = await ensureSignedIn();
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomGameCode();
      const deal = generateDeal();
      const payload: Record<string, unknown> = {
        [P.game(code)]: {
          lobby: {
            status: "waiting",
            hostName: name,
            scoreLimit,
            createdAt: serverTimestamp(),
          },
          seats: { 0: { uid, name } },
          state: {
            round: "r1",
            next: actionKey(0),
            turn: 0,
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
        const duel = new OnlineDuel(db, uid, code, 0);
        await duel.attach();
        return duel;
      } catch (e) {
        lastErr = e; // code collision or transient error — retry with a new code
      }
    }
    throw new OnlineError("network", String(lastErr));
  }

  static async join(rawCode: string, name: string): Promise<OnlineDuel> {
    const code = normalizeGameCode(rawCode);
    if (!isValidGameCode(code)) throw new OnlineError("not-found");
    const { uid, db } = await ensureSignedIn();

    const lobbySnap = await get(ref(db, P.lobby(code))).catch(() => {
      throw new OnlineError("network");
    });
    if (!lobbySnap.exists()) throw new OnlineError("not-found");
    const lobby = lobbySnap.val() as LobbyInfo;

    const seatsSnap = await get(ref(db, P.seats(code)));
    const seats = (seatsSnap.val() ?? {}) as Partial<
      Record<"0" | "1", SeatInfo>
    >;

    // Already seated (own link, reinstall, second tab): just re-attach.
    const mySeat: Seat | null =
      seats["0"]?.uid === uid ? 0 : seats["1"]?.uid === uid ? 1 : null;
    if (mySeat !== null) {
      saveOnlineSession({ code, seat: mySeat, name });
      const duel = new OnlineDuel(db, uid, code, mySeat);
      await duel.attach();
      return duel;
    }

    if (seats["1"]) throw new OnlineError("full");
    const createdAt = typeof lobby.createdAt === "number" ? lobby.createdAt : 0;
    if (createdAt && Date.now() - createdAt > GAME_EXPIRY_MS) {
      throw new OnlineError("expired");
    }

    try {
      await set(ref(db, P.seat(code, 1)), { uid, name });
    } catch {
      // Someone else claimed the seat between our read and write.
      throw new OnlineError("full");
    }
    saveOnlineSession({ code, seat: 1, name });
    const duel = new OnlineDuel(db, uid, code, 1);
    await duel.attach();
    return duel;
  }

  /** Reattaches to a game this device already sits in (reload, app restart). */
  static async resume(code: string): Promise<OnlineDuel> {
    const { uid, db } = await ensureSignedIn();
    const seatsSnap = await get(ref(db, P.seats(code))).catch(() => {
      throw new OnlineError("network");
    });
    if (!seatsSnap.exists()) throw new OnlineError("not-found");
    const seats = seatsSnap.val() as Partial<Record<"0" | "1", SeatInfo>>;
    const mySeat: Seat | null =
      seats["0"]?.uid === uid ? 0 : seats["1"]?.uid === uid ? 1 : null;
    if (mySeat === null) throw new OnlineError("not-found");
    const duel = new OnlineDuel(db, uid, code, mySeat);
    await duel.attach();
    return duel;
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

    // Terminal facts (result, seats, lobby) are kept sticky: a remote cleanup
    // that deletes the game must not blank the screen the loser is reading.
    listen(P.lobby(c), (s) => {
      this.lobby = (s.val() as LobbyInfo) ?? this.lobby;
      this.recompute();
    });
    listen(P.seats(c), (s) => {
      const v = (s.val() ?? {}) as typeof this.seats;
      if (v["0"]) this.seats = v;
      this.recompute();
    });
    listen(P.result(c), (s) => {
      this.result = (s.val() as GameResult) ?? this.result;
      this.recompute();
    });
    listen(P.nextReady(c), (s) => {
      this.nextReadyFlags = (s.val() ?? {}) as typeof this.nextReadyFlags;
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
    // arrive one by one, `final` is written once. Nothing is re-downloaded.
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
    // deal, game-over result) and no data event retriggers the upkeep pass —
    // swallowed transient error, phone back from sleep, missed echo — retry
    // on a slow heartbeat. Idempotent, so spurious runs are harmless.
    this.watchdog = setInterval(() => {
      const r = this.replay;
      if (this.destroyed || !r || r.corrupted || this.result) return;
      const owes =
        r.awaitingReveal ||
        r.state.phase === "gameOver" ||
        (r.state.phase === "roundOver" &&
          this.nextReadyFlags["0"] === true &&
          this.nextReadyFlags["1"] === true);
      if (owes) void this.maybeAutoAct();
    }, 3000);

    this.recompute();
  }

  private ingestGame(snap: DataSnapshot): void {
    const v = snap.val() ?? {};
    this.lobby = v.lobby ?? null;
    this.seats = v.seats ?? {};
    this.presence = v.presence ?? {};
    this.result = v.result ?? null;
    this.nextReadyFlags = v.nextReady ?? {};
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
      this.ingestAction(key, a.key as string, a.val() as OnlineAction);
    });
    model.final = (snap.child("final").val() ?? {}) as RoundModel["final"];
  }

  private ingestAction(rKey: string, aKey: string, action: OnlineAction): void {
    const model = this.roundModel(rKey);
    if (model.actions.has(aKey)) return;
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
          this.ingestAction(rKey, a.key as string, a.val() as OnlineAction);
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

  private names(): [string, string] {
    return [
      this.seats["0"]?.name || "Joueur 1",
      this.seats["1"]?.name || "Adversaire",
    ];
  }

  private recompute(): void {
    if (this.destroyed) return;
    const opponentJoined = !!this.seats["1"];
    if (opponentJoined) {
      this.replay = replayGame(
        { names: this.names(), scoreLimit: this.lobby?.scoreLimit ?? 100 },
        this.roundInputs()
      );
    } else {
      this.replay = null;
    }
    this.snapshot = this.buildSnapshot();
    this.emit();
    // Keep the protocol moving (final reveals, deals, results, recovery).
    void this.maybeAutoAct();
  }

  private buildSnapshot(): OnlineSnapshot {
    const r = this.replay;
    const opponent = otherSeat(this.mySeat);
    const oppPresence = this.presence[String(opponent) as "0" | "1"];
    const opponentJoined = !!this.seats["1"];
    const game = r?.state ?? null;
    const over =
      !!this.result || (game !== null && game.phase === "gameOver");
    const lastSeen =
      typeof oppPresence?.lastSeen === "number" ? oppPresence.lastSeen : null;
    const opponentOnline = oppPresence?.online === true;
    return {
      status: !opponentJoined ? "lobby" : over ? "over" : "playing",
      code: this.code,
      mySeat: this.mySeat,
      names: this.names(),
      scoreLimit: this.lobby?.scoreLimit ?? 100,
      game,
      awaitingReveal: r?.awaitingReveal ?? false,
      corrupted: r?.corrupted ?? false,
      myTurn:
        !!game &&
        !over &&
        !r?.awaitingReveal &&
        game.currentPlayer === this.mySeat &&
        game.phase !== "roundOver" &&
        game.phase !== "gameOver",
      opponentJoined,
      opponentOnline,
      opponentLastSeen: lastSeen,
      canClaimVictory:
        opponentJoined &&
        !over &&
        !opponentOnline &&
        lastSeen !== null &&
        Date.now() - lastSeen > CLAIM_AFTER_MS,
      connected: this.connected,
      result: this.result,
      nextReady: {
        me: this.nextReadyFlags[String(this.mySeat) as "0" | "1"] === true,
        them: this.nextReadyFlags[String(opponent) as "0" | "1"] === true,
      },
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

  /** Re-derives time-based flags (claim button) without any data change. */
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

  /** Writes the peek marker then reads the secret it unlocks. */
  private async peekValue(round: string, cardRef: string): Promise<number> {
    await set(ref(this.db, P.peek(this.code, round)), cardRef);
    const snap = await get(ref(this.db, P.secretCard(this.code, round, cardRef)));
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
        if (drawn < PILE_SIZE) {
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
    online: OnlineAction
  ): Promise<void> {
    // Predict the post-action state by replaying locally with it appended.
    const inputs = this.roundInputs();
    const current = inputs[inputs.length - 1];
    const predicted = replayGame(
      { names: this.names(), scoreLimit: this.lobby?.scoreLimit ?? 100 },
      [
        ...inputs.slice(0, -1),
        { ...current, actions: [...current.actions, online] },
      ]
    );
    if (predicted.corrupted) return; // illegal locally — never send it

    const key = actionKey(r.actionCount);
    const phase = predicted.awaitingReveal
      ? "revealing"
      : predicted.state.phase === "roundOver" ||
          predicted.state.phase === "gameOver"
        ? "revealing"
        : (predicted.state.phase as PublicState["phase"]);
    const state: PublicState = {
      round,
      next: actionKey(predicted.actionCount),
      turn: predicted.awaitingReveal
        ? this.mySeat
        : (predicted.state.currentPlayer as Seat),
      phase,
      cursorRef: predicted.cursorRef,
      nextRound: roundKey(roundNumber(round) + 1),
    };
    await update(ref(this.db), {
      [P.action(this.code, round, key)]: { ...online, at: serverTimestamp() },
      [P.state(this.code)]: state,
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
    const r = this.replay;
    if (!r || r.corrupted || this.result) return;
    this.autoActing = true;
    try {
      // 1) Round closed and the missing values are mine → publish them.
      if (r.awaitingReveal && r.missing.every((m) => m.seat === this.mySeat)) {
        await this.publishFinalReveal(r);
        return;
      }
      // 2) Game over → record the result (idempotent; first writer wins).
      if (!r.awaitingReveal && r.state.phase === "gameOver") {
        await this.writeScoreResult(r.state);
        return;
      }
      // 3) Both ready for the next round and it isn't dealt yet → deal.
      if (
        !r.awaitingReveal &&
        r.state.phase === "roundOver" &&
        this.nextReadyFlags["0"] === true &&
        this.nextReadyFlags["1"] === true
      ) {
        await this.dealNextRound(r.state.round + 1);
        return;
      }
      // 4) A move of ours was interrupted between peek and action → finish it.
      await this.completeOrphanMove(r);
    } catch {
      /* transient failure — the watchdog below retries shortly */
    } finally {
      this.autoActing = false;
      if (this.autoActQueued && !this.destroyed) {
        this.autoActQueued = false;
        queueMicrotask(() => void this.maybeAutoAct());
      }
    }
  }

  private async publishFinalReveal(r: ReplayResult): Promise<void> {
    const round = this.currentRound;
    if (!round) return;
    const model = this.rounds.get(round);
    const seatKey = String(this.mySeat) as "0" | "1";
    if (model?.final?.[seatKey]) return; // already published
    const values: Record<number, number> = {};
    for (const m of r.missing) {
      if (m.seat !== this.mySeat) continue;
      values[m.slot] = await this.peekValue(round, gridRef(this.mySeat, m.slot));
    }
    await set(ref(this.db, P.final(this.code, round, this.mySeat)), values);
  }

  private async writeScoreResult(state: GameState): Promise<void> {
    const [a, b] = state.players.map((p) => p.totalScore);
    const winner: Seat | -1 = a === b ? -1 : a < b ? 0 : 1;
    try {
      await set(ref(this.db, P.result(this.code)), {
        winner,
        reason: "score",
        by: this.mySeat,
      } satisfies GameResult);
    } catch {
      /* opponent got there first — fine */
    }
  }

  private async dealNextRound(nextRound: number): Promise<void> {
    const rKey = roundKey(nextRound);
    if (this.rounds.get(rKey)?.discard0 != null) return; // already dealt
    // Stagger by seat so both clients don't race the write every time.
    if (this.mySeat === 1) {
      await new Promise((res) => setTimeout(res, 400));
      if (this.rounds.get(rKey)?.discard0 != null) return;
    }
    const deal = generateDeal();
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
          turn: 0,
          phase: "setup",
          cursorRef: pileRef(1),
          nextRound: roundKey(nextRound + 1),
        } satisfies PublicState,
        [P.nextReady(this.code)]: null,
      });
    } catch {
      /* the other client dealt first — our subscription will pick it up */
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
    const peekSnap = await get(ref(this.db, P.peek(this.code, round)));
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

  async setNextReady(): Promise<void> {
    await set(
      ref(this.db, `${P.nextReady(this.code)}/${this.mySeat}`),
      true
    ).catch(() => {});
  }

  async abandon(): Promise<void> {
    try {
      await set(ref(this.db, P.result(this.code)), {
        winner: otherSeat(this.mySeat),
        reason: "abandon",
        by: this.mySeat,
      } satisfies GameResult);
    } catch {
      /* result already set */
    }
    clearOnlineSession();
  }

  async claimVictory(): Promise<void> {
    await set(ref(this.db, P.result(this.code)), {
      winner: this.mySeat,
      reason: "claim",
      by: this.mySeat,
    } satisfies GameResult);
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

  /** Starts a fresh game and advertises it to the opponent as a rematch. */
  async requestRematch(name: string): Promise<OnlineDuel> {
    const next = await OnlineDuel.create(name, this.lobby?.scoreLimit ?? 100);
    await set(ref(this.db, P.rematch(this.code)), {
      code: next.code,
      by: this.mySeat,
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
      /* opponent may still be looking at the result screen — leave it */
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
