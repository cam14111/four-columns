import React from 'react';
import { Player, Card } from "@/lib/types";
import { PlayerGrid } from "../PlayerGrid";

interface PlayerSectionProps {
  players: Player[];
  currentPlayerIndex: number;
  gamePhase: string;
  onCardClick: (card: Card) => void;
}

export const PlayerSection = ({ 
  players, 
  currentPlayerIndex, 
  gamePhase, 
  onCardClick 
}: PlayerSectionProps) => {
  return (
    <div className="space-y-8">
      {players.map((player, index) => (
        <PlayerGrid
          key={player.id}
          player={player}
          onCardClick={onCardClick}
          disabled={
            (index !== currentPlayerIndex || 
            player.isAI ||
            gamePhase === "action" ||
            ["roundEnd", "gameEnd"].includes(gamePhase)) &&
            gamePhase !== "selectInitialCards"
          }
        />
      ))}
    </div>
  );
};