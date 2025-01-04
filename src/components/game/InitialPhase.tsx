import React from 'react';
import { Player } from "@/lib/types";
import { InitialCardsSelection } from "../InitialCardsSelection";
import { PlayerNameForm } from "../PlayerNameForm";

interface InitialPhaseProps {
  gamePhase: string;
  currentPlayer: Player;
  selectedInitialCards: number;
  playerName: string;
  onPlayerNameSubmit: (name: string) => void;
}

export const InitialPhase = ({
  gamePhase,
  currentPlayer,
  selectedInitialCards,
  playerName,
  onPlayerNameSubmit
}: InitialPhaseProps) => {
  if (playerName === "Joueur") {
    return <PlayerNameForm onSubmit={onPlayerNameSubmit} />;
  }

  if (gamePhase === "selectInitialCards" && !currentPlayer.isAI) {
    return (
      <InitialCardsSelection 
        currentPlayer={currentPlayer}
        selectedInitialCards={selectedInitialCards}
      />
    );
  }

  return null;
};