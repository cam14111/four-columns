import { Card as CardType, GameState } from "@/lib/types";
import { handleColumnMatch } from "@/lib/columnMatchLogic";
import { handleRoundEnd } from "@/lib/roundEndHandler";
import { Toast } from "@/types/toast";

export const handleActionPhaseClick = (
  clickedCard: CardType,
  gameState: GameState,
  setGameState: React.Dispatch<React.SetStateAction<GameState>>,
  toast: (props: Toast) => void
) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const cardIndex = currentPlayer.grid.findIndex(c => c && c.id === clickedCard.id);
  
  if (cardIndex === -1) return; // Guard clause if card not found
  
  setGameState(prev => {
    const newGrid = [...prev.players[prev.currentPlayerIndex].grid];
    newGrid[cardIndex] = { ...prev.selectedCard!, state: "visible" as const };
    let newDiscardPile = [{ ...clickedCard, state: "visible" as const }, ...prev.discardPile];
    
    // Vérifier et gérer les colonnes correspondantes
    const { columnCards, filteredGrid, hasMatch } = handleColumnMatch(newGrid, cardIndex);
    
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