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
        const { newGrid, initialCardsSum } = selectInitialCardsForAI(currentPlayer);
        
        setGameState(prev => {
          // Créer une copie profonde des joueurs pour éviter les références partagées
          const newPlayers = prev.players.map((player, index) => {
            if (index === prev.currentPlayerIndex) {
              // Mettre à jour uniquement la grille du joueur IA
              return {
                ...player,
                grid: newGrid,
                initialCardsSum
              };
            }
            // Garder les autres joueurs inchangés
            return { ...player };
          });
          
          // Vérifier si les deux joueurs ont sélectionné leurs cartes
          const allPlayersSelected = newPlayers.every(p => p.initialCardsSum !== undefined);
          
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
      // L'IA joue son tour pendant la phase de pioche
      setTimeout(() => {
        // Décision de piocher depuis la défausse ou le deck
        const shouldDrawFromDiscard = 
          gameState.discardPile.length > 0 && 
          Math.random() > 0.5; // Décision aléatoire pour l'exemple

        if (shouldDrawFromDiscard && gameState.discardPile.length > 0) {
          const drawnCard = gameState.discardPile[0];
          setGameState(prev => ({
            ...prev,
            discardPile: prev.discardPile.slice(1),
            selectedCard: drawnCard,
            gamePhase: "action"
          }));
        } else {
          const drawnCard = gameState.deck[0];
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

  // Utiliser useEffect pour déclencher le tour de l'IA
  useEffect(() => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer?.isAI) {
      handleAITurn();
    }
  }, [gameState.currentPlayerIndex, gameState.gamePhase]);

  return { handleAITurn };
};