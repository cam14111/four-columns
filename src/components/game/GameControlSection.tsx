import React from 'react';
import { GameState } from "@/lib/types";
import { GameControls } from "../GameControls";
import { DiscardPile } from "../DiscardPile";
import { ScoreDisplay } from "../ScoreDisplay";

interface GameControlSectionProps {
  gameState: GameState;
  onDrawFromDeck: () => void;
  onDrawFromDiscard: () => void;
  onNewGame: () => void;
  onContinueGame: () => void;
}

export const GameControlSection = ({
  gameState,
  onDrawFromDeck,
  onDrawFromDiscard,
  onNewGame,
  onContinueGame
}: GameControlSectionProps) => {
  return (
    <div className="space-y-8">
      <div className="flex gap-4 items-start">
        <GameControls
          gameState={gameState}
          onDrawFromDeck={onDrawFromDeck}
          disabled={
            gameState.players[gameState.currentPlayerIndex].isAI ||
            gameState.gamePhase === "selectInitialCards" ||
            ["roundEnd", "gameEnd"].includes(gameState.gamePhase)
          }
        />
        <DiscardPile 
          discardPile={gameState.discardPile}
          onDrawFromDiscard={onDrawFromDiscard}
          disabled={
            gameState.players[gameState.currentPlayerIndex].isAI ||
            gameState.gamePhase !== "draw" ||
            ["roundEnd", "gameEnd"].includes(gameState.gamePhase)
          }
        />
      </div>
      <ScoreDisplay 
        players={gameState.players} 
        onNewGame={onNewGame}
        onContinueGame={onContinueGame}
      />
    </div>
  );
};