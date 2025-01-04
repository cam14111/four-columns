import { Card, GameState } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { checkColumnMatch } from "@/lib/columnMatchLogic";

type ToastFunction = ReturnType<typeof useToast>["toast"];

export const handleActionPhaseClick = (
  clickedCard: Card,
  gameState: GameState,
  setGameState: React.Dispatch<React.SetStateAction<GameState>>,
  toast: ToastFunction
) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  
  // Si nous n'avons pas de carte sélectionnée ou si elle n'est pas en mode remplacement, on ne fait rien
  if (!gameState.selectedCard || gameState.selectedCard.state !== "replacing") {
    return;
  }

  // Trouver l'index de la carte cliquée dans la grille
  const cardIndex = currentPlayer.grid.findIndex(c => c.id === clickedCard.id);
  if (cardIndex === -1) return;

  // Créer une nouvelle grille avec la carte remplacée
  const newGrid = [...currentPlayer.grid];
  const replacedCard = newGrid[cardIndex];
  newGrid[cardIndex] = { ...gameState.selectedCard, state: "visible" as const };

  // Vérifier si nous avons une colonne complète
  const columnIndex = Math.floor(cardIndex / 3);
  const hasColumnMatch = checkColumnMatch(newGrid, columnIndex);

  if (hasColumnMatch) {
    // Si nous avons une colonne complète, cacher toutes les cartes de la colonne
    for (let i = columnIndex * 3; i < (columnIndex + 1) * 3; i++) {
      if (newGrid[i]) {
        newGrid[i] = { ...newGrid[i], state: "hidden" as const };
      }
    }
    
    toast({
      title: "Colonne complétée !",
      description: "Les cartes de la colonne ont été retournées"
    });
  }

  // Mettre à jour l'état du jeu
  const newPlayers = [...gameState.players];
  newPlayers[gameState.currentPlayerIndex] = {
    ...currentPlayer,
    grid: newGrid
  };

  setGameState(prev => ({
    ...prev,
    players: newPlayers,
    selectedCard: null,
    discardPile: replacedCard ? [replacedCard, ...prev.discardPile] : prev.discardPile,
    currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length,
    gamePhase: "draw"
  }));

  toast({
    title: "Tour terminé",
    description: `C'est au tour de ${newPlayers[(gameState.currentPlayerIndex + 1) % newPlayers.length].name}`
  });
};