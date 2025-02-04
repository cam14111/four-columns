import { Card as CardType } from "@/lib/types";
import { Card } from "./Card";
import { useIsMobile } from "@/hooks/use-mobile";

interface DiscardPileProps {
  discardPile: CardType[];
  onDrawFromDiscard?: () => void;
  disabled?: boolean;
}

export const DiscardPile = ({ discardPile, onDrawFromDiscard, disabled }: DiscardPileProps) => {
  const isMobile = useIsMobile();
  
  return (
    <div className="space-y-2 md:space-y-4">
      <div 
        className="relative h-20 md:h-24"
        onClick={() => {
          if (!disabled && onDrawFromDiscard && discardPile.length > 0) {
            onDrawFromDiscard();
          }
        }}
      >
        {discardPile.length > 0 && (
          <Card
            card={{ ...discardPile[0], state: "visible" }}
            className={`absolute inset-0 ${!disabled && onDrawFromDiscard ? 'cursor-pointer hover:scale-105 transition-transform' : ''} ${isMobile ? 'scale-90 origin-top-left' : ''}`}
            disabled={disabled || !onDrawFromDiscard}
          />
        )}
      </div>
    </div>
  );
};