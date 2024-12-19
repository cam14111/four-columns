import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { TurnActions } from "./TurnActions";
import { Card as CardType, GamePhase } from "@/lib/types";

interface TurnPhaseProps {
  gamePhase: GamePhase;
  selectedCard: CardType | null;
  onKeepCard: () => void;
  onDiscardCard: () => void;
  isCurrentPlayerAI: boolean;
}

export const TurnPhase = ({ 
  gamePhase, 
  selectedCard, 
  onKeepCard, 
  onDiscardCard,
  isCurrentPlayerAI 
}: TurnPhaseProps) => {
  const showDialog = gamePhase === "action" && selectedCard !== null;

  return (
    <Dialog open={showDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Que souhaitez-vous faire avec cette carte ?</DialogTitle>
        </DialogHeader>
        <TurnActions
          selectedCard={selectedCard}
          onKeepCard={onKeepCard}
          onDiscardCard={onDiscardCard}
          disabled={isCurrentPlayerAI}
        />
      </DialogContent>
    </Dialog>
  );
};