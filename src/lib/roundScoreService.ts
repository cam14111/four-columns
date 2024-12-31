import { supabase } from "@/integrations/supabase/client";
import { Player } from "@/lib/types";

export const saveRoundScores = async (players: Player[], roundNumber: number) => {
  const roundScores = players.map(player => ({
    player_name: player.name,
    round_number: roundNumber,
    round_score: player.score
  }));

  const { error } = await supabase
    .from('round_history')
    .insert(roundScores);

  if (error) {
    console.error('Error saving round scores:', error);
  }
};