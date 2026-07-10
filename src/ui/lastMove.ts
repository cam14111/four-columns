import { useMemo, useRef } from "react";
import { GameState } from "@/game/types";

// The engine reports every turn-ending move (cardPlaced / cardFlipped) in its
// event log. This hook distils the latest one into a stable descriptor the UI
// can use to spotlight the changed card and narrate the move — both for the
// hand-off screen in duo and for watching the AI play in solo.

export interface LastMove {
  player: number;
  index: number;
  /** Monotonic counter: bumps once per new move so one-shot animations replay. */
  seq: number;
  kind: "place" | "flip";
  /** Value that entered the grid (place) or was revealed (flip). */
  value: number;
  /** Value that left the grid (place only). */
  replaced?: number;
  /** The move completed a column of three identical cards. */
  clearedColumn: boolean;
}

export const useLastMove = (game: GameState): LastMove | null => {
  const seq = useRef(0);
  const seen = useRef<unknown>(null);

  return useMemo(() => {
    const ev = game.events.find(
      (e) => e.type === "cardPlaced" || e.type === "cardFlipped"
    );
    if (!ev) return null;
    if (seen.current !== game.events) {
      seen.current = game.events;
      seq.current += 1;
    }
    const clearedColumn = game.events.some(
      (e) => e.type === "columnCleared" && e.player === ev.player
    );
    if (ev.type === "cardPlaced") {
      return {
        player: ev.player,
        index: ev.index,
        seq: seq.current,
        kind: "place",
        value: ev.placed,
        replaced: ev.replaced,
        clearedColumn,
      };
    }
    return {
      player: ev.player,
      index: ev.index,
      seq: seq.current,
      kind: "flip",
      value: ev.value,
      clearedColumn,
    };
  }, [game.events]);
};

/** Third-person narration, e.g. for the "pass the phone" hand-off screen. */
export const moveSummary = (move: LastMove, playerName: string): string => {
  const base =
    move.kind === "place"
      ? `${playerName} a remplacé un ${move.replaced} par un ${move.value}`
      : `${playerName} a retourné un ${move.value}`;
  return move.clearedColumn ? `${base} et a complété une colonne !` : base;
};

/** Compact confirmation shown to the player who just made the move. */
export const moveFlash = (move: LastMove): string => {
  const base =
    move.kind === "place"
      ? `Carte ${move.replaced} remplacée par ${move.value}`
      : `Carte ${move.value} retournée`;
  return move.clearedColumn ? `${base} · Colonne complétée !` : base;
};
