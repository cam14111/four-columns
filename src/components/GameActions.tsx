import { GameState } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

interface GameActionsProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

export const GameActions = ({ gameState, setGameState }: GameActionsProps) => {
  const { toast } = useToast();

  const handleKeepCard = () => {
    if (!gameState.selectedCard) return;
    
    setGameState(prev => ({
      ...prev,
      gamePhase: "action",
      selectedCard: { ...prev.selectedCard!, state: "replacing" as const }
    }));
    
    toast({
      title: "Action requise",
      description: "Sélectionnez une carte de votre grille à remplacer"
    });
  };

  const handleDiscardCard = () => {
    if (!gameState.selectedCard) return;
    
    setGameState(prev => ({
      ...prev,
      discardPile: [prev.selectedCard!, ...prev.discardPile],
      selectedCard: null,
      gamePhase: "selectHiddenCard" as GamePhase
    }));
    
    toast({
      title: "Action requise",
      description: "Sélectionnez une de vos cartes cachées à retourner"
    });
  };

  const handleDrawFromDeck = () => {
    if (gameState.gamePhase !== "draw") return;
    
    setGameState(prev => ({
      ...prev,
      deck: prev.deck.slice(1),
      selectedCard: { ...prev.deck[0], state: "visible" as const },
      gamePhase: "action" as GamePhase
    }));
  };

  const handleDrawFromDiscard = () => {
    if (gameState.gamePhase !== "draw" || gameState.discardPile.length === 0) return;
    
    const cardToKeep = gameState.discardPile[0];
    
    setGameState(prev => ({
      ...prev,
      discardPile: prev.discardPile.slice(1),
      selectedCard: { ...cardToKeep, state: "replacing" as const },
      gamePhase: "action" as GamePhase
    }));
    
    toast({
      title: "Action requise",
      description: "Sélectionnez une carte de votre grille à remplacer"
    });
  };

  return {
    handleKeepCard,
    handleDiscardCard,
    handleDrawFromDeck,
    handleDrawFromDiscard
  };
};