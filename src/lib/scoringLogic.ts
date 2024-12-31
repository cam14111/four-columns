import { Player, Card } from "./types";

export const calculatePlayerScore = (grid: Card[]): number => {
  return grid
    .filter(card => card.state === "visible")
    .reduce((sum, card) => sum + card.value, 0);
};

export const findLowestScore = (players: Player[]): number => {
  return Math.min(...players.map(player => player.score));
};

export const shouldDoubleScore = (player: Player, lowestScore: number): boolean => {
  return player.grid.every(card => card.state === "visible") && player.score > lowestScore;
};

export const updatePlayerScores = (players: Player[]): Player[] => {
  // D'abord, calculer les scores de base pour la manche en cours
  const playersWithBaseScores = players.map(player => ({
    ...player,
    score: calculatePlayerScore(player.grid)
  }));

  // Trouver le score le plus bas de la manche
  const lowestScore = findLowestScore(playersWithBaseScores);

  // Mettre à jour les scores en appliquant la règle du doublage si nécessaire
  // et en ajoutant le score de la manche au total accumulé
  return playersWithBaseScores.map(player => {
    const currentRoundScore = shouldDoubleScore(player, lowestScore) 
      ? player.score * 2 
      : player.score;
    
    return {
      ...player,
      score: currentRoundScore,
      totalScore: player.totalScore + currentRoundScore // On ajoute simplement le score de la manche au total
    };
  });
};

export const isGameOver = (players: Player[]): boolean => {
  return players.some(player => player.totalScore >= 100);
};

export const determineWinner = (players: Player[]): Player[] => {
  const lowestTotalScore = Math.min(...players.map(p => p.totalScore));
  return players.filter(p => p.totalScore === lowestTotalScore);
};