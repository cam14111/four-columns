import { Card as CardType } from "@/lib/types";
import { Card } from "./Card";

interface DiscardPileProps {
  discardPile: CardType[];
  onDrawFromDiscard?: () => void;
  disabled?: boolean;
}

export const DiscardPile = ({ discardPile, onDrawFromDiscard, disabled }: DiscardPileProps) => {
  return (
    <div className="space-y-4">
      <div className="text-lg font-medium text-game-primary">
        Défausse
      </div>
      <div 
        className="relative h-28"
        onClick={() => {
          if (!disabled && onDrawFromDiscard && discardPile.length > 0) {
            onDrawFromDiscard();
          }
        }}
      >
        {discardPile.length > 0 && (
          <Card
            card={{ ...discardPile[0], state: "visible" }}
            className={`absolute inset-0 ${!disabled && onDrawFromDiscard ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
            disabled={disabled || !onDrawFromDiscard}
          />
        )}
      </div>
    </div>
  );
};