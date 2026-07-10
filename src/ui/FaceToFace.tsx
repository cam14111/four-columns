import { useEffect, useState } from "react";
import { FlipVertical2, Menu } from "lucide-react";
import { GameAction, GameState } from "@/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Grid, PlayerBadge } from "./Grid";
import { Piles } from "./Piles";
import { PlayingCard } from "./PlayingCard";
import { ScaledBox } from "./ScaledBox";
import { GRID_DIMS } from "./theme";
import { LastMove } from "./lastMove";

/**
 * Lags a value by `ms`. The visual side of a turn change (board sizes, table
 * rotation) trails the actual state so the player who just moved sees their
 * result land on the big board before it shrinks away.
 */
const useDelayed = <T,>(value: T, ms: number): T => {
  const [delayed, setDelayed] = useState(value);
  useEffect(() => {
    if (delayed === value) return;
    const t = setTimeout(() => setDelayed(value), ms);
    return () => clearTimeout(t);
  }, [value, ms, delayed]);
  return delayed;
};

interface FaceToFaceProps {
  game: GameState;
  dispatch: (a: GameAction) => void;
  prompt: string;
  selectableFor: (index: number, playerIndex: number) => boolean;
  handleFor: (index: number, playerIndex: number) => void;
  lastMove: LastMove | null;
  onToggleLayout: () => void;
  onOpenMenu: () => void;
}

/**
 * "Face à face": the two players sit on opposite sides of the phone. Each
 * keeps a fixed half with their board facing them (the far half is rotated
 * 180°). The shared table — piles, prompt, decide actions — lives in a centre
 * strip that turns toward whoever is playing, and the two boards smoothly
 * trade sizes so the active player always has the large one.
 */
export const FaceToFace = ({
  game,
  dispatch,
  prompt,
  selectableFor,
  handleFor,
  lastMove,
  onToggleLayout,
  onOpenMenu,
}: FaceToFaceProps) => {
  const phase = game.phase;
  const activeIndex = game.currentPlayer;
  const playing = phase !== "roundOver" && phase !== "gameOver";
  // Board sizes and table orientation follow the turn with a small delay so
  // the just-played move is read on the large board before it shrinks.
  const visualActive = useDelayed(activeIndex, 700);

  const half = (index: number, rotated: boolean) => {
    const player = game.players[index];
    const isTurn = activeIndex === index && playing;
    const big = visualActive === index;
    return (
      <section
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-3 py-1",
          rotated && "rotate-180"
        )}
      >
        <ScaledBox
          width={GRID_DIMS.md.w}
          height={GRID_DIMS.md.h}
          scale={big ? "var(--face-lg)" : "var(--face-sm)"}
          animate
        >
          <Grid
            player={player}
            size="md"
            onCardClick={(i) => handleFor(i, index)}
            selectableIndex={(i) => selectableFor(i, index)}
            disabled={!isTurn}
            active={isTurn}
            dealKey={game.round}
            highlightIndex={
              lastMove && lastMove.player === index ? lastMove.index : null
            }
            highlightSeq={lastMove?.seq}
          />
        </ScaledBox>
        <PlayerBadge
          player={player}
          active={isTurn}
          finalTurn={game.closedBy !== null && isTurn}
          live
        />
      </section>
    );
  };

  return (
    <div className="app-bg flex h-[100dvh] flex-col overflow-hidden text-white">
      {/* Far side (player 2), rotated to face the player across the table. */}
      {half(1, true)}

      {/* Shared centre table. The playable part turns toward the active
          player; the neutral chrome (round, layout toggle, menu) stays put on
          the right edge, reachable from either seat. */}
      <div className="relative z-10 flex items-center justify-center border-y border-white/10 bg-black/25 py-1.5 pl-3 pr-12">
        <div
          className={cn(
            "table-turn flex items-center justify-center gap-3",
            visualActive === 1 && "rotate-180"
          )}
        >
          <Piles
            size="sm"
            deckCount={game.deck.length}
            discardTop={game.discard[0] ?? null}
            canDraw={playing && phase === "draw"}
            canTakeDiscard={
              playing && phase === "draw" && game.discard.length > 0
            }
            onDrawDeck={() => dispatch({ type: "drawFromDeck" })}
            onTakeDiscard={() => dispatch({ type: "takeFromDiscard" })}
          />

          <div className="flex w-32 flex-col items-center gap-1.5 sm:w-40">
            {phase === "decide" && game.held ? (
              <div className="flex items-center gap-2">
                <div className="animate-pop">
                  <PlayingCard
                    card={{ ...game.held, faceUp: true }}
                    size="sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    onClick={() => dispatch({ type: "keep" })}
                    className="h-7 bg-emerald-500 px-2.5 text-[11px] text-white hover:bg-emerald-600"
                  >
                    Garder
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => dispatch({ type: "discardDrawn" })}
                    className="h-7 px-2.5 text-[11px]"
                  >
                    Défausser
                  </Button>
                </div>
              </div>
            ) : phase === "replace" && game.held ? (
              <div className="flex items-center gap-2 rounded-full bg-slate-950/70 px-3 py-1">
                <span className="text-xs text-white/80">En main</span>
                <div className="scale-75">
                  <PlayingCard
                    card={{ ...game.held, faceUp: true }}
                    size="sm"
                  />
                </div>
              </div>
            ) : (
              <div
                role="status"
                aria-live="polite"
                className="rounded-2xl bg-white/10 px-3 py-1.5 text-center text-xs font-medium text-white/90"
              >
                {prompt}
              </div>
            )}
          </div>
        </div>

        <div className="absolute right-1.5 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1">
          <span
            className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold"
            aria-label={`Manche ${game.round}`}
          >
            M{game.round}
          </span>
          <button
            type="button"
            onClick={onToggleLayout}
            aria-label="Passer à l'affichage passe le téléphone"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <FlipVertical2 size={15} />
          </button>
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Menu"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <Menu size={15} />
          </button>
        </div>
      </div>

      {/* Near side (player 1). */}
      {half(0, false)}
    </div>
  );
};
