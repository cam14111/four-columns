import { memo } from "react";
import { Card } from "@/game/types";
import { cn } from "@/lib/utils";
import { cardGradient, cardTier } from "./theme";

interface PlayingCardProps {
  card: Card | null;
  onClick?: () => void;
  /** Highlight as a legal target for the current action. */
  selectable?: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  dealDelay?: number; // staggered deal-in animation (ms)
  clearing?: boolean;
}

const SIZES = {
  sm: "w-[52px] h-[72px] text-xl",
  md: "w-[62px] h-[86px] text-2xl",
  lg: "w-[74px] h-[104px] text-3xl",
} as const;

const CornerNumbers = ({ value }: { value: number }) => (
  <>
    <span className="absolute top-1 left-1.5 text-[10px] font-bold leading-none opacity-90">
      {value}
    </span>
    <span className="absolute bottom-1 right-1.5 text-[10px] font-bold leading-none opacity-90 rotate-180">
      {value}
    </span>
  </>
);

const Face = ({ value }: { value: number }) => {
  const tier = cardTier(value);
  return (
    <div
      className="absolute inset-0 backface-hidden rotate-y-180 rounded-xl shadow-lg overflow-hidden flex items-center justify-center"
      style={{ background: cardGradient(value), color: tier.text }}
    >
      <div className="absolute inset-[3px] rounded-lg ring-1 ring-white/25" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.55), transparent 45%)",
        }}
      />
      <CornerNumbers value={value} />
      <span className="relative font-extrabold drop-shadow-sm tabular-nums">
        {value}
      </span>
    </div>
  );
};

const Back = () => (
  <div
    className="absolute inset-0 backface-hidden rounded-xl shadow-lg overflow-hidden flex items-center justify-center"
    style={{ background: "linear-gradient(150deg, #2f6fd0, #234f9e)" }}
  >
    <div className="absolute inset-[3px] rounded-lg ring-1 ring-white/20" />
    <div className="flex gap-[3px]">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="block w-[5px] h-9 rounded-full bg-white/80" />
      ))}
    </div>
  </div>
);

const EmptySlot = ({ size }: { size: "sm" | "md" | "lg" }) => (
  <div
    className={cn(
      SIZES[size],
      "rounded-xl border-2 border-dashed border-white/15 bg-white/[0.03]"
    )}
  />
);

export const PlayingCard = memo(
  ({
    card,
    onClick,
    selectable,
    disabled,
    size = "md",
    dealDelay,
    clearing,
  }: PlayingCardProps) => {
    if (card === null) return <EmptySlot size={size} />;

    const interactive = !!onClick && !disabled;

    return (
      <div
        className={cn(
          SIZES[size],
          "relative perspective select-none",
          interactive ? "cursor-pointer" : "cursor-default",
          clearing && "animate-clear"
        )}
        style={
          dealDelay !== undefined
            ? { animationDelay: `${dealDelay}ms` }
            : undefined
        }
        onClick={interactive ? onClick : undefined}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={
          card.faceUp ? `Carte ${card.value}` : "Carte face cachée"
        }
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
      >
        <div
          className={cn(
            "flip-transition absolute inset-0 preserve-3d transition-transform duration-500",
            card.faceUp && "rotate-y-180",
            selectable && "animate-pulse-ring rounded-xl"
          )}
        >
          <Back />
          <Face value={card.value} />
        </div>
      </div>
    );
  }
);

PlayingCard.displayName = "PlayingCard";
