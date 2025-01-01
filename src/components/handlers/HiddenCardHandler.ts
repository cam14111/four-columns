import { Card as CardType, GameState } from "@/lib/types";
import { handleColumnMatch } from "@/lib/columnMatchLogic";
import { handleRoundEnd } from "@/lib/roundEndHandler";
import { Toast } from "@/hooks/use-toast";

export const handleHiddenCardSelection = (
  clickedCard: CardType,
  gameState: GameState,
  setGameState: React.Dispatch<React.SetStateAction<GameState>>,
  toast: (props: Toast) => void
) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const cardIndex = currentPlayer.grid.findIndex(c => c.id === clickedCard.id);
  
  setGameState(prev => {
    const newGrid = [...prev.players[prev.currentPlayerIndex].grid];
    newGrid[cardIndex] = { ...clickedCard, state: "visible" as const };
    let newDiscardPile = [...prev.discardPile];
    
    // Vérifier et gérer les colonnes correspondantes
    const { columnCards, filteredGrid, hasMatch } = handleColumnMatch(newGrid, cardIndex);
    
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