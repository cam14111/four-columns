import React, { useEffect } from "react";
import { useGameState } from "@/hooks/use-game-state";
import { GameActions } from "@/components/GameActions";
import { useCardClickHandler } from "@/components/CardClickHandler";
import { TurnPhase } from "./TurnPhase";
import { useToast } from "@/hooks/use-toast";
import { saveGameScore } from "@/lib/scoreService";
import { PlayerSection } from "./game/PlayerSection";
import { GameControlSection } from "./game/GameControlSection";
import { InitialPhase } from "./game/InitialPhase";

export const GameBoard = () => {
  const { gameState, setGameState } = useGameState();
  const { handleCardClick } = useCardClickHandler({ gameState, setGameState });
  const { 
    handleKeepCard, 
    handleDiscardCard, 
    handleDrawFromDeck, 
    handleDrawFromDiscard 
  } = GameActions({ gameState, setGameState });
  const { toast } = useToast();

  const handlePlayerNameSubmit = (name: string) => {
    setGameState(prev => ({
      ...prev,
      players: [
        { ...prev.players[0], name },
        prev.players[1]
      ]
    }));
  };

  const handleNewGame = () => {
    const deck = createDeck();
    const { playerGrid: humanGrid, remainingDeck: deck1 } = dealInitialCards(deck);
    const { playerGrid: aiGrid, remainingDeck: deck2 } = dealInitialCards(deck1);
    
    const firstDiscardCard = { ...deck2[0], state: "visible" as const };
    const remainingDeck = deck2.slice(1);
    
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(player => ({
        ...player,
        score: 0,
        totalScore: 0,
        grid: player.isAI ? aiGrid : humanGrid,
      })),
      currentPlayerIndex: 0,
      deck: remainingDeck,
      discardPile: [firstDiscardCard],
      gamePhase: "selectInitialCards",
      selectedCard: null,
      roundWinner: null,
      selectedInitialCards: 0
    }));
  };

  const handleContinueGame = () => {
    const deck = createDeck();
    const { playerGrid: humanGrid, remainingDeck: deck1 } = dealInitialCards(deck);
    const { playerGrid: aiGrid, remainingDeck: deck2 } = dealInitialCards(deck1);
    
    const firstDiscardCard = { ...deck2[0], state: "visible" as const };
    const remainingDeck = deck2.slice(1);
    
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(player => ({
        ...player,
        score: 0,
        grid: player.isAI ? aiGrid : humanGrid,
      })),
      currentPlayerIndex: 0,
      deck: remainingDeck,
      discardPile: [firstDiscardCard],
      gamePhase: "selectInitialCards",
      selectedCard: null,
      roundWinner: null,
      selectedInitialCards: 0
    }));
  };

  const handleGameEnd = async () => {
    const humanPlayer = gameState.players[0];
    try {
      await saveGameScore(
        humanPlayer.name,
        humanPlayer.score,
        humanPlayer.totalScore
      );
      toast({
        title: "Score sauvegardé",
        description: "Votre score a été enregistré avec succès !",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder le score",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (gameState.gamePhase === "gameEnd" && gameState.players[0].name !== "Joueur") {
      handleGameEnd();
    }
  }, [gameState.gamePhase, gameState.players]);

  return (
    <div className="min-h-screen bg-game-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-center text-game-primary">Skyjo</h1>
        
        <InitialPhase
          gamePhase={gameState.gamePhase}
          currentPlayer={gameState.players[gameState.currentPlayerIndex]}
          selectedInitialCards={gameState.selectedInitialCards}
          playerName={gameState.players[0].name}
          onPlayerNameSubmit={handlePlayerNameSubmit}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <PlayerSection
            players={gameState.players}
            currentPlayerIndex={gameState.currentPlayerIndex}
            gamePhase={gameState.gamePhase}
            onCardClick={handleCardClick}
          />
          
          <GameControlSection
            gameState={gameState}
            onDrawFromDeck={handleDrawFromDeck}
            onDrawFromDiscard={handleDrawFromDiscard}
            onNewGame={handleNewGame}
            onContinueGame={handleContinueGame}
          />
        </div>

        <TurnPhase
          gamePhase={gameState.gamePhase}
          selectedCard={gameState.selectedCard}
          onKeepCard={handleKeepCard}
          onDiscardCard={handleDiscardCard}
          isCurrentPlayerAI={gameState.players[gameState.currentPlayerIndex].isAI}
        />
      </div>
    </div>
  );
};
