import { Card as CardType, GameState } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { handleActionPhaseClick } from "./handlers/ActionPhaseHandler";
import { handleHiddenCardSelection } from "./handlers/HiddenCardHandler";
import { calculateInitialCardsSum, determineFirstPlayer } from "@/lib/gameLogic";

interface CardClickHandlerProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

export const useCardClickHandler = ({ gameState, setGameState }: CardClickHandlerProps) => {
  const { toast } = useToast();

  const handleCardClick = (clickedCard: CardType) => {
    if (gameState.gamePhase === "selectInitialCards") {
      handleInitialCardSelection(clickedCard);
    } else if (gameState.gamePhase === "action" && gameState.selectedCard) {
      handleActionPhaseClick(clickedCard, gameState, setGameState, toast);
    } else if (gameState.gamePhase === "selectHiddenCard" && clickedCard.state === "hidden") {
      handleHiddenCardSelection(clickedCard, gameState, setGameState, toast);
    }
  };

  const handleInitialCardSelection = (clickedCard: CardType) => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const cardIndex = currentPlayer.grid.findIndex(c => c.id === clickedCard.id);
    const newGrid = [...currentPlayer.grid];
    newGrid[cardIndex] = { ...clickedCard, state: "visible" as const };
    
    const newPlayers = [...gameState.players];
    const newSelectedCards = gameState.selectedInitialCards + 1;
    
    if (newSelectedCards === 2) {
      const newPlayer = {
        ...currentPlayer,
        grid: newGrid,
        initialCardsSum: calculateInitialCardsSum(newGrid)
      };
      newPlayers[gameState.currentPlayerIndex] = newPlayer;
      
      const nextPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
      const allPlayersSelected = nextPlayerIndex === 0;
      
      if (allPlayersSelected) {
        const firstPlayerIndex = determineFirstPlayer(newPlayers);
        toast({
          title: "Premier joueur déterminé !",
          description: `${newPlayers[firstPlayerIndex].name} commence avec la plus grande somme.`
        });
        
        setGameState({
          ...gameState,
          players: newPlayers,
          currentPlayerIndex: firstPlayerIndex,
          gamePhase: "draw",
          selectedInitialCards: 0
        });
      } else {
        setGameState({
          ...gameState,
          players: newPlayers,
          currentPlayerIndex: nextPlayerIndex,
          selectedInitialCards: 0
        });
      }
    } else {
      newPlayers[gameState.currentPlayerIndex] = {
        ...currentPlayer,
        grid: newGrid
      };
      
      setGameState({
        ...gameState,
        players: newPlayers,
        selectedInitialCards: newSelectedCards
      });
    }
  };

  return {
    handleCardClick
  };
};