import { supabase } from "@/integrations/supabase/client";

export const saveGameScore = async (playerName: string, roundScore: number, totalScore: number) => {
  const { error } = await supabase
    .from("game_scores")
    .insert([
      {
        player_name: playerName,
        round_score: roundScore,
        total_score: totalScore,
      },
    ]);

  if (error) {
    console.error("Error saving score:", error);
    throw error;
  }
};