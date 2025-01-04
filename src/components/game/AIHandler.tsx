import { GameState, Player } from "@/lib/types";
import { selectInitialCardsForAI } from "@/lib/aiLogic";
import { determineFirstPlayer } from "@/lib/gameLogic";
import { useToast } from "@/hooks/use-toast";

interface AIHandlerProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

export const useAIHandler = ({ gameState, setGameState }: AIHandlerProps) => {
  const { toast } = useToast();

  const handleAITurn = () => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    if (currentPlayer?.isAI && gameState.gamePhase === "selectInitialCards") {
      setTimeout(() => {
        const { newGrid, initialCardsSum } = selectInitialCardsForAI(currentPlayer);
        
        setGameState(prev => {
          const newPlayers = [...prev.players];
          newPlayers[prev.currentPlayerIndex] = {
            ...currentPlayer,
            grid: newGrid,
            initialCardsSum
          };
          
          // Vérifier si les deux joueurs ont sélectionné leurs cartes
          const allPlayersSelected = newPlayers.every(p => p.initialCardsSum !== undefined);
          
          if (allPlayersSelected) {
            const firstPlayerIndex = determineFirstPlayer(newPlayers);
            const startingPlayer = newPlayers[firstPlayerIndex];
            
            toast({
              title: "Premier joueur déterminé !",
              description: `${startingPlayer.name} commence avec la plus grande somme (${startingPlayer.initialCardsSum}).`
            });
            
            return {
              ...prev,
              players: newPlayers,
              currentPlayerIndex: firstPlayerIndex,
              gamePhase: "draw",
              selectedInitialCards: 0
            };
          }
          
          return {
            ...prev,
            players: newPlayers,
            currentPlayerIndex: (prev.currentPlayerIndex + 1) % newPlayers.length,
            selectedInitialCards: 0
          };
        });
      }, 1000);
    }
  };

  return { handleAITurn };
};