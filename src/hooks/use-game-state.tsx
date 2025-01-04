import { useState, useEffect } from "react";
import { GameState, Player, Card, GamePhase } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { 
  createDeck, 
  dealInitialCards,
  isRoundOver,
  isGameOver,
  calculateRoundScores,
  determineFirstPlayer,
  calculateInitialCardsSum,
  makeAIMove
} from "@/lib/gameLogic";
import { checkColumnMatch } from "@/lib/columnMatchLogic";
import { selectInitialCardsForAI } from "@/lib/aiLogic";

export const useGameState = () => {
  const { toast } = useToast();
  const [gameState, setGameState] = useState<GameState>(() => {
    const deck = createDeck();
    const { playerGrid: humanGrid, remainingDeck: deck1 } = dealInitialCards(deck);
    const { playerGrid: aiGrid, remainingDeck: deck2 } = dealInitialCards(deck1);
    
    const firstDiscardCard = { ...deck2[0], state: "visible" as const };
    const remainingDeck = deck2.slice(1);
    
    return {
      players: [
        { 
          id: "1", 
          name: "Joueur", 
          score: 0, 
          totalScore: 0, 
          grid: humanGrid, 
          isAI: false,
          roundHistory: []
        },
        { 
          id: "2", 
          name: "IA", 
          score: 0, 
          totalScore: 0, 
          grid: aiGrid, 
          isAI: true,
          roundHistory: []
        }
      ],
      currentPlayerIndex: 0,
      deck: remainingDeck,
      discardPile: [firstDiscardCard],
      gamePhase: "selectInitialCards" as GamePhase,
      selectedCard: null,
      roundWinner: null,
      selectedInitialCards: 0
    };
  });

  useEffect(() => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    if (currentPlayer.isAI) {
      if (gameState.gamePhase === "selectInitialCards") {
        setTimeout(() => {
          const { newGrid, initialCardsSum } = selectInitialCardsForAI(currentPlayer);
          
          setGameState(prev => {
            const newPlayers = [...prev.players];
            newPlayers[prev.currentPlayerIndex] = {
              ...currentPlayer,
              grid: newGrid,
              initialCardsSum
            };
            
            if (prev.currentPlayerIndex === prev.players.length - 1) {
              const firstPlayerIndex = determineFirstPlayer(newPlayers);
              toast({
                title: "Premier joueur déterminé !",
                description: `${newPlayers[firstPlayerIndex].name} commence avec la plus grande somme.`
              });
              
              return {
                ...prev,
                players: newPlayers,
                currentPlayerIndex: firstPlayerIndex,
                gamePhase: "draw" as GamePhase,
                selectedInitialCards: 0
              };
            }
            
            return {
              ...prev,
              players: newPlayers,
              currentPlayerIndex: prev.currentPlayerIndex + 1,
              selectedInitialCards: 0
            };
          });
        }, 1000);
      } else if (gameState.gamePhase !== "roundEnd" && gameState.gamePhase !== "gameEnd") {
        setTimeout(() => {
          setGameState(makeAIMove);
        }, 1000);
      }
    }
  }, [gameState.currentPlayerIndex, gameState.gamePhase]);

  useEffect(() => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    if (isRoundOver(currentPlayer.grid)) {
      const updatedPlayers = calculateRoundScores(gameState.players, currentPlayer);
      
      if (isGameOver(updatedPlayers)) {
        setGameState(prev => ({
          ...prev,
          players: updatedPlayers,
          gamePhase: "gameEnd",
          roundWinner: currentPlayer
        }));
        
        toast({
          title: "Partie terminée !",
          description: `${updatedPlayers.reduce((winner, player) => 
            player.totalScore < winner.totalScore ? player : winner
          , updatedPlayers[0]).name} remporte la partie !`
        });
      } else {
        setGameState(prev => ({
          ...prev,
          players: updatedPlayers,
          gamePhase: "roundEnd",
          roundWinner: currentPlayer
        }));
        
        toast({
          title: "Manche terminée !",
          description: "Préparation de la prochaine manche..."
        });
        
        setTimeout(() => {
          const newDeck = createDeck();
          const { playerGrid: humanGrid, remainingDeck: deck1 } = dealInitialCards(newDeck);
          const { playerGrid: aiGrid, remainingDeck: deck2 } = dealInitialCards(deck1);
          
          setGameState(prev => ({
            ...prev,
            players: prev.players.map((player, index) => ({
              ...player,
              grid: index === 0 ? humanGrid : aiGrid,
              score: 0
            })),
            currentPlayerIndex: 0,
            deck: deck2,
            discardPile: [],
            gamePhase: "initial",
            selectedCard: null,
            roundWinner: null
          }));
        }, 3000);
      }
    }
  }, [gameState.players, gameState.currentPlayerIndex]);

  return {
    gameState,
    setGameState
  };
};