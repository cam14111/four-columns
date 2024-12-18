import { Button } from "@/components/ui/button";
import { GameState } from "@/lib/types";

interface GameControlsProps {
  gameState: GameState;
  onDrawFromDeck: () => void;
  onDrawFromDiscard: () => void;
  disabled?: boolean;
}

export const GameControls = ({
  gameState,
  onDrawFromDeck,
  onDrawFromDiscard,
  disabled
}: GameControlsProps) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  
  return (
    <div className="space-y-4">
      <div className="text-lg font-medium text-game-primary">
        Tour de {currentPlayer.name}
      </div>
      <div className="flex gap-4">
        <Button
          onClick={onDrawFromDeck}
          disabled={disabled || gameState.gamePhase !== "draw"}
          className="bg-game-primary hover:bg-game-secondary"
        >
          Piocher
        </Button>
        <Button
          onClick={onDrawFromDiscard}
          disabled={disabled || gameState.gamePhase !== "draw" || gameState.discardPile.length === 0}
          className="bg-game-secondary hover:bg-game-primary"
        >
          Prendre la défausse
        </Button>
      </div>
    </div>
  );
};