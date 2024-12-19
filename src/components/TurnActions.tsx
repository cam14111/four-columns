import { Button } from "./ui/button";
import { Card as CardType, GamePhase } from "@/lib/types";
import { Card } from "./Card";

interface TurnActionsProps {
  selectedCard: CardType | null;
  onKeepCard: () => void;
  onDiscardCard: () => void;
  disabled?: boolean;
}

export const TurnActions = ({ selectedCard, onKeepCard, onDiscardCard, disabled }: TurnActionsProps) => {
  if (!selectedCard) return null;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <Card card={selectedCard} className="mx-auto" />
      </div>
      <div className="flex justify-center gap-4">
        <Button 
          onClick={onKeepCard}
          disabled={disabled}
          variant="default"
        >
          Garder la carte
        </Button>
        <Button 
          onClick={onDiscardCard}
          disabled={disabled}
          variant="secondary"
        >
          Défausser la carte
        </Button>
      </div>
    </div>
  );
};