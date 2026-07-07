import { useState } from "react";
import { Card as CardType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CardFace, CardBack } from "./CardVisual";

interface CardProps {
  card: CardType;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export const Card = ({ card, onClick, className, disabled }: CardProps) => {
  const [isFlipping, setIsFlipping] = useState(false);

  const handleClick = () => {
    if (disabled || !onClick) return;
    setIsFlipping(true);
    setTimeout(() => {
      onClick();
      setIsFlipping(false);
    }, 300);
  };

  return (
    <div
      className={cn(
        "relative w-14 h-20 md:w-16 md:h-24 cursor-pointer perspective-1000",
        disabled && "cursor-default opacity-70",
        className
      )}
      onClick={handleClick}
    >
      <div
        className={cn(
          "absolute w-full h-full transition-transform duration-300 transform-style-3d",
          isFlipping && "animate-card-flip",
          card.state === "visible" && "rotate-y-180"
        )}
      >
        {/* Face avant (dos de la carte) */}
        <div
          className={cn(
            "absolute w-full h-full backface-hidden rounded-lg shadow-md",
            card.state === "visible" && "hidden"
          )}
        >
          <CardBack />
        </div>
        {/* Face arrière (valeur de la carte) */}
        <div
          className={cn(
            "absolute w-full h-full backface-hidden rotate-y-180 rounded-lg shadow-md overflow-hidden",
            card.state === "hidden" && "hidden"
          )}
        >
          <CardFace value={card.value} />
        </div>
      </div>
    </div>
  );
};