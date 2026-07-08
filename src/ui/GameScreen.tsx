import { Menu } from "lucide-react";
import { GameState } from "@/game/types";
import { GameAction } from "@/game/types";
import { DIFFICULTY_LABEL } from "./theme";
import { Grid, PlayerBadge } from "./Grid";
import { Piles } from "./Piles";
import { PlayingCard } from "./PlayingCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GameScreenProps {
  game: GameState;
  aiThinking: boolean;
  dispatch: (a: GameAction) => void;
  onOpenMenu: () => void;
}

export const GameScreen = ({
  game,
  aiThinking,
  dispatch,
  onOpenMenu,
}: GameScreenProps) => {
  const human = game.players[0];
  const ai = game.players[1];
  const isHumanTurn = game.currentPlayer === 0;
  const phase = game.phase;

  const humanCanAct = isHumanTurn && !aiThinking;
  const setupHuman = phase === "setup" && isHumanTurn;

  // Which grid slots the human may click, per phase.
  const selectable = (index: number): boolean => {
    if (!humanCanAct) return false;
    const c = human.grid[index];
    if (setupHuman) return !!c && !c.faceUp;
    if (phase === "replace") return !!c;
    if (phase === "flip") return !!c && !c.faceUp;
    return false;
  };

  const handleHumanCard = (index: number) => {
    if (!humanCanAct) return;
    const c = human.grid[index];
    if (!c) return;
    if (setupHuman && !c.faceUp) {
      dispatch({ type: "revealInitial", player: 0, index });
    } else if (phase === "replace") {
      dispatch({ type: "placeAt", index });
    } else if (phase === "flip" && !c.faceUp) {
      dispatch({ type: "flipAt", index });
    }
  };

  const prompt = getPrompt(game, aiThinking);
  const finalTurnFor = game.closedBy !== null ? game.currentPlayer : null;

  return (
    <div className="app-bg flex min-h-[100dvh] flex-col text-white">
      {/* Top bar — keep clear of a translucent status bar / notch. The floor
          (1.25rem) covers a typical status bar even when safe-area insets
          report 0 (non-notch devices), so the header is never clipped. */}
      <header className="flex items-center justify-between gap-2 px-3 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            Manche {game.round}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            {DIFFICULTY_LABEL[game.difficulty]}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Menu"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <Menu size={18} />
        </button>
      </header>

      <main className="flex flex-1 flex-col justify-between gap-2 px-3 pb-2">
        {/* Opponent */}
        <section className="flex flex-col items-center gap-1.5">
          <PlayerBadge
            player={ai}
            active={game.currentPlayer === 1 && phase !== "roundOver"}
            finalTurn={finalTurnFor === 1}
            live
          />
          <Grid
            player={ai}
            size="sm"
            active={game.currentPlayer === 1 && phase !== "roundOver"}
            dealKey={game.round}
          />
        </section>

        {/* Middle: piles + held/prompt */}
        <section className="flex flex-col items-center gap-3 py-1">
          <Piles
            deckCount={game.deck.length}
            discardTop={game.discard[0] ?? null}
            canDraw={humanCanAct && phase === "draw"}
            canTakeDiscard={
              humanCanAct && phase === "draw" && game.discard.length > 0
            }
            onDrawDeck={() => dispatch({ type: "drawFromDeck" })}
            onTakeDiscard={() => dispatch({ type: "takeFromDiscard" })}
          />

          <div
            className={cn(
              "min-h-[2rem] rounded-full px-4 py-1.5 text-center text-sm font-medium transition-colors",
              aiThinking
                ? "bg-fuchsia-500/20 text-fuchsia-100"
                : "bg-white/10 text-white/90"
            )}
          >
            {prompt}
          </div>
        </section>

        {/* Player */}
        <section className="flex flex-col items-center gap-1.5">
          <Grid
            player={human}
            size="md"
            onCardClick={handleHumanCard}
            selectableIndex={selectable}
            disabled={!humanCanAct}
            active={isHumanTurn && phase !== "roundOver"}
            dealKey={game.round}
          />
          <PlayerBadge
            player={human}
            active={isHumanTurn && phase !== "roundOver"}
            finalTurn={finalTurnFor === 0}
            live
          />
        </section>
      </main>

      {/* Decide action bar (drawn a deck card: keep or discard) */}
      {phase === "decide" && isHumanTurn && game.held && (
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
      {(phase === "replace" || phase === "flip") && isHumanTurn && (
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
    </div>
  );
};

const getPrompt = (game: GameState, aiThinking: boolean): string => {
  if (aiThinking) return "L'ordinateur réfléchit…";
  const isHuman = game.currentPlayer === 0;
  if (!isHuman) return "Tour de l'ordinateur";
  switch (game.phase) {
    case "setup":
      return "Retournez 2 cartes de votre grille";
    case "draw":
      return "Piochez une carte ou prenez la défausse";
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
