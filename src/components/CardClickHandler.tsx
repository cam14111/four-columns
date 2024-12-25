import { Card as CardType, GameState, Player } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { checkColumnMatch, calculateInitialCardsSum, determineFirstPlayer } from "@/lib/gameLogic";

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
      handleActionPhaseClick(clickedCard);
    } else if (gameState.gamePhase === "selectHiddenCard" && clickedCard.state === "hidden") {
      handleHiddenCardSelection(clickedCard);
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

  const handleActionPhaseClick = (clickedCard: CardType) => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const cardIndex = currentPlayer.grid.findIndex(c => c.id === clickedCard.id);
    
    setGameState(prev => {
      const newGrid = [...prev.players[prev.currentPlayerIndex].grid];
      newGrid[cardIndex] = { ...prev.selectedCard!, state: "visible" as const };
      let newDiscardPile = [{ ...clickedCard, state: "visible" as const }, ...prev.discardPile];
      
      if (checkColumnMatch(newGrid, Math.floor(cardIndex / 3))) {
        const columnCards = newGrid.filter((_, index) => 
          Math.floor(index / 3) === Math.floor(cardIndex / 3)
        );
        
        newDiscardPile = [...columnCards, ...newDiscardPile];
        
        newGrid.forEach((card, index) => {
          if (Math.floor(index / 3) === Math.floor(cardIndex / 3)) {
            newGrid[index] = { ...card, state: "hidden" as const };
          }
        });
        
        toast({
          title: "Colonne complète !",
          description: "Les cartes de la colonne ont été défaussées."
        });
      }
      
      const newPlayers = [...prev.players];
      newPlayers[prev.currentPlayerIndex] = {
        ...currentPlayer,
        grid: newGrid
      };
      
      return {
        ...prev,
        players: newPlayers,
        discardPile: newDiscardPile,
        selectedCard: null,
        gamePhase: "draw",
        currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length
      };
    });
  };

  const handleHiddenCardSelection = (clickedCard: CardType) => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const cardIndex = currentPlayer.grid.findIndex(c => c.id === clickedCard.id);
    
    setGameState(prev => {
      const newGrid = [...prev.players[prev.currentPlayerIndex].grid];
      newGrid[cardIndex] = { ...clickedCard, state: "visible" as const };
      let newDiscardPile = [...prev.discardPile];
      
      if (checkColumnMatch(newGrid, Math.floor(cardIndex / 3))) {
        const columnCards = newGrid.filter((_, index) => 
          Math.floor(index / 3) === Math.floor(cardIndex / 3)
        );
        
        newDiscardPile = [...columnCards, ...newDiscardPile];
        
        newGrid.forEach((card, index) => {
          if (Math.floor(index / 3) === Math.floor(cardIndex / 3)) {
            newGrid[index] = { ...card, state: "hidden" as const };
          }
        });
        
        toast({
          title: "Colonne complète !",
          description: "Les cartes de la colonne ont été défaussées."
        });
      }
      
      const newPlayers = [...prev.players];
      newPlayers[prev.currentPlayerIndex] = {
        ...currentPlayer,
        grid: newGrid
      };
      
      return {
        ...prev,
        players: newPlayers,
        discardPile: newDiscardPile,
        gamePhase: "draw",
        currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length
      };
    });
  };

  return {
    handleCardClick
  };
};