import { GameState } from "@/lib/types";
import { CardBack } from "./CardVisual";
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
        className={`relative ${isMobile ? 'scale-75 origin-top-left' : ''} w-16 h-24 md:w-16 md:h-24 cursor-pointer ${disabled || gameState.gamePhase !== "draw" ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => {
          if (!disabled && gameState.gamePhase === "draw") {
            onDrawFromDeck();
          }
        }}
      >
        <CardBack className="shadow-md" />
      </div>
    </div>
  );
};