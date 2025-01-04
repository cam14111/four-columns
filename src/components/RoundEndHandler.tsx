import { GameState, Player } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { saveGameScore } from "@/lib/scoreService";

interface RoundEndHandlerProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

export const useRoundEndHandler = ({ gameState, setGameState }: RoundEndHandlerProps) => {
  const { toast } = useToast();

  const handleGameEnd = async () => {
    // Calculer les scores finaux pour tous les joueurs
    const updatedPlayers = gameState.players.map(player => ({
      ...player,
      score: calculateVisibleCardsSum(player)
    }));

    // Déterminer le vainqueur de la manche
    const minScore = Math.min(...updatedPlayers.map(p => p.score));
    const winners = updatedPlayers.filter(p => p.score === minScore);

    // Mettre à jour le state avec les scores finaux
    setGameState(prev => ({
      ...prev,
      players: updatedPlayers,
      roundWinner: winners[0]
    }));

    try {
      // Récupérer le dernier numéro de manche
      const { data: lastRound } = await supabase
        .from('round_history')
        .select('round_number')
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentRoundNumber = (lastRound?.round_number || 0) + 1;

      // Sauvegarder les scores de la manche pour chaque joueur
      for (const player of updatedPlayers) {
        try {
          await supabase.from('round_history').insert({
            player_name: player.name,
            round_number: currentRoundNumber,
            round_score: player.score
          });

          await saveGameScore(
            player.name,
            player.score,
            player.totalScore + player.score
          );
        } catch (error) {
          console.error('Error saving scores:', error);
          toast({
            title: "Erreur",
            description: "Impossible de sauvegarder les scores",
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Partie terminée !",
        description: `${winners.map(w => w.name).join(" et ")} ${winners.length > 1 ? 'remportent' : 'remporte'} la manche avec ${minScore} points !`,
      });
    } catch (error) {
      console.error('Error handling game end:', error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la fin de partie",
        variant: "destructive",
      });
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