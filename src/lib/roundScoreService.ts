import { Player } from "@/lib/types";
import { addRoundScores } from "@/lib/roundHistoryStore";

export const saveRoundScores = (players: Player[], roundNumber: number) => {
  try {
    addRoundScores(
      players.map((player) => ({
        player_name: player.name,
        round_number: roundNumber,
        round_score: player.score,
      }))
    );
  } catch (error) {
    console.error("Error in saveRoundScores:", error);
  }
};
