import { supabase } from "@/integrations/supabase/client";
import { Player } from "@/lib/types";

export const saveRoundScores = async (players: Player[], roundNumber: number) => {
  try {
    // D'abord, vérifions s'il existe déjà des scores pour ce tour
    const { data: existingScores } = await supabase
      .from('round_history')
      .select('player_name')
      .eq('round_number', roundNumber);

    // Filtrer les scores qui n'existent pas encore
    const scoresToInsert = players.filter(player => 
      !existingScores?.some(score => score.player_name === player.name)
    ).map(player => ({
      player_name: player.name,
      round_number: roundNumber,
      round_score: player.score
    }));

    // N'insérer que s'il y a de nouveaux scores
    if (scoresToInsert.length > 0) {
      const { error } = await supabase
        .from('round_history')
        .insert(scoresToInsert);

      if (error) {
        console.error('Error saving round scores:', error);
      }
    }
  } catch (error) {
    console.error('Error in saveRoundScores:', error);
  }
};