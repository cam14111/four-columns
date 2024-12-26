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
            className="flex flex-col gap-1 py-2 px-3 bg-white rounded-md shadow-sm"
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{player.name}</span>
              <span className="text-[#0EA5E9] font-bold">{player.totalScore}</span>
            </div>
            <div className="text-sm text-gray-500">
              Manche en cours: {player.score}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};