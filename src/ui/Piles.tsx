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
  /** Compact variant for the face-to-face centre table. */
  size?: "sm" | "md";
}

// Card footprints per size, used for the stacked-deck look and the empty slot.
const DIMS = {
  sm: { w: 52, h: 72 },
  md: { w: 62, h: 86 },
} as const;

export const Piles = ({
  deckCount,
  discardTop,
  canDraw,
  canTakeDiscard,
  onDrawDeck,
  onTakeDiscard,
  size = "md",
}: PilesProps) => {
  const { w, h } = DIMS[size];
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        size === "md" ? "gap-6" : "gap-4"
      )}
    >
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
          <div
            className="absolute -right-1 -bottom-1 rounded-xl bg-white/10"
            style={{ width: w, height: h }}
          />
          <div
            className="absolute -right-0.5 -bottom-0.5 rounded-xl bg-white/15"
            style={{ width: w, height: h }}
          />
          <PlayingCard
            card={{ id: "deck", value: 0, faceUp: false }}
            size={size}
          />
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
            <PlayingCard card={{ ...discardTop, faceUp: true }} size={size} />
          ) : (
            <div
              className="rounded-xl border-2 border-dashed border-white/20"
              style={{ width: w, height: h }}
            />
          )}
        </button>
        <span className="text-[11px] font-medium text-white/70">Défausse</span>
      </div>
    </div>
  );
};
