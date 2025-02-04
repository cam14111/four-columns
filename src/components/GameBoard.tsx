import React, { useEffect } from "react";
import { useGameState } from "@/hooks/use-game-state";
import { GameActions } from "@/components/GameActions";
import { useCardClickHandler } from "@/components/CardClickHandler";
import { PlayerGrid } from "./PlayerGrid";
import { GameControls } from "./GameControls";
import { ScoreDisplay } from "./ScoreDisplay";
import { DiscardPile } from "./DiscardPile";
import { TurnPhase } from "./TurnPhase";
import { InitialCardsSelection } from "./InitialCardsSelection";
import { PlayerNameForm } from "./PlayerNameForm";
import { useRoundEndHandler } from "./RoundEndHandler";
import { createDeck, dealInitialCards } from "@/lib/gameLogic";
import { useIsMobile } from "@/hooks/use-mobile";
import { Player } from "@/lib/types";

export const GameBoard = () => {
  const isMobile = useIsMobile();
  const { gameState, setGameState } = useGameState();
  const { handleCardClick } = useCardClickHandler({ gameState, setGameState });
  const { handleGameEnd } = useRoundEndHandler({ gameState, setGameState });
  const { 
    handleKeepCard, 
    handleDiscardCard, 
    handleDrawFromDeck, 
    handleDrawFromDiscard 
  } = GameActions({ gameState, setGameState });

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
        totalScore: player.totalScore + player.score,
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

  const checkAllCardsRevealed = (playerIndex: number) => {
    const player = gameState.players[playerIndex];
    return player.grid.every(card => card === null || card.state === "visible");
  };

  useEffect(() => {
    const currentPlayerAllRevealed = checkAllCardsRevealed(gameState.currentPlayerIndex);
    
    if (currentPlayerAllRevealed && gameState.gamePhase !== "roundEnd" && gameState.gamePhase !== "gameEnd") {
      // Révéler toutes les cartes des deux joueurs
      setGameState(prev => {
        const updatedPlayers = prev.players.map(player => ({
          ...player,
          grid: player.grid.map(card => 
            card ? { ...card, state: "visible" as const } : null
          )
        }));
        
        return {
          ...prev,
          players: updatedPlayers,
          gamePhase: "roundEnd"
        };
      });
    }
  }, [gameState.players, gameState.currentPlayerIndex, gameState.gamePhase]);

  useEffect(() => {
    if (gameState.gamePhase === "roundEnd") {
      handleGameEnd();
    }
  }, [gameState.gamePhase]);

  if (gameState.players[0].name === "Joueur") {
    return <PlayerNameForm onSubmit={handlePlayerNameSubmit} />;
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const humanPlayer = gameState.players[0];
  const aiPlayer = gameState.players[1];

  return (
    <div className="min-h-screen bg-game-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4 md:space-y-8">
        <h1 className="hidden md:block text-3xl font-bold text-center text-game-primary">Skyjo</h1>
        
        {gameState.gamePhase === "selectInitialCards" && !gameState.players[gameState.currentPlayerIndex].isAI && (
          <InitialCardsSelection 
            currentPlayer={gameState.players[gameState.currentPlayerIndex]}
            selectedInitialCards={gameState.selectedInitialCards}
          />
        )}
        
        {isMobile ? (
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-2 shadow-sm">
              <div className="flex justify-between items-center">
                <span className="font-medium text-game-primary">
                  Score actuel : {calculateVisibleCardsSum(humanPlayer)}
                </span>
                <span className="font-medium text-game-primary">
                  IA : {calculateVisibleCardsSum(aiPlayer)}
                </span>
              </div>
            </div>

            <div className="flex justify-center gap-4 items-start">
              <GameControls
                gameState={gameState}
                onDrawFromDeck={handleDrawFromDeck}
                disabled={
                  gameState.players[gameState.currentPlayerIndex].isAI ||
                  gameState.gamePhase === "selectInitialCards" ||
                  ["roundEnd", "gameEnd"].includes(gameState.gamePhase)
                }
              />
              <DiscardPile 
                discardPile={gameState.discardPile}
                onDrawFromDiscard={handleDrawFromDiscard}
                disabled={
                  gameState.players[gameState.currentPlayerIndex].isAI ||
                  gameState.gamePhase !== "draw" ||
                  ["roundEnd", "gameEnd"].includes(gameState.gamePhase)
                }
              />
            </div>

            <div className="space-y-4">
              {gameState.players.map((player, index) => (
                <PlayerGrid
                  key={player.id}
                  player={player}
                  onCardClick={handleCardClick}
                  isMobile={true}
                  disabled={
                    (index !== gameState.currentPlayerIndex || 
                    player.isAI ||
                    (gameState.gamePhase === "action" && !gameState.selectedCard) ||
                    ["roundEnd", "gameEnd"].includes(gameState.gamePhase)) &&
                    gameState.gamePhase !== "selectInitialCards"
                  }
                />
              ))}
            </div>
          </div>
        ) : (
          // Desktop Layout
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
              {gameState.players.map((player, index) => (
                <PlayerGrid
                  key={player.id}
                  player={player}
                  onCardClick={handleCardClick}
                  disabled={
                    (index !== gameState.currentPlayerIndex || 
                    player.isAI ||
                    (gameState.gamePhase === "action" && !gameState.selectedCard) ||
                    ["roundEnd", "gameEnd"].includes(gameState.gamePhase)) &&
                    gameState.gamePhase !== "selectInitialCards"
                  }
                />
              ))}
            </div>
            
            <div className="space-y-8">
              <div className="flex gap-4 items-start">
                <GameControls
                  gameState={gameState}
                  onDrawFromDeck={handleDrawFromDeck}
                  disabled={
                    gameState.players[gameState.currentPlayerIndex].isAI ||
                    gameState.gamePhase === "selectInitialCards" ||
                    ["roundEnd", "gameEnd"].includes(gameState.gamePhase)
                  }
                />
                <DiscardPile 
                  discardPile={gameState.discardPile}
                  onDrawFromDiscard={handleDrawFromDiscard}
                  disabled={
                    gameState.players[gameState.currentPlayerIndex].isAI ||
                    gameState.gamePhase !== "draw" ||
                    ["roundEnd", "gameEnd"].includes(gameState.gamePhase)
                  }
                />
              </div>
              <ScoreDisplay 
                players={gameState.players} 
                onNewGame={handleNewGame}
                onContinueGame={handleContinueGame}
              />
            </div>
          </div>
        )}

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

const calculateVisibleCardsSum = (player: Player): number => {
  return player.grid
    .filter(card => card && card.state === "visible")
    .reduce((sum, card) => sum + (card?.value || 0), 0);
};