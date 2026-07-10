import { useCallback, useEffect, useRef, useState } from "react";
import { aiChooseAction } from "@/game/ai";
import {
  createGame,
  CreateGameOptions,
  dealNextRound,
  lowestTotalIndex,
  reduce,
} from "@/game/engine";
import { GameAction, GameState } from "@/game/types";
import { saveGame } from "@/game/persistence";
import {
  loadStats,
  recordGame,
  recordRound,
  saveStats,
  Stats,
} from "@/game/stats";
import { playSound } from "@/lib/sound";
import { vibrate } from "@/lib/haptics";

// Pacing for AI turns (ms). Tuned to feel deliberate but not sluggish.
const AI_DELAY = {
  setup: 420,
  draw: 620,
  decide: 680,
  replace: 640,
  flip: 620,
} as const;

export interface UseGame {
  game: GameState;
  stats: Stats;
  /** True while the AI is taking its turn (used to lock human input/UI). */
  aiThinking: boolean;
  dispatch: (action: GameAction) => void;
  newGame: (opts: CreateGameOptions) => void;
  nextRound: () => void;
}

export const useGame = (
  initial: CreateGameOptions,
  restored?: GameState | null,
  /**
   * True while the board is not on screen (home, panels). Pauses the AI loop
   * and ambient cues so a restored or backgrounded game never plays itself —
   * or buzzes the phone — behind the menu.
   */
  paused = false
): UseGame => {
  const [game, setGame] = useState<GameState>(
    () => restored ?? createGame(initial)
  );
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [aiThinking, setAiThinking] = useState(false);

  const processed = useRef<unknown>(null);
  const columnsThisRound = useRef(0);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTurn = useRef<number | null>(null);

  // Persist so an in-progress game survives a reload or the OS killing the
  // PWA. The AI's intra-turn micro-states (decide/replace/flip) are skipped —
  // resuming at the AI's turn boundary just lets it retake the turn — which
  // avoids a synchronous localStorage write per AI micro-action. Cleared
  // automatically once the game is over.
  useEffect(() => {
    const aiMidTurn =
      game.players[game.currentPlayer]?.isAI &&
      (game.phase === "decide" ||
        game.phase === "replace" ||
        game.phase === "flip");
    if (aiMidTurn) return;
    saveGame(game);
  }, [game]);

  // Soft cue when the turn comes (back) to a human — the moment you need to
  // look up from whatever you were doing, or pass the phone in duo.
  useEffect(() => {
    const prev = prevTurn.current;
    prevTurn.current = game.currentPlayer;
    if (paused) return;
    if (prev === null || prev === game.currentPlayer) return;
    if (game.phase !== "draw") return;
    if (game.players[game.currentPlayer].isAI) return;
    playSound("turn");
    vibrate("light");
  }, [game, paused]);

  // --- Side effects driven by the events of the latest transition -----------
  useEffect(() => {
    if (processed.current === game.events) return;
    processed.current = game.events;

    for (const ev of game.events) {
      switch (ev.type) {
        case "columnCleared":
          playSound("clear");
          if (ev.player === 0) {
            vibrate("success");
            columnsThisRound.current += 1;
          }
          break;
        case "roundClosed":
          vibrate("medium");
          break;
        case "roundOver": {
          // Stats track the solo "you vs computer" experience; a hot-seat duo
          // game has no single "you", so we don't record it.
          if (game.mode === "duo") {
            columnsThisRound.current = 0;
            break;
          }
          const humanRound = game.players[0].lastRoundScore;
          setStats((prev) => {
            const next = recordRound(prev, {
              playerRoundScore: humanRound,
              columnsClearedThisRound: columnsThisRound.current,
            });
            saveStats(next);
            return next;
          });
          columnsThisRound.current = 0;
          break;
        }
        case "gameOver": {
          const winner = lowestTotalIndex(game.players);
          if (game.mode === "duo") {
            // No stats in duo; still cue a celebratory sound/vibration.
            playSound("win");
            vibrate("success");
            break;
          }
          const won = winner === 0;
          setStats((prev) => {
            const next = recordGame(prev, {
              won,
              playerTotal: game.players[0].totalScore,
              difficulty: game.difficulty,
            });
            saveStats(next);
            return next;
          });
          playSound(won ? "win" : "lose");
          vibrate(won ? "success" : "error");
          break;
        }
      }
    }
  }, [game]);

  // --- Drive AI turns -------------------------------------------------------
  useEffect(() => {
    const current = game.players[game.currentPlayer];
    const actionable =
      game.phase === "setup" ||
      game.phase === "draw" ||
      game.phase === "decide" ||
      game.phase === "replace" ||
      game.phase === "flip";

    if (paused || !current?.isAI || !actionable) {
      setAiThinking(false);
      return;
    }

    setAiThinking(true);
    const delay = AI_DELAY[game.phase as keyof typeof AI_DELAY] ?? 600;
    aiTimer.current = setTimeout(() => {
      const action = aiChooseAction(game);
      if (action) setGame((g) => reduce(g, action));
    }, delay);

    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
    };
  }, [game, paused]);

  const dispatch = useCallback(
    (action: GameAction) => {
      // Sound/haptic cues for the human's own inputs.
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
      setGame((g) => reduce(g, action));
    },
    []
  );

  const newGame = useCallback((opts: CreateGameOptions) => {
    columnsThisRound.current = 0;
    setGame(createGame(opts));
  }, []);

  const nextRound = useCallback(() => {
    columnsThisRound.current = 0;
    setGame((g) => dealNextRound(g));
  }, []);

  useEffect(() => () => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
  }, []);

  return { game, stats, aiThinking, dispatch, newGame, nextRound };
};
