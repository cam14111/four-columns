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
            className="flex flex-col gap-2 py-3 px-4 bg-white rounded-md shadow-sm"
          >
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-medium text-gray-800">{player.name}</span>
              <div className="flex flex-col items-end">
                <span className="text-sm text-gray-500">Total des manches</span>
                <span className="text-lg font-bold text-[#0EA5E9]">
                  {player.totalScore}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Manche en cours</span>
              <span className="text-md font-semibold text-gray-700">
                {player.score}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};