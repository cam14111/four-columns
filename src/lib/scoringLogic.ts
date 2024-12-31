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
  return playersWithBaseScores.map(player => {
    // On calcule d'abord le score de la manche actuelle
    const roundScore = calculatePlayerScore(player.grid);
    
    // On applique le doublage si nécessaire
    const currentRoundScore = shouldDoubleScore(player, lowestScore) 
      ? roundScore * 2 
      : roundScore;
    
    return {
      ...player,
      score: currentRoundScore,
      // On ajoute le score de la manche au total précédent
      totalScore: player.totalScore + currentRoundScore
    };
  });
};

export const isGameOver = (players: Player[]): boolean => {
  // Le jeu se termine quand un joueur atteint ou dépasse 100 points
  return players.some(player => player.totalScore >= 100);
};

export const determineWinner = (players: Player[]): Player[] => {
  // Le gagnant est celui qui a le score total le plus bas
  const lowestTotalScore = Math.min(...players.map(p => p.totalScore));
  return players.filter(p => p.totalScore === lowestTotalScore);
};