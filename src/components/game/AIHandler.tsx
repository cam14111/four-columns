import { GameState, Player } from "@/lib/types";
import { selectInitialCardsForAI } from "@/lib/aiLogic";
import { determineFirstPlayer } from "@/lib/gameLogic";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

interface AIHandlerProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

export const useAIHandler = ({ gameState, setGameState }: AIHandlerProps) => {
  const { toast } = useToast();

  const handleAITurn = () => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    if (!currentPlayer?.isAI) return;

    if (gameState.gamePhase === "selectInitialCards") {
      setTimeout(() => {
        // Créer une copie profonde du joueur actuel
        const currentPlayerCopy = {
          ...currentPlayer,
          grid: currentPlayer.grid.map(card => 
            card ? { ...card } : null
          )
        };
        
        // Sélectionner les cartes pour l'IA
        const { newGrid, initialCardsSum } = selectInitialCardsForAI(currentPlayerCopy);
        
        setGameState(prev => {
          // Créer une copie profonde des joueurs
          const newPlayers = prev.players.map((player, index) => {
            if (index === prev.currentPlayerIndex) {
              return {
                ...player,
                grid: newGrid,
                initialCardsSum
              };
            }
            return {
              ...player,
              grid: player.grid.map(card => 
                card ? { ...card } : null
              )
            };
          });
          
          // Vérifier si les deux joueurs ont sélectionné leurs cartes
          const allPlayersSelected = newPlayers.every(p => {
            const visibleCards = p.grid.filter(card => card && card.state === "visible");
            return visibleCards.length === 2;
          });
          
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
    } else if (gameState.gamePhase === "draw") {
      setTimeout(() => {
        const shouldDrawFromDiscard = 
          gameState.discardPile.length > 0 && 
          Math.random() > 0.5;

        if (shouldDrawFromDiscard && gameState.discardPile.length > 0) {
          const drawnCard = { ...gameState.discardPile[0] };
          setGameState(prev => ({
            ...prev,
            discardPile: prev.discardPile.slice(1),
            selectedCard: drawnCard,
            gamePhase: "action"
          }));
        } else {
          const drawnCard = { ...gameState.deck[0] };
          setGameState(prev => ({
            ...prev,
            deck: prev.deck.slice(1),
            selectedCard: drawnCard,
            gamePhase: "action"
          }));
        }
      }, 1000);
    }
  };

  useEffect(() => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer?.isAI) {
      handleAITurn();
    }
  }, [gameState.currentPlayerIndex, gameState.gamePhase]);

  return { handleAITurn };
};