import { Button } from "@/components/ui/button";
import { GameState } from "@/lib/types";
import { getCardBackImage } from "@/lib/cardImages";

interface GameControlsProps {
  gameState: GameState;
  onDrawFromDeck: () => void;
  disabled?: boolean;
}

export const GameControls = ({
  gameState,
  onDrawFromDeck,
  disabled
}: GameControlsProps) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  
  return (
    <div className="space-y-4">
      <div className="text-lg font-medium text-game-primary">
        Tour de {currentPlayer.name}
      </div>
      <div 
        className={`w-20 h-28 cursor-pointer ${disabled || gameState.gamePhase !== "draw" ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => {
          if (!disabled && gameState.gamePhase === "draw") {
            onDrawFromDeck();
          }
        }}
      >
        <img 
          src={getCardBackImage()} 
          alt="Pioche" 
          className="w-full h-full object-cover rounded-lg"
        />
      </div>
    </div>
  );
};