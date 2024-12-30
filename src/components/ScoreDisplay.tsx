import { Player } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ScoreDisplayProps {
  players: Player[];
  onNewGame: () => void;
  onContinueGame: () => void;
}

export const ScoreDisplay = ({ players, onNewGame, onContinueGame }: ScoreDisplayProps) => {
  const { toast } = useToast();

  const handleNewGame = () => {
    onNewGame();
    toast({
      title: "Nouvelle partie",
      description: "Les scores ont été remis à zéro"
    });
  };

  const handleContinueGame = () => {
    onContinueGame();
    toast({
      title: "Nouvelle manche",
      description: "Les scores de la manche précédente ont été ajoutés au total"
    });
  };

  const calculateVisibleCardsSum = (player: Player): number => {
    return player.grid
      .filter(card => card.state === "visible")
      .reduce((sum, card) => sum + card.value, 0);
  };

  return (
    <div className="space-y-4">
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
                {calculateVisibleCardsSum(player)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Button 
          onClick={handleNewGame}
          variant="default"
          className="w-full"
        >
          Nouvelle partie
        </Button>
        <Button 
          onClick={handleContinueGame}
          variant="secondary"
          className="w-full"
        >
          Continuer la partie
        </Button>
      </div>
    </div>
  );
};