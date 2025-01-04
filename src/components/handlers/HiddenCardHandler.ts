import { Card as CardType, GameState } from "@/lib/types";
import { handleColumnMatch } from "@/lib/columnMatchLogic";
import { handleRoundEnd } from "@/lib/roundEndHandler";
import { revealAllCards } from "@/lib/gameLogic";
import { Toast } from "@/types/toast";

export const handleHiddenCardSelection = (
  clickedCard: CardType,
  gameState: GameState,
  setGameState: React.Dispatch<React.SetStateAction<GameState>>,
  toast: (props: Toast) => void
) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const cardIndex = currentPlayer.grid.findIndex(c => c && c.id === clickedCard.id);
  
  if (cardIndex === -1) {
    console.error("Card not found in grid");
    return;
  }
  
  setGameState(prev => {
    const newGrid = [...prev.players[prev.currentPlayerIndex].grid];
    newGrid[cardIndex] = { ...clickedCard, state: "visible" as const };
    let newDiscardPile = [...prev.discardPile];
    
    const { columnCards, filteredGrid, hasMatch } = handleColumnMatch(newGrid, cardIndex);
    
    if (hasMatch) {
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

      // Vérifier si toutes les cartes sont révélées
      const allCardsRevealed = filteredGrid.every(card => card === null || card.state === "visible");
      if (allCardsRevealed) {
        // Révéler toutes les cartes des deux joueurs
        const updatedPlayers = revealAllCards(newPlayers);
        
        const roundEndState = handleRoundEnd(
          { ...currentPlayer, grid: filteredGrid },
          updatedPlayers,
          toast
        );
        
        if (roundEndState) {
          return {
            ...prev,
            ...roundEndState,
            players: updatedPlayers,
            discardPile: newDiscardPile
          };
        }
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

    // Vérifier si toutes les cartes sont révélées
    const allCardsRevealed = newGrid.every(card => card === null || card.state === "visible");
    if (allCardsRevealed) {
      // Révéler toutes les cartes des deux joueurs
      const updatedPlayers = revealAllCards(newPlayers);
      
      const roundEndState = handleRoundEnd(
        { ...currentPlayer, grid: newGrid },
        updatedPlayers,
        toast
      );
      
      if (roundEndState) {
        return {
          ...prev,
          ...roundEndState,
          players: updatedPlayers,
          discardPile: newDiscardPile
        };
      }
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