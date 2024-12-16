import { Player } from "@/lib/types";

interface ScoreDisplayProps {
  players: Player[];
}

export const ScoreDisplay = ({ players }: ScoreDisplayProps) => {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold text-game-primary">Scores</h3>
      <div className="space-y-1">
        {players.map((player) => (
          <div
            key={player.id}
            className="flex justify-between items-center py-1 px-3 bg-white rounded-md shadow-sm"
          >
            <span className="font-medium">{player.name}</span>
            <span className="text-game-primary font-bold">{player.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
};