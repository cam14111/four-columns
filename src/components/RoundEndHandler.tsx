import { GameState, Player } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { supabase } from "@/integrations/supabase/client";

interface RoundEndHandlerProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

export const useRoundEndHandler = ({ gameState, setGameState }: RoundEndHandlerProps) => {
  const { toast } = useToast();
  const { handleError } = useErrorHandler();

  const handleGameEnd = async () => {
    const baseScores = gameState.players.map(player => ({
      ...player,
      score: calculateVisibleCardsSum(player)
    }));

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const hasFinishedRound = currentPlayer.grid.every(card => card === null || card.state === "visible");

    // Le score est doublé uniquement pour le joueur qui termine en premier
    const finalPlayers = baseScores.map(player => ({
      ...player,
      score: player.id === currentPlayer.id && hasFinishedRound 
        ? player.score * 2 
        : player.score
    }));

    try {
      const { data: lastRoundData, error: lastRoundError } = await supabase.rpc(
        'get_and_lock_last_round_number'
      );

      if (lastRoundError) {
        throw lastRoundError;
      }

      if (!lastRoundData || lastRoundData.length === 0) {
        throw new Error('Aucun numéro de manche retourné');
      }

      const currentRoundNumber = lastRoundData[0].round_number + 1;

      const upsertPromises = finalPlayers.map(player => 
        supabase
          .from('round_history')
          .upsert(
            {
              player_name: player.name,
              round_number: currentRoundNumber,
              round_score: player.score
            },
            {
              onConflict: 'player_name,round_number',
              ignoreDuplicates: false
            }
          )
      );

      const results = await Promise.all(upsertPromises);
      const errors = results.filter(result => result.error);
      
      if (errors.length > 0) {
        throw new Error('Erreur lors de la sauvegarde des scores');
      }

      const playersOver100 = finalPlayers.filter(player => 
        (player.totalScore + player.score) >= 100
      );

      if (playersOver100.length > 0) {
        const winners = finalPlayers.filter(player => 
          (player.totalScore + player.score) < 100
        );

        toast({
          title: "Fin de la partie !",
          description: `${winners.map(w => w.name).join(" et ")} ${winners.length > 1 ? 'remportent' : 'remporte'} la partie ! (${playersOver100.map(p => p.name).join(" et ")} ${playersOver100.length > 1 ? 'ont' : 'a'} dépassé 100 points)`
        });
      } else {
        toast({
          title: "Fin de la manche !",
          description: `${currentPlayer.name} a terminé la manche en premier : son score est doublé (${currentPlayer.score / 2} → ${currentPlayer.score}).`
        });
      }

      setGameState(prev => ({
        ...prev,
        players: finalPlayers,
        roundWinner: currentPlayer
      }));

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