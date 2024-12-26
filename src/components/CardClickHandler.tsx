import { Card as CardType, GameState, Player } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { checkColumnMatch, calculateInitialCardsSum, determineFirstPlayer } from "@/lib/gameLogic";
import { updatePlayerScores, isGameOver, determineWinner } from "@/lib/scoringLogic";

interface CardClickHandlerProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

export const useCardClickHandler = ({ gameState, setGameState }: CardClickHandlerProps) => {
  const { toast } = useToast();

  const checkRoundEnd = (currentPlayer: Player, players: Player[]) => {
    if (currentPlayer.grid.every(card => card.state === "visible")) {
      const updatedPlayers = updatePlayerScores(players);
      
      if (isGameOver(updatedPlayers)) {
        const winners = determineWinner(updatedPlayers);
        const winnerNames = winners.map(w => w.name).join(" et ");
        
        toast({
          title: "Fin de la partie !",
          description: `${winnerNames} ${winners.length > 1 ? 'remportent' : 'remporte'} la partie avec ${winners[0].totalScore} points !`
        });
        
        return {
          players: updatedPlayers,
          gamePhase: "gameEnd" as const,
          currentPlayerIndex: 0
        };
      } else {
        toast({
          title: "Fin de la manche !",
          description: "Les scores ont été mis à jour. Une nouvelle manche va commencer."
        });
        
        return {
          players: updatedPlayers,
          gamePhase: "roundEnd" as const,
          currentPlayerIndex: 0
        };
      }
    }
    return null;
  };

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
        const columnIndex = Math.floor(cardIndex / 3);
        const columnCards = newGrid.filter((_, index) => 
          Math.floor(index / 3) === columnIndex
        );
        
        newDiscardPile = [...columnCards, ...newDiscardPile];
        const filteredGrid = newGrid.filter((_, index) => 
          Math.floor(index / 3) !== columnIndex
        );
        
        const newPlayers = [...prev.players];
        newPlayers[prev.currentPlayerIndex] = {
          ...currentPlayer,
          grid: filteredGrid
        };
        
        toast({
          title: "Colonne complète !",
          description: "Les cartes de la colonne ont été défaussées."
        });

        const roundEndState = checkRoundEnd(
          { ...currentPlayer, grid: filteredGrid },
          newPlayers
        );
        
        if (roundEndState) {
          return {
            ...prev,
            ...roundEndState,
            discardPile: newDiscardPile,
            selectedCard: null
          };
        }
        
        return {
          ...prev,
          players: newPlayers,
          discardPile: newDiscardPile,
          selectedCard: null,
          gamePhase: "draw",
          currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length
        };
      }
      
      const newPlayers = [...prev.players];
      newPlayers[prev.currentPlayerIndex] = {
        ...currentPlayer,
        grid: newGrid
      };

      const roundEndState = checkRoundEnd(
        { ...currentPlayer, grid: newGrid },
        newPlayers
      );
      
      if (roundEndState) {
        return {
          ...prev,
          ...roundEndState,
          discardPile: newDiscardPile,
          selectedCard: null
        };
      }
      
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
        const columnIndex = Math.floor(cardIndex / 3);
        const columnCards = newGrid.filter((_, index) => 
          Math.floor(index / 3) === columnIndex
        );
        
        newDiscardPile = [...columnCards, ...newDiscardPile];
        const filteredGrid = newGrid.filter((_, index) => 
          Math.floor(index / 3) !== columnIndex
        );
        
        const newPlayers = [...prev.players];
        newPlayers[prev.currentPlayerIndex] = {
          ...currentPlayer,
          grid: filteredGrid
        };
        
        toast({
          title: "Colonne complète !",
          description: "Les cartes de la colonne ont été défaussées."
        });

        const roundEndState = checkRoundEnd(
          { ...currentPlayer, grid: filteredGrid },
          newPlayers
        );
        
        if (roundEndState) {
          return {
            ...prev,
            ...roundEndState,
            discardPile: newDiscardPile
          };
        }
        
        return {
          ...prev,
          players: newPlayers,
          discardPile: newDiscardPile,
          gamePhase: "draw",
          currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length
        };
      }
      
      const newPlayers = [...prev.players];
      newPlayers[prev.currentPlayerIndex] = {
        ...currentPlayer,
        grid: newGrid
      };

      const roundEndState = checkRoundEnd(
        { ...currentPlayer, grid: newGrid },
        newPlayers
      );
      
      if (roundEndState) {
        return {
          ...prev,
          ...roundEndState,
          discardPile: newDiscardPile
        };
      }
      
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
