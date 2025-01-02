import { Player, GameState } from "@/lib/types";
import { updatePlayerScores, isGameOver, determineWinner } from "@/lib/scoringLogic";
import { saveRoundScores } from "./roundScoreService";

export const handleRoundEnd = (
  currentPlayer: Player, 
  players: Player[],
  toast: any
) => {
  if (currentPlayer.grid.every(card => card === null || card.state === "visible")) {
    const updatedPlayers = updatePlayerScores(players);
    
    // Calculer le numéro de la manche actuelle
    const roundNumber = Math.floor(updatedPlayers[0].totalScore / updatedPlayers[0].score);
    
    // Sauvegarder les scores de la manche
    saveRoundScores(updatedPlayers, roundNumber);
    
    if (isGameOver(updatedPlayers)) {
      const winners = determineWinner(updatedPlayers);
      const winnerNames = winners.map(w => w.name).join(" et ");
      
      toast({
        title: "Fin de la partie !",
        description: `${winnerNames} ${winners.length > 1 ? 'remportent' : 'remporte'} la partie avec ${winners[0].totalScore} points !`
      });
      
      return {
        players: updatedPlayers,
        gamePhase: "gameEnd" as const,
        currentPlayerIndex: 0
      };
    } else {
      toast({
        title: "Fin de la manche !",
        description: "Les scores ont été mis à jour. Une nouvelle manche va commencer."
      });
      
      return {
        players: updatedPlayers,
        gamePhase: "roundEnd" as const,
        currentPlayerIndex: 0
      };
    }
  }
  return null;
};