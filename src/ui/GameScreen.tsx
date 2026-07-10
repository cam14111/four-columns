import { useCallback, useEffect, useRef, useState } from "react";
import { FlipVertical2, Menu } from "lucide-react";
import { DuoLayout, GameState } from "@/game/types";
import { GameAction } from "@/game/types";
import { DIFFICULTY_LABEL, GRID_DIMS } from "./theme";
import { Grid, PlayerBadge } from "./Grid";
import { Piles } from "./Piles";
import { PlayingCard } from "./PlayingCard";
import { FaceToFace } from "./FaceToFace";
import { HandoffOverlay } from "./HandoffOverlay";
import { ScaledBox } from "./ScaledBox";
import { moveFlash, moveSummary, useLastMove } from "./lastMove";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Pass-the-phone hand-off state machine
// ---------------------------------------------------------------------------
//
// When a turn ends in duo "pass" layout the board must NOT flip immediately:
// the player who just moved needs a beat to see the result. The sequence is:
//
//   linger  — board stays on the outgoing player's perspective; their move is
//             spotlit and summarised. All inputs are naturally inert (it is no
//             longer their turn).
//   cover   — the opaque hand-off screen fades in over the board.
//   ready   — the board swaps perspective *behind* the cover; the overlay
//             stays up long enough to be read, then leaves on its own (a tap
//             skips ahead).
//   leaving — the cover fades out, revealing a board already facing them.

type HandoffStage = "linger" | "cover" | "ready" | "leaving" | null;

const LINGER_PLAY_MS = 1350;
const LINGER_SETUP_MS = 750;
const COVER_MS = 300;
// How long the hand-off screen stays once readable: enough to hand the phone
// over and read who plays + what just happened, without stalling the game.
const READY_MS = 1900;
const LEAVE_MS = 200;

interface PassHandoff {
  /** Which player's perspective the board currently shows. */
  viewIndex: number;
  stage: HandoffStage;
  /** Bumps every time a hand-off completes, to replay the board-in entrance. */
  revealSeq: number;
  dismiss: () => void;
}

/** Tracks a media query so component-level sizes can follow the viewport. */
const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
};

