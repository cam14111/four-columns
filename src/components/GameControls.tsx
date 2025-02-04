import { Button } from "@/components/ui/button";
import { GameState } from "@/lib/types";
import { getCardBackImage } from "@/lib/cardImages";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  
  return (
    <div className="space-y-2 md:space-y-4">
      <div 
        className={`relative ${isMobile ? 'scale-75 origin-top-left' : ''} w-16 h-24 md:w-20 md:h-28 cursor-pointer ${disabled || gameState.gamePhase !== "draw" ? 'opacity-50 cursor-not-allowed' : ''}`}
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