import { Card } from "@/game/types";
import { cn } from "@/lib/utils";
import { PlayingCard } from "./PlayingCard";

interface PilesProps {
  deckCount: number;
  discardTop: Card | null;
  canDraw: boolean;
  canTakeDiscard: boolean;
  onDrawDeck: () => void;
  onTakeDiscard: () => void;
}

export const Piles = ({
  deckCount,
  discardTop,
  canDraw,
  canTakeDiscard,
  onDrawDeck,
  onTakeDiscard,
}: PilesProps) => {
  return (
    <div className="flex items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={canDraw ? onDrawDeck : undefined}
          disabled={!canDraw}
          aria-label="Piocher dans la pioche"
          className={cn(
            "relative rounded-xl transition-transform",
            canDraw
              ? "cursor-pointer hover:-translate-y-0.5 animate-pulse-ring"
              : "opacity-60 cursor-default"
          )}
        >
          {/* stacked look */}
          <div className="absolute -right-1 -bottom-1 w-[62px] h-[86px] rounded-xl bg-white/10" />
          <div className="absolute -right-0.5 -bottom-0.5 w-[62px] h-[86px] rounded-xl bg-white/15" />
          <PlayingCard card={{ id: "deck", value: 0, faceUp: false }} size="md" />
        </button>
        <span className="text-[11px] font-medium text-white/70">
          Pioche · {deckCount}
        </span>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={canTakeDiscard ? onTakeDiscard : undefined}
          disabled={!canTakeDiscard}
          aria-label="Prendre la carte de la défausse"
          className={cn(
            "rounded-xl transition-transform",
            canTakeDiscard
              ? "cursor-pointer hover:-translate-y-0.5 animate-pulse-ring"
              : "cursor-default"
          )}
        >
          {discardTop ? (
            <PlayingCard card={{ ...discardTop, faceUp: true }} size="md" />
          ) : (
            <div className="w-[62px] h-[86px] rounded-xl border-2 border-dashed border-white/20" />
          )}
        </button>
        <span className="text-[11px] font-medium text-white/70">Défausse</span>
      </div>
    </div>
  );
};
