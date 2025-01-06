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

    // Déterminer le score minimum de la manche
    const minScore = Math.min(...updatedPlayers.map(p => p.score));
    
    // Identifier le joueur qui a terminé la manche (currentPlayerIndex)
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const currentPlayerScore = calculateVisibleCardsSum(currentPlayer);
    
    // Appliquer la règle du doublement du score si nécessaire
    const finalPlayers = updatedPlayers.map(player => {
      if (player.id === currentPlayer.id && currentPlayerScore > minScore) {
        // Le joueur qui termine n'a pas le plus petit score, son score est doublé
        return {
          ...player,
          score: player.score * 2
        };
      }
      return player;
    });

    // Mettre à jour le state avec les scores finaux
    setGameState(prev => ({
      ...prev,
      players: finalPlayers,
      roundWinner: finalPlayers.find(p => p.score === minScore)
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
      for (const player of finalPlayers) {
        try {
          // Vérifier si un score existe déjà pour ce joueur dans cette manche
          const { data: existingScore } = await supabase
            .from('round_history')
            .select('id')
            .eq('player_name', player.name)
            .eq('round_number', currentRoundNumber)
            .maybeSingle();

          // Ne sauvegarder que si le score n'existe pas déjà
          if (!existingScore) {
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
          }
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
        const roundWinner = finalPlayers.find(p => p.score === minScore);
        const currentPlayerDoubled = currentPlayerScore > minScore;
        
        toast({
          title: "Fin de la manche !",
          description: `${roundWinner?.name} remporte la manche avec ${minScore} points.${
            currentPlayerDoubled ? ` ${currentPlayer.name} a terminé la manche mais n'avait pas le plus petit score : son score est doublé (${currentPlayerScore} → ${currentPlayerScore * 2}).` : ''
          }`
        });
      }
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