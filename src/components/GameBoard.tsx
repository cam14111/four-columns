import { useEffect, useState } from "react";
import { Card, GameState, Player } from "@/lib/types";
import { PlayerGrid } from "./PlayerGrid";
import { GameControls } from "./GameControls";
import { ScoreDisplay } from "./ScoreDisplay";
import { 
  createDeck, 
  dealInitialCards, 
  makeAIMove, 
  isRoundOver,
  isGameOver,
  calculateRoundScores,
  checkColumnMatch 
} from "@/lib/gameLogic";
import { useToast } from "@/hooks/use-toast";

export const GameBoard = () => {
  const { toast } = useToast();
  const [gameState, setGameState] = useState<GameState>(() => {
    const deck = createDeck();
    const { playerGrid: humanGrid, remainingDeck: deck1 } = dealInitialCards(deck);
    const { playerGrid: aiGrid, remainingDeck: deck2 } = dealInitialCards(deck1);
    
    return {
      players: [
        { id: "1", name: "Player", score: 0, totalScore: 0, grid: humanGrid, isAI: false },
        { id: "2", name: "AI", score: 0, totalScore: 0, grid: aiGrid, isAI: true }
      ],
      currentPlayerIndex: 0,
      deck: deck2,
      discardPile: [],
      gamePhase: "initial",
      selectedCard: null,
      roundWinner: null
    };
  });

  useEffect(() => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    if (currentPlayer.isAI && gameState.gamePhase !== "roundEnd" && gameState.gamePhase !== "gameEnd") {
      setTimeout(() => {
        setGameState(makeAIMove);
      }, 1000);
    }
  }, [gameState.currentPlayerIndex, gameState.gamePhase]);

  useEffect(() => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    // Vérifie si la manche est terminée
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
        
        // Prépare la prochaine manche après un délai
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

  const handleDrawFromDeck = () => {
    if (gameState.gamePhase !== "draw") return;
    
    setGameState(prev => ({
      ...prev,
      deck: prev.deck.slice(1),
      selectedCard: prev.deck[0],
      gamePhase: "action"
    }));
  };

  const handleDrawFromDiscard = () => {
    if (gameState.gamePhase !== "draw" || gameState.discardPile.length === 0) return;
    
    setGameState(prev => ({
      ...prev,
      discardPile: prev.discardPile.slice(1),
      selectedCard: prev.discardPile[0],
      gamePhase: "action"
    }));
  };

  const handleCardClick = (clickedCard: Card) => {
    if (gameState.gamePhase !== "action" || !gameState.selectedCard) return;
    
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const cardIndex = currentPlayer.grid.findIndex(c => c.id === clickedCard.id);
    
    setGameState(prev => {
      const newGrid = [...prev.players[prev.currentPlayerIndex].grid];
      newGrid[cardIndex] = { ...prev.selectedCard!, state: "visible" };
      
      // Vérifie les colonnes pour les cartes identiques
      const columnIndex = Math.floor(cardIndex / 3);
      if (checkColumnMatch(newGrid, columnIndex)) {
        // Supprime les cartes de la colonne
        newGrid.forEach((card, index) => {
          if (Math.floor(index / 3) === columnIndex) {
            newGrid[index] = { ...card, state: "hidden" };
          }
        });
        
        toast({
          title: "Colonne complète !",
          description: "Les cartes de la colonne ont été défaussées."
        });
      }
      
      const newPlayers = [...prev.players];
      newPlayers[prev.currentPlayerIndex] = {
        ...currentPlayer,
        grid: newGrid
      };
      
      return {
        ...prev,
        players: newPlayers,
        discardPile: [clickedCard, ...prev.discardPile],
        selectedCard: null,
        gamePhase: "draw",
        currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length
      };
    });
  };

  return (
    <div className="min-h-screen bg-game-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-center text-game-primary">Skyjo</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">
            {gameState.players.map((player, index) => (
              <PlayerGrid
                key={player.id}
                player={player}
                onCardClick={handleCardClick}
                disabled={
                  index !== gameState.currentPlayerIndex || 
                  gameState.gamePhase !== "action" ||
                  gameState.gamePhase === "roundEnd" ||
                  gameState.gamePhase === "gameEnd"
                }
              />
            ))}
          </div>
          
          <div className="space-y-8">
            <GameControls
              gameState={gameState}
              onDrawFromDeck={handleDrawFromDeck}
              onDrawFromDiscard={handleDrawFromDiscard}
              disabled={
                gameState.players[gameState.currentPlayerIndex].isAI ||
                gameState.gamePhase === "roundEnd" ||
                gameState.gamePhase === "gameEnd"
              }
            />
            <ScoreDisplay players={gameState.players} />
          </div>
        </div>
      </div>
    </div>
  );
};