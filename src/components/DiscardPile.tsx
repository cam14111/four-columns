import { Card as CardType } from "@/lib/types";
import { Card } from "./Card";

interface DiscardPileProps {
  discardPile: CardType[];
}

export const DiscardPile = ({ discardPile }: DiscardPileProps) => {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-game-primary">Défausse</h2>
      <div className="relative h-28">
        {discardPile.length > 0 && (
          <Card
            card={discardPile[0]}
            className="absolute inset-0"
            disabled
          />
        )}
      </div>
    </div>
  );
};