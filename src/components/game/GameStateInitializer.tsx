import { useState, useEffect } from "react";
import { Player, GameState } from "@/lib/types";
import { createDeck, dealInitialCards } from "@/lib/gameLogic";

interface GameStateInitializerProps {
  initialPlayerName: string;
  onStateInitialized: (state: GameState) => void;
}

export const useGameStateInitializer = ({ initialPlayerName, onStateInitialized }: GameStateInitializerProps) => {
  useEffect(() => {
    console.log("Initializing game with player:", initialPlayerName);
    const newDeck = createDeck();
    const { playerGrid: humanGrid, remainingDeck: deck1 } = dealInitialCards(newDeck);
    const { playerGrid: aiGrid, remainingDeck: deck2 } = dealInitialCards(deck1);

    const firstDiscardCard = { ...deck2[0], state: "visible" as const };
    const remainingDeck = deck2.slice(1);

    const initialState: GameState = {
      players: [
        {
          id: "1",
          name: initialPlayerName,
          isAI: false,
          score: 0,
          totalScore: 0,
          grid: humanGrid,
          initialCardsSum: 0
        },
        {
          id: "2",
          name: "AI",
          isAI: true,
          score: 0,
          totalScore: 0,
          grid: aiGrid,
          initialCardsSum: 0
        }
      ],
      currentPlayerIndex: 0,
      deck: remainingDeck,
      discardPile: [firstDiscardCard],
      gamePhase: "selectInitialCards",
      selectedCard: null,
      roundWinner: null,
      selectedInitialCards: 0
    };

    onStateInitialized(initialState);
  }, [initialPlayerName, onStateInitialized]);
};