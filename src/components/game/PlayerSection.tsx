import React from 'react';
import { Player } from "@/lib/types";
import { PlayerGrid } from "../PlayerGrid";
import { CardType } from "@/lib/types";

interface PlayerSectionProps {
  players: Player[];
  currentPlayerIndex: number;
  gamePhase: string;
  onCardClick: (card: CardType) => void;
}

export const PlayerSection = ({ 
  players, 
  currentPlayerIndex, 
  gamePhase, 
  onCardClick 
}: PlayerSectionProps) => {
  return (
    <div className="md:col-span-2 space-y-8">
      {players.map((player, index) => (
        <PlayerGrid
          key={player.id}
          player={player}
          onCardClick={onCardClick}
          disabled={
            (index !== currentPlayerIndex || 
            player.isAI ||
            (gamePhase === "action" && !player.selectedCard) ||
            ["roundEnd", "gameEnd"].includes(gamePhase)) &&
            gamePhase !== "selectInitialCards"
          }
        />
      ))}
    </div>
  );
};