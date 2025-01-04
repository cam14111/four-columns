import { useState, useEffect } from "react";
import { Player, GamePhase, GameState } from "@/lib/types";
import { PlayerSection } from "./game/PlayerSection";
import { GameControlSection } from "./game/GameControlSection";
import { InitialPhase } from "./game/InitialPhase";
import { useCardClickHandler } from "./CardClickHandler";
import { useAIHandler } from "./game/AIHandler";
import { useGameStateInitializer } from "./game/GameStateInitializer";
import { GameActions } from "./GameActions";
import { createDeck, dealInitialCards } from "@/lib/gameLogic";

interface GameBoardProps {
  initialPlayerName: string;
}

export const GameBoard = ({ initialPlayerName }: GameBoardProps) => {
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    currentPlayerIndex: 0,
    deck: [],
    discardPile: [],
    gamePhase: "selectInitialCards",
    selectedCard: null,
    roundWinner: null,
    selectedInitialCards: 0
  });

  useGameStateInitializer({
    initialPlayerName,
    onStateInitialized: (initialState) => setGameState(initialState)
  });

  const { handleAITurn } = useAIHandler({ gameState, setGameState });

  useEffect(() => {
    handleAITurn();
  }, [gameState.currentPlayerIndex, gameState.gamePhase]);

  const { handleCardClick } = useCardClickHandler({
    gameState,
    setGameState
  });

  const { handleDrawFromDeck, handleDrawFromDiscard } = GameActions({ 
    gameState, 
    setGameState
  });

  const handleNewGame = () => {
    const newDeck = createDeck();
    const { playerGrid: humanGrid, remainingDeck: deck1 } = dealInitialCards(newDeck);
    const { playerGrid: aiGrid, remainingDeck: finalDeck } = dealInitialCards(deck1);

    setGameState(prev => ({
      ...prev,
      deck: finalDeck,
      discardPile: [],
      currentPlayerIndex: 0,
      players: prev.players.map((player, index) => ({
        ...player,
        score: 0,
        totalScore: 0,
        grid: index === 0 ? humanGrid : aiGrid,
        initialCardsSum: 0
      })),
      gamePhase: "selectInitialCards",
      selectedInitialCards: 0
    }));
  };

  return (
    <div className="min-h-screen bg-game-background p-4">
      <div className="max-w-7xl mx-auto">
        <InitialPhase
          gamePhase={gameState.gamePhase}
          currentPlayer={gameState.players[0] || {
            id: "1",
            name: initialPlayerName,
            isAI: false,
            score: 0,
            totalScore: 0,
            grid: Array(12).fill(null)
          }}
          selectedInitialCards={gameState.selectedInitialCards}
          playerName={initialPlayerName}
          onPlayerNameSubmit={() => {}}
        />
        <div className="grid grid-cols-1 md:grid-cols-[1fr,400px] gap-8">
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
            onContinueGame={() => {}}
          />
        </div>
      </div>
    </div>
  );
};

export default GameBoard;