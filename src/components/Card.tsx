import { useState } from "react";
import { Card as CardType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getCardImage, getCardBackImage } from "@/lib/cardImages";

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
        <div className="absolute w-full h-full backface-hidden rounded-lg shadow-md">
          <img 
            src={getCardBackImage()} 
            alt="Card back" 
            className="w-full h-full object-cover rounded-lg"
          />
        </div>
        <div className="absolute w-full h-full backface-hidden rotate-y-180 rounded-lg shadow-md overflow-hidden">
          <img 
            src={getCardImage(card.value)} 
            alt={`Card value ${card.value}`}
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </div>
  );
};