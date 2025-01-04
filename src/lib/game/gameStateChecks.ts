import { Player, Card } from "../types";

export const isGameOver = (players: Player[]): boolean => {
  return players.some(player => player.totalScore >= 100);
};

export const isRoundOver = (grid: Card[]): boolean => {
  return grid.every(card => card === null || card.state === "visible");
};

export const determineFirstPlayer = (players: Player[]): number => {
  let maxSum = -Infinity;
  let firstPlayerIndex = 0;

  players.forEach((player, index) => {
    if (player.initialCardsSum !== undefined && player.initialCardsSum > maxSum) {
      maxSum = player.initialCardsSum;
      firstPlayerIndex = index;
    }
  });

  return firstPlayerIndex;
};

export const revealAllCards = (players: Player[]): Player[] => {
  return players.map(player => ({
    ...player,
    grid: player.grid.map(card => 
      card ? { ...card, state: "visible" as const } : null
    )
  }));
};