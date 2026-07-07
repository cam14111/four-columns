
import { GameState, Player } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useErrorHandler } from "@/hooks/use-error-handler";
import {
  addRoundScores,
  getLastRoundNumber,
  getRoundHistory,
} from "@/lib/roundHistoryStore";

interface RoundEndHandlerProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

export const useRoundEndHandler = ({ gameState, setGameState }: RoundEndHandlerProps) => {
  const { toast } = useToast();
  const { handleError } = useErrorHandler();

  const handleGameEnd = async () => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const hasFinishedRound = currentPlayer.grid.every(card => card === null || card.state === "visible");

    if (!hasFinishedRound) return;

    // Calculate base scores first (without doubling)
    const baseScores = gameState.players.map(player => ({
      ...player,
      score: calculateVisibleCardsSum(player)
    }));

    // Find the maximum score
    const maxScore = Math.max(...baseScores.map(p => p.score));

    // Double score ONLY for the current player if they finished first AND have the highest score
    const finalPlayers = baseScores.map(player => ({
      ...player,
      score: player.id === currentPlayer.id && hasFinishedRound && player.score === maxScore
        ? player.score * 2 
        : player.score
    }));

    try {
      // Local, single-device play: no concurrency, so the next round number is
      // simply the last recorded one + 1.
      const currentRoundNumber = getLastRoundNumber() + 1;

      // Vérifier si la manche actuelle a déjà été enregistrée
      const existingRounds = getRoundHistory().filter(
        (round) =>
          round.round_number === currentRoundNumber &&
          round.player_name === currentPlayer.name
      );

      // Si la manche n'a pas encore été enregistrée pour ce joueur, procéder à l'insertion
      if (existingRounds.length === 0) {
        // addRoundScores deduplicates on (player_name, round_number), so any
        // scores already recorded for this round are left untouched.
        addRoundScores(
          finalPlayers.map(player => ({
            player_name: player.name,
            round_number: currentRoundNumber,
            round_score: player.score
          }))
        );

        const playersOver100 = finalPlayers.filter(player =>
          (player.totalScore + player.score) >= 100
        );

        if (playersOver100.length > 0) {
          const winners = finalPlayers.filter(player => 
            (player.totalScore + player.score) < 100
          );

          toast({
            title: "Fin de la partie !",
            description: `${winners.map(w => w.name).join(" et ")} ${winners.length > 1 ? 'remportent' : 'remporte'} la partie ! (${playersOver100.map(p => p.name).join(" et ")} ${playersOver100.length > 1 ? 'ont' : 'a'} dépassé 100 points)`,
            duration: 5000, // 5 secondes
          });
        } else if (hasFinishedRound && currentPlayer.score === maxScore) {
          toast({
            title: "Fin de la manche !",
            description: `${currentPlayer.name} a terminé la manche en premier avec le plus grand score (${currentPlayer.score / 2} points) : son score est doublé → ${currentPlayer.score} points.`,
            duration: 5000, // 5 secondes
          });
        } else if (hasFinishedRound) {
          toast({
            title: "Fin de la manche !",
            description: `${currentPlayer.name} a terminé la manche en premier mais n'a pas le plus grand score : pas de doublement.`,
            duration: 5000, // 5 secondes
          });
        }

        setGameState(prev => ({
          ...prev,
          players: finalPlayers,
          roundWinner: currentPlayer
        }));
      }
    } catch (error) {
      handleError(error);
    }
  };

  const calculateVisibleCardsSum = (player: Player): number => {
    return player.grid
      .filter(card => card && card.state === "visible")
      .reduce((sum, card) => sum + (card?.value || 0), 0);
  };

  return {
    handleGameEnd,
    calculateVisibleCardsSum
  };
};