const usePassHandoff = (game: GameState, enabled: boolean): PassHandoff => {
  const [viewIndex, setViewIndex] = useState(game.currentPlayer);
  const [stage, setStage] = useState<HandoffStage>(null);
  const [revealSeq, setRevealSeq] = useState(0);
  const prevPlayer = useRef(game.currentPlayer);
  const prevRound = useRef(game.round);
  const currentRef = useRef(game.currentPlayer);
  currentRef.current = game.currentPlayer;

  // While disabled (solo, face-to-face) just mirror the engine.
  useEffect(() => {
    if (enabled) return;
    prevPlayer.current = game.currentPlayer;
    setStage(null);
    setViewIndex(game.currentPlayer);
  }, [enabled, game.currentPlayer]);

  // A new round re-deals everything under the round-over panel; reset the
  // perspective silently instead of staging a hand-off.
  useEffect(() => {
    if (game.round === prevRound.current) return;
    prevRound.current = game.round;
    prevPlayer.current = game.currentPlayer;
    setStage(null);
    setViewIndex(game.currentPlayer);
  }, [game.round, game.currentPlayer]);

  // Turn changed hands -> start the staged hand-off.
  useEffect(() => {
    if (!enabled) return;
    if (game.currentPlayer === prevPlayer.current) return;
    prevPlayer.current = game.currentPlayer;
    if (game.phase !== "draw" && game.phase !== "setup") {
      setStage(null);
      setViewIndex(game.currentPlayer);
      return;
    }
    setStage("linger");
    const t = setTimeout(
      () => setStage("cover"),
      game.phase === "setup" ? LINGER_SETUP_MS : LINGER_PLAY_MS
    );
    return () => clearTimeout(t);
  }, [enabled, game.currentPlayer, game.phase]);

  // Timed stage transitions: swap the board once fully covered; leave on our
  // own after a readable beat; drop the overlay once its exit fade finishes.
  useEffect(() => {
    if (stage === "cover") {
      const t = setTimeout(() => {
        setViewIndex(currentRef.current);
        setStage("ready");
      }, COVER_MS);
      return () => clearTimeout(t);
    }
    if (stage === "ready") {
      const t = setTimeout(() => setStage("leaving"), READY_MS);
      return () => clearTimeout(t);
    }
    if (stage === "leaving") {
      const t = setTimeout(() => {
        setStage(null);
        setRevealSeq((s) => s + 1);
      }, LEAVE_MS);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const dismiss = useCallback(
    () => setStage((s) => (s === "ready" ? "leaving" : s)),
    []
  );

  return { viewIndex, stage, revealSeq, dismiss };
};

// ---------------------------------------------------------------------------
// Game screen
// ---------------------------------------------------------------------------

interface GameScreenProps {
  game: GameState;
  aiThinking: boolean;
  dispatch: (a: GameAction) => void;
  onOpenMenu: () => void;
  /** Duo display layout (ignored in solo). */
  duoLayout: DuoLayout;
  /** Flip between the two duo layouts (pass-the-phone ↔ face-to-face). */
  onToggleLayout: () => void;
}

export const GameScreen = ({
  game,
  aiThinking,
  dispatch,
  onOpenMenu,
  duoLayout,
  onToggleLayout,
}: GameScreenProps) => {
  const duo = game.mode === "duo";
  const phase = game.phase;
  const activeIndex = game.currentPlayer;
  const lastMove = useLastMove(game);
  // Compact piles on short screens so both boards keep breathing room.
  const shortScreen = useMediaQuery("(max-height: 760px)");

  const passEnabled = duo && duoLayout === "pass";
  const { viewIndex, stage, revealSeq, dismiss } = usePassHandoff(
    game,
    passEnabled
  );

  // Interaction always belongs to the player who owns the grid, and only while
  // it is genuinely their (human) turn. Keying by player index lets both duo
  // layouts reuse the exact same rules.
  const selectableFor = (index: number, playerIndex: number): boolean => {
    if (playerIndex !== activeIndex || aiThinking) return false;
    if (game.players[playerIndex].isAI) return false;
    const c = game.players[playerIndex].grid[index];
    if (phase === "setup") return !!c && !c.faceUp;
    if (phase === "replace") return !!c;
    if (phase === "flip") return !!c && !c.faceUp;
    return false;
  };

  const handleFor = (index: number, playerIndex: number) => {
    if (playerIndex !== activeIndex || aiThinking) return;
    if (game.players[playerIndex].isAI) return;
    const c = game.players[playerIndex].grid[index];
    if (!c) return;
    if (phase === "setup" && !c.faceUp) {
      dispatch({ type: "revealInitial", player: playerIndex, index });
    } else if (phase === "replace") {
      dispatch({ type: "placeAt", index });
    } else if (phase === "flip" && !c.faceUp) {
      dispatch({ type: "flipAt", index });
    }
  };

  const prompt = getPrompt(game, aiThinking);

  // ---- Face-to-face --------------------------------------------------------
  if (duo && duoLayout === "face") {
    return (
      <FaceToFace
        game={game}
        dispatch={dispatch}
        prompt={prompt}
        selectableFor={selectableFor}
        handleFor={handleFor}
        lastMove={lastMove}
        onToggleLayout={onToggleLayout}
        onOpenMenu={onOpenMenu}
      />
    );
  }

  // ---- Pass-the-phone (and solo): active player anchored to the bottom ------
  // Solo keeps the human anchored at the bottom (the AI never "sits down" at
  // the phone). Duo hot-seat shows whoever the hand-off machine says (it lags
  // the engine so the outgoing player sees their result before the swap).
  const bottomIndex = duo ? viewIndex : 0;
  const topIndex = 1 - bottomIndex;
  const bottomPlayer = game.players[bottomIndex];
  const topPlayer = game.players[topIndex];

  const bottomIsCurrent = activeIndex === bottomIndex;
  const canAct = bottomIsCurrent && !aiThinking;
  // During the linger the *outgoing* player still owns the screen: keep the
  // active styling on their (bottom) board so the eye stays on the result.
  const displayActive = stage === "linger" ? bottomIndex : activeIndex;
  const bottomFinalTurn = game.closedBy !== null && displayActive === bottomIndex;
  const topFinalTurn = game.closedBy !== null && displayActive === topIndex;

  // While lingering, the status bubble narrates what just happened instead of
  // prompting the (not-yet-arrived) next player.
  const lingerText =
    stage === "linger"
      ? lastMove && lastMove.player === bottomIndex
        ? moveFlash(lastMove)
        : "Cartes révélées ✓"
      : null;

  const overlayVisible =
    passEnabled &&
    (stage === "cover" || stage === "ready" || stage === "leaving");

  const highlightFor = (playerIndex: number) =>
    lastMove && lastMove.player === playerIndex ? lastMove.index : null;

  return (
    <div className="app-bg flex min-h-[100dvh] flex-col text-white">
      {/* Top bar — hug the real safe area (camera cutout) as closely as
          possible in fullscreen; a tiny 0.25rem floor keeps a hair of breathing
          room on devices that report a zero inset. */}
      <header className="flex items-center justify-between gap-2 px-3 pt-[max(0.25rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            Manche {game.round}
          </span>
          <span className="whitespace-nowrap rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            {duo ? "2 joueurs" : DIFFICULTY_LABEL[game.difficulty]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {duo && (
            <button
              type="button"
              onClick={onToggleLayout}
              aria-label="Passer à l'affichage face à face"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20"
            >
              <FlipVertical2 size={14} />
              Face à face
            </button>
          )}
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Menu"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      <main
        key={duo ? `view-${viewIndex}-r${revealSeq}` : "solo"}
        className="animate-board-in flex flex-1 flex-col justify-between gap-2 px-3 pb-2"
      >
        {/* Opponent / other player */}
        <section className="flex flex-col items-center gap-1.5">
          <PlayerBadge
            player={topPlayer}
            active={displayActive === topIndex && phase !== "roundOver"}
            finalTurn={topFinalTurn}
            live
          />
          <ScaledBox
            width={GRID_DIMS.sm.w}
            height={GRID_DIMS.sm.h}
            scale="var(--pass-top)"
          >
            <Grid
              player={topPlayer}
              size="sm"
              active={displayActive === topIndex && phase !== "roundOver"}
              dealKey={game.round}
              highlightIndex={highlightFor(topIndex)}
              highlightSeq={lastMove?.seq}
            />
          </ScaledBox>
        </section>

        {/* Middle: piles + held/prompt */}
        <section className="flex flex-col items-center gap-3 py-1">
          <Piles
            size={shortScreen ? "sm" : "md"}
            deckCount={game.deck.length}
            discardTop={game.discard[0] ?? null}
            canDraw={canAct && phase === "draw"}
            canTakeDiscard={
              canAct && phase === "draw" && game.discard.length > 0
            }
            onDrawDeck={() => dispatch({ type: "drawFromDeck" })}
            onTakeDiscard={() => dispatch({ type: "takeFromDiscard" })}
          />

          <div
            role="status"
            aria-live="polite"
            className={cn(
              "min-h-[2rem] rounded-full px-4 py-1.5 text-center text-sm font-medium transition-colors",
              aiThinking
                ? "bg-fuchsia-500/20 text-fuchsia-100"
                : lingerText
                  ? "bg-amber-300/20 text-amber-100"
                  : "bg-white/10 text-white/90"
            )}
          >
            {lingerText ?? prompt}
          </div>

          {/* Show what the AI drew while it decides/places — watching its pick
              is half the drama of a card game. */}
          {game.players[activeIndex].isAI && game.held && (
            <div className="animate-pop flex items-center gap-2 rounded-full bg-slate-950/70 px-3 py-1.5">
              <span className="text-xs text-white/80">
                {game.heldSource === "discard"
                  ? "L'ordinateur prend la défausse"
                  : "L'ordinateur a pioché"}
              </span>
              <div className="scale-75">
                <PlayingCard card={{ ...game.held, faceUp: true }} size="sm" />
              </div>
            </div>
          )}
        </section>

        {/* Bottom player (interactive) */}
        <section className="flex flex-col items-center gap-1.5">
          <ScaledBox
            width={GRID_DIMS.md.w}
            height={GRID_DIMS.md.h}
            scale="var(--pass-bottom)"
          >
            <Grid
              player={bottomPlayer}
              size="md"
              onCardClick={(i) => handleFor(i, bottomIndex)}
              selectableIndex={(i) => selectableFor(i, bottomIndex)}
              disabled={!canAct}
              active={displayActive === bottomIndex && phase !== "roundOver"}
              dealKey={game.round}
              highlightIndex={highlightFor(bottomIndex)}
              highlightSeq={lastMove?.seq}
            />
          </ScaledBox>
          <PlayerBadge
            player={bottomPlayer}
            active={displayActive === bottomIndex && phase !== "roundOver"}
            finalTurn={bottomFinalTurn}
            live
          />
        </section>
      </main>

      {/* Decide action bar (drawn a deck card: keep or discard) */}
      {phase === "decide" && canAct && game.held && (
        <div className="sticky bottom-0 z-20 flex items-center justify-center gap-4 border-t border-white/10 bg-slate-950/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="animate-pop">
            <PlayingCard card={{ ...game.held, faceUp: true }} size="md" />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => dispatch({ type: "keep" })}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              Garder & remplacer
            </Button>
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: "discardDrawn" })}
            >
              Défausser & retourner
            </Button>
          </div>
        </div>
      )}

      {/* Held card indicator while placing (from discard or after keep) */}
      {(phase === "replace" || phase === "flip") && canAct && (
        <div className="pointer-events-none sticky bottom-0 z-10 flex items-center justify-center gap-3 px-4 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {game.held && phase === "replace" && (
            <div className="flex items-center gap-2 rounded-full bg-slate-950/70 px-3 py-1.5 backdrop-blur">
              <span className="text-xs text-white/80">En main</span>
              <div className="scale-75">
                <PlayingCard card={{ ...game.held, faceUp: true }} size="sm" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* "Passe le téléphone" interstitial */}
      {overlayVisible && (
        <HandoffOverlay
          name={game.players[activeIndex].name}
          summary={
            lastMove
              ? moveSummary(lastMove, game.players[lastMove.player].name)
              : null
          }
          hint={
            phase === "setup"
              ? "Retourne 2 cartes pour préparer ta grille."
              : null
          }
          finalTurn={game.closedBy !== null && phase === "draw"}
          ready={stage === "ready"}
          leaving={stage === "leaving"}
          onContinue={dismiss}
        />
      )}
    </div>
  );
};

const getPrompt = (game: GameState, aiThinking: boolean): string => {
  if (aiThinking) return "L'ordinateur réfléchit…";
  const current = game.players[game.currentPlayer];
  if (current.isAI) return "Tour de l'ordinateur";
  const duo = game.mode === "duo";
  switch (game.phase) {
    case "setup":
      return duo
        ? `${current.name} : retournez 2 cartes`
        : "Retournez 2 cartes de votre grille";
    case "draw":
      return duo
        ? `À ${current.name} de jouer : piochez ou prenez la défausse`
        : "Piochez une carte ou prenez la défausse";
    case "decide":
      return "Garder cette carte ou la défausser ?";
    case "replace":
      return "Choisissez la carte à remplacer";
    case "flip":
      return "Retournez une carte cachée";
    default:
      return "";
  }
};
