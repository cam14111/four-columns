import { FlipVertical2, Menu } from "lucide-react";
import { DuoLayout, GameState } from "@/game/types";
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

  const layoutToggle = duo ? (
    <button
      type="button"
      onClick={onToggleLayout}
      aria-label="Changer l'affichage à deux joueurs"
      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20"
    >
      <FlipVertical2 size={14} />
      {duoLayout === "pass" ? "Face à face" : "Passe-tél."}
    </button>
  ) : null;

  // ---- Face-to-face: fixed sides, far player's half rotated 180° -----------
  if (duo && duoLayout === "face") {
    // The active (human) player's shared controls — piles, prompt, and any
    // keep/discard or held-card affordance — rendered inline so they inherit
    // the surrounding half's rotation and face the right player.
    const activeControls = (
      <div className="flex flex-col items-center gap-2">
        <Piles
          deckCount={game.deck.length}
          discardTop={game.discard[0] ?? null}
          canDraw={phase === "draw"}
          canTakeDiscard={phase === "draw" && game.discard.length > 0}
          onDrawDeck={() => dispatch({ type: "drawFromDeck" })}
          onTakeDiscard={() => dispatch({ type: "takeFromDiscard" })}
        />
        <div className="min-h-[2rem] rounded-full bg-white/10 px-4 py-1.5 text-center text-sm font-medium text-white/90">
          {prompt}
        </div>
        {phase === "decide" && game.held && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2">
            <div className="animate-pop">
              <PlayingCard card={{ ...game.held, faceUp: true }} size="sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                onClick={() => dispatch({ type: "keep" })}
                className="h-8 bg-emerald-500 px-3 text-xs text-white hover:bg-emerald-600"
              >
                Garder & remplacer
              </Button>
              <Button
                variant="secondary"
                onClick={() => dispatch({ type: "discardDrawn" })}
                className="h-8 px-3 text-xs"
              >
                Défausser & retourner
              </Button>
            </div>
          </div>
        )}
        {phase === "replace" && game.held && (
          <div className="flex items-center gap-2 rounded-full bg-slate-950/70 px-3 py-1.5">
            <span className="text-xs text-white/80">En main</span>
            <div className="scale-75">
              <PlayingCard card={{ ...game.held, faceUp: true }} size="sm" />
            </div>
          </div>
        )}
      </div>
    );

    const panel = (index: number, rotated: boolean) => {
      const player = game.players[index];
      const isActive = activeIndex === index && phase !== "roundOver";
      return (
        <section
          className={cn(
            "flex flex-1 flex-col items-center justify-between gap-2 px-3 py-2",
            rotated && "rotate-180"
          )}
        >
          <div className="flex min-h-[2rem] flex-col items-center justify-center">
            {isActive && activeControls}
          </div>
          <Grid
            player={player}
            size="sm"
            onCardClick={(i) => handleFor(i, index)}
            selectableIndex={(i) => selectableFor(i, index)}
            disabled={!isActive}
            active={isActive}
            dealKey={game.round}
          />
          <PlayerBadge
            player={player}
            active={isActive}
            finalTurn={game.closedBy !== null && activeIndex === index}
            live
          />
        </section>
      );
    };

    return (
      <div className="app-bg flex min-h-[100dvh] flex-col text-white">
        {/* Far side (player 2), rotated to face the player across the table. */}
        {panel(1, true)}

        {/* Neutral centre strip: reachable from either side, icon-forward so it
            reads either way up. */}
        <div className="flex items-center justify-center gap-2 border-y border-white/10 bg-black/25 px-3 py-1">
          <span className="rounded-full bg-white/10 px-3 py-0.5 text-xs font-semibold">
            Manche {game.round}
          </span>
          {layoutToggle}
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Menu"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <Menu size={16} />
          </button>
        </div>

        {/* Near side (player 1). */}
        {panel(0, false)}
      </div>
    );
  }

  // ---- Pass-the-phone (and solo): active player anchored to the bottom ------
  // Solo keeps the human anchored at the bottom (the AI never "sits down" at
  // the phone). Duo hot-seat puts whoever's turn it is on the bottom grid and
  // flips the board as play passes across the table.
  const bottomIndex = duo ? activeIndex : 0;
  const topIndex = duo ? 1 - activeIndex : 1;
  const bottomPlayer = game.players[bottomIndex];
  const topPlayer = game.players[topIndex];

  const bottomIsCurrent = activeIndex === bottomIndex;
  const canAct = bottomIsCurrent && !aiThinking;
  const bottomFinalTurn = game.closedBy !== null && activeIndex === bottomIndex;
  const topFinalTurn = game.closedBy !== null && activeIndex === topIndex;

  return (
    <div className="app-bg flex min-h-[100dvh] flex-col text-white">
      {/* Top bar — hug the real safe area (camera cutout) as closely as
          possible in fullscreen; a tiny 0.25rem floor keeps a hair of breathing
          room on devices that report a zero inset. */}
      <header className="flex items-center justify-between gap-2 px-3 pt-[max(0.25rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            Manche {game.round}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            {duo ? "2 joueurs" : DIFFICULTY_LABEL[game.difficulty]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {layoutToggle}
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

      <main className="flex flex-1 flex-col justify-between gap-2 px-3 pb-2">
        {/* Opponent / other player */}
        <section className="flex flex-col items-center gap-1.5">
          <PlayerBadge
            player={topPlayer}
            active={activeIndex === topIndex && phase !== "roundOver"}
            finalTurn={topFinalTurn}
            live
          />
          <Grid
            player={topPlayer}
            size="sm"
            active={activeIndex === topIndex && phase !== "roundOver"}
            dealKey={game.round}
          />
        </section>

        {/* Middle: piles + held/prompt */}
        <section className="flex flex-col items-center gap-3 py-1">
          <Piles
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

        {/* Bottom player (interactive) */}
        <section className="flex flex-col items-center gap-1.5">
          <Grid
            player={bottomPlayer}
            size="md"
            onCardClick={(i) => handleFor(i, bottomIndex)}
            selectableIndex={(i) => selectableFor(i, bottomIndex)}
            disabled={!canAct}
            active={bottomIsCurrent && phase !== "roundOver"}
            dealKey={game.round}
          />
          <PlayerBadge
            player={bottomPlayer}
            active={bottomIsCurrent && phase !== "roundOver"}
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
