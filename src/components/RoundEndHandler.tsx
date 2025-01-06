import { GameState, Player } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface RoundEndHandlerProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

export const useRoundEndHandler = ({ gameState, setGameState }: RoundEndHandlerProps) => {
  const { toast } = useToast();

  const handleGameEnd = async () => {
    // Calculer les scores de base pour tous les joueurs
    const baseScores = gameState.players.map(player => ({
      ...player,
      score: calculateVisibleCardsSum(player)
    }));

    // Déterminer le score minimum parmi tous les joueurs
    const minScore = Math.min(...baseScores.map(p => p.score));
    
    // Identifier le joueur qui a terminé la manche (currentPlayer)
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const currentPlayerScore = calculateVisibleCardsSum(currentPlayer);

    // Appliquer la règle du doublement uniquement au joueur qui termine la manche
    // si son score n'est pas le plus petit (ou à égalité avec le plus petit)
    const finalPlayers = baseScores.map(player => ({
      ...player,
      score: player.id === currentPlayer.id && currentPlayerScore > minScore 
        ? player.score * 2 
        : player.score
    }));

    try {
      // Utiliser une transaction pour s'assurer de l'atomicité des opérations
      const { data, error: lastRoundError } = await supabase.rpc(
        'get_and_lock_last_round_number'
      );

      if (lastRoundError) {
        console.error('Error getting last round number:', lastRoundError);
        throw lastRoundError;
      }

      // Vérifier que data existe et contient un round_number
      if (!data || data.length === 0) {
        throw new Error('No round number returned');
      }

      const currentRoundNumber = data[0].round_number + 1;

      // Insérer les scores en une seule opération atomique
      const { error: insertError } = await supabase
        .from('round_history')
        .upsert(
          finalPlayers.map(player => ({
            player_name: player.name,
            round_number: currentRoundNumber,
            round_score: player.score
          })),
          { onConflict: 'player_name,round_number' }
        );

      if (insertError) {
        console.error('Error inserting scores:', insertError);
        throw insertError;
      }

      console.log(`Scores sauvegardés pour la manche ${currentRoundNumber}`);

      // Vérifier si un joueur a atteint ou dépassé 100 points
      const playersOver100 = finalPlayers.filter(player => 
        (player.totalScore + player.score) >= 100
      );

      if (playersOver100.length > 0) {
        // Le(s) joueur(s) qui n'ont pas atteint 100 points sont les gagnants
        const winners = finalPlayers.filter(player => 
          (player.totalScore + player.score) < 100
        );

        toast({
          title: "Fin de la partie !",
          description: `${winners.map(w => w.name).join(" et ")} ${winners.length > 1 ? 'remportent' : 'remporte'} la partie ! (${playersOver100.map(p => p.name).join(" et ")} ${playersOver100.length > 1 ? 'ont' : 'a'} dépassé 100 points)`
        });
      } else {
        // Message pour le vainqueur de la manche
        const roundWinner = baseScores.find(p => p.score === minScore);
        const currentPlayerDoubled = currentPlayerScore > minScore;
        
        toast({
          title: "Fin de la manche !",
          description: `${roundWinner?.name} remporte la manche avec ${minScore} points.${
            currentPlayerDoubled ? ` ${currentPlayer.name} a terminé la manche mais n'avait pas le plus petit score : son score est doublé (${currentPlayerScore} → ${currentPlayerScore * 2}).` : ''
          }`
        });
      }

      // Mettre à jour le state avec les scores finaux
      setGameState(prev => ({
        ...prev,
        players: finalPlayers,
        roundWinner: baseScores.find(p => p.score === minScore)
      }));

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