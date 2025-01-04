import { Card, Player } from "../types";

export const calculateInitialCardsSum = (grid: Card[]): number => {
  return grid.filter(card => card && card.state === "visible")
    .reduce((sum, card) => sum + card.value, 0);
};

export const calculateScore = (grid: Card[]): number => {
  return grid.filter(card => card !== null)
    .reduce((sum, card) => sum + card.value, 0);
};

export const calculateRoundScores = (players: Player[], firstFinishedPlayer: Player): Player[] => {
  const updatedPlayers = players.map(player => {
    const roundScore = calculateScore(player.grid);
    let finalRoundScore = roundScore;
    
    if (player.id === firstFinishedPlayer.id) {
      const otherPlayersMinScore = Math.min(
        ...players
          .filter(p => p.id !== player.id)
          .map(p => calculateScore(p.grid))
      );
      
      if (roundScore >= otherPlayersMinScore) {
        finalRoundScore += 10;
      }
    }
    
    return {
      ...player,
      score: finalRoundScore,
      totalScore: player.totalScore + finalRoundScore
    };
  });
  
  return updatedPlayers;
};