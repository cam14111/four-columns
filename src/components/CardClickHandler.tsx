import { Card as CardType, GameState, Player } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { checkColumnMatch, calculateInitialCardsSum, determineFirstPlayer } from "@/lib/gameLogic";
import { handleRoundEnd } from "@/lib/roundEndHandler";

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

  const checkAndHandleColumnMatch = (grid: CardType[], cardIndex: number) => {
    const columnIndex = Math.floor(cardIndex / 3);
    
    // Vérifier si la colonne est complète avec des cartes identiques
    if (checkColumnMatch(grid, columnIndex)) {
      console.log(`Colonne ${columnIndex} correspond, préparation à la suppression`);
      
      // Récupérer les cartes de la colonne
      const columnCards = grid.filter((_, index) => Math.floor(index / 3) === columnIndex);
      
      // Retirer la colonne du jeu
      const filteredGrid = grid.filter((_, index) => Math.floor(index / 3) !== columnIndex);
      
      return {
        columnCards,
        filteredGrid,
        hasMatch: true
      };
    }
    
    return {
      columnCards: [],
      filteredGrid: grid,
      hasMatch: false
    };
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
      
      // Vérifier et gérer les colonnes correspondantes
      const { columnCards, filteredGrid, hasMatch } = checkAndHandleColumnMatch(newGrid, cardIndex);
      
      if (hasMatch) {
        console.log("Colonne correspondante trouvée, mise à jour de la grille et de la défausse");
        newDiscardPile = [...columnCards, ...newDiscardPile];
        
        const newPlayers = [...prev.players];
        newPlayers[prev.currentPlayerIndex] = {
          ...currentPlayer,
          grid: filteredGrid
        };
        
        toast({
          title: "Colonne complète !",
          description: "Les cartes de la colonne ont été défaussées."
        });

        const roundEndState = handleRoundEnd(
          { ...currentPlayer, grid: filteredGrid },
          newPlayers,
          toast
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

      const roundEndState = handleRoundEnd(
        { ...currentPlayer, grid: newGrid },
        newPlayers,
        toast
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
      
      // Vérifier et gérer les colonnes correspondantes
      const { columnCards, filteredGrid, hasMatch } = checkAndHandleColumnMatch(newGrid, cardIndex);
      
      if (hasMatch) {
        console.log("Colonne correspondante trouvée lors de la sélection d'une carte cachée");
        newDiscardPile = [...columnCards, ...newDiscardPile];
        
        const newPlayers = [...prev.players];
        newPlayers[prev.currentPlayerIndex] = {
          ...currentPlayer,
          grid: filteredGrid
        };
        
        toast({
          title: "Colonne complète !",
          description: "Les cartes de la colonne ont été défaussées."
        });

        const roundEndState = handleRoundEnd(
          { ...currentPlayer, grid: filteredGrid },
          newPlayers,
          toast
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

      const roundEndState = handleRoundEnd(
        { ...currentPlayer, grid: newGrid },
        newPlayers,
        toast
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