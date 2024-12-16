import { useState } from "react";
import { Card as CardType } from "@/lib/types";
import { cn } from "@/lib/utils";

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
        "relative w-20 h-28 cursor-pointer perspective-1000",
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
        <div className="absolute w-full h-full backface-hidden bg-game-card rounded-lg border-2 border-game-primary shadow-md flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-game-primary opacity-20" />
        </div>
        <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-game-card rounded-lg border-2 border-game-primary shadow-md flex items-center justify-center">
          <span className={cn(
            "text-2xl font-bold",
            card.value < 0 ? "text-red-500" :
            card.value === 0 ? "text-gray-500" :
            "text-game-primary"
          )}>
            {card.value}
          </span>
        </div>
      </div>
    </div>
  );
};