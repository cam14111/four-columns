// React bridge for the online duel: owns the OnlineDuel client lifecycle,
// exposes its snapshot as React state, and plays the same sound/haptic
// language as the local modes for both my moves and the opponent's.
//
// The Firebase SDK (and everything under src/online/) is loaded lazily on
// first use so the solo/duo experience — and the offline PWA — never pays
// for it.

import { useCallback, useEffect, useRef, useState } from "react";
import { GameAction } from "@/game/types";
import type {
  OnlineDuel,
  OnlineErrorCode,
  OnlineSnapshot,
} from "@/online/client";
import type { OnlineSession } from "@/online/session";
import { playSound } from "@/lib/sound";
import { vibrate } from "@/lib/haptics";

export type OnlineStage =
  | { kind: "setup" }
  | { kind: "connecting"; label: string }
  | { kind: "active" }
  | { kind: "error"; error: OnlineErrorCode };

export interface UseOnlineDuel {
  stage: OnlineStage;
  snap: OnlineSnapshot | null;
  create: (name: string, scoreLimit: number) => Promise<void>;
  join: (code: string, name: string) => Promise<void>;
  resume: (session: OnlineSession) => Promise<void>;
  dispatch: (action: GameAction) => void;
  nextRound: () => void;
  abandon: () => Promise<void>;
  claimVictory: () => Promise<void>;
  requestRematch: (name: string) => Promise<void>;
  joinRematch: (name: string) => Promise<void>;
  cancelLobby: () => Promise<void>;
  /** Detach without abandoning (the game stays resumable). */
  leave: () => void;
  /** Leave a finished game and delete it from the database. */
  leaveFinished: () => void;
  backToSetup: () => void;
}

const loadClient = () => import("@/online/client");

export const useOnlineDuel = (): UseOnlineDuel => {
  const [stage, setStage] = useState<OnlineStage>({ kind: "setup" });
  const [snap, setSnap] = useState<OnlineSnapshot | null>(null);
  const duelRef = useRef<OnlineDuel | null>(null);
  const prevTurn = useRef<boolean>(false);
  const lastActionKey = useRef<string | null>(null);

  const detach = useCallback(() => {
    duelRef.current?.destroy();
    duelRef.current = null;
    setSnap(null);
  }, []);

  useEffect(() => detach, [detach]);

  const bind = useCallback((duel: OnlineDuel) => {
    duelRef.current = duel;
    lastActionKey.current = duel.getSnapshot().lastAction?.key ?? null;
    setSnap(duel.getSnapshot());
    duel.subscribe(() => setSnap(duel.getSnapshot()));
    setStage({ kind: "active" });
  }, []);

  const run = useCallback(
    async (label: string, task: () => Promise<OnlineDuel>) => {
      detach();
      setStage({ kind: "connecting", label });
      try {
        bind(await task());
      } catch (e) {
        const code = (e as { code?: OnlineErrorCode })?.code ?? "network";
        setStage({ kind: "error", error: code });
      }
    },
    [bind, detach]
  );

  const create = useCallback(
    (name: string, scoreLimit: number) =>
      run("Création de la partie…", async () => {
        const { OnlineDuel } = await loadClient();
        return OnlineDuel.create(name, scoreLimit);
      }),
    [run]
  );

  const join = useCallback(
    (code: string, name: string) =>
      run("Connexion à la partie…", async () => {
        const { OnlineDuel } = await loadClient();
        return OnlineDuel.join(code, name);
      }),
    [run]
  );

  const resume = useCallback(
    (session: OnlineSession) =>
      run("Reprise du duel…", async () => {
        const { OnlineDuel } = await loadClient();
        return OnlineDuel.resume(session.code);
      }),
    [run]
  );

  // --- Sounds & haptics ------------------------------------------------------

  // Cue when the turn comes to me.
  useEffect(() => {
    const mine = snap?.myTurn === true && snap.game?.phase === "draw";
    if (mine && !prevTurn.current) {
      playSound("turn");
      vibrate("light");
    }
    prevTurn.current = mine ?? false;
  }, [snap?.myTurn, snap?.game?.phase, snap]);

  // Opponent moves make the same noises my own do.
  useEffect(() => {
    const action = snap?.lastAction;
    if (!action || action.key === lastActionKey.current) return;
    lastActionKey.current = action.key;
    if (action.seat === snap?.mySeat) return; // own sounds play on dispatch
    switch (action.type) {
      case "reveal":
      case "flip":
        playSound("flip");
        break;
      case "draw":
      case "takeDiscard":
        playSound("draw");
        break;
      case "place":
        playSound("place");
        break;
      case "discardDrawn":
        playSound("discard");
        break;
    }
  }, [snap?.lastAction, snap?.mySeat, snap]);

  // Column clears / round transitions ring for both players.
  const seenEvents = useRef<unknown>(null);
  useEffect(() => {
    const events = snap?.game?.events;
    if (!events || seenEvents.current === events) return;
    seenEvents.current = events;
    for (const ev of events) {
      if (ev.type === "columnCleared") {
        playSound("clear");
        if (ev.player === snap.mySeat) vibrate("success");
      } else if (ev.type === "roundClosed") {
        vibrate("medium");
      } else if (ev.type === "gameOver") {
        const won = ev.winner === snap.mySeat;
        playSound(won ? "win" : "lose");
        vibrate(won ? "success" : "error");
      }
    }
  }, [snap]);

  // The "claim victory" button depends on wall-clock time: tick while the
  // opponent is away so it appears without any data change.
  useEffect(() => {
    if (!snap || snap.status !== "playing" || snap.opponentOnline) return;
    const t = setInterval(() => duelRef.current?.refresh(), 5000);
    return () => clearInterval(t);
  }, [snap]);

  // --- Actions ---------------------------------------------------------------

  const dispatch = useCallback((action: GameAction) => {
    switch (action.type) {
      case "revealInitial":
      case "flipAt":
        playSound("flip");
        vibrate("select");
        break;
      case "drawFromDeck":
      case "takeFromDiscard":
        playSound("draw");
        vibrate("light");
        break;
      case "placeAt":
        playSound("place");
        vibrate("light");
        break;
      case "discardDrawn":
        playSound("discard");
        vibrate("light");
        break;
    }
    void duelRef.current?.dispatch(action);
  }, []);

  const nextRound = useCallback(() => {
    void duelRef.current?.setNextReady();
  }, []);

  const abandon = useCallback(async () => {
    await duelRef.current?.abandon();
  }, []);

  const claimVictory = useCallback(async () => {
    await duelRef.current?.claimVictory();
  }, []);

  const requestRematch = useCallback(
    async (name: string) => {
      const duel = duelRef.current;
      if (!duel) return;
      setStage({ kind: "connecting", label: "Nouvelle partie…" });
      try {
        const next = await duel.requestRematch(name);
        duel.destroy();
        bind(next);
      } catch {
        setStage({ kind: "active" });
      }
    },
    [bind]
  );

  const joinRematch = useCallback(
    async (name: string) => {
      const code = duelRef.current?.getSnapshot().rematchCode;
      if (!code) return;
      await join(code, name);
    },
    [join]
  );

  const cancelLobby = useCallback(async () => {
    await duelRef.current?.cancelLobby();
    detach();
    setStage({ kind: "setup" });
  }, [detach]);

  const leave = useCallback(() => {
    detach();
    setStage({ kind: "setup" });
  }, [detach]);

  const leaveFinished = useCallback(() => {
    const duel = duelRef.current;
    if (duel) {
      void duel.cleanup();
      import("@/online/session").then((m) => m.clearOnlineSession());
    }
    detach();
    setStage({ kind: "setup" });
  }, [detach]);

  const backToSetup = useCallback(() => setStage({ kind: "setup" }), []);

  return {
    stage,
    snap,
    create,
    join,
    resume,
    dispatch,
    nextRound,
    abandon,
    claimVictory,
    requestRematch,
    joinRematch,
    cancelLobby,
    leave,
    leaveFinished,
    backToSetup,
  };
};
