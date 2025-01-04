import { Player } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ScoreDisplayProps {
  players: Player[];
  onNewGame: () => void;
  onContinueGame: () => void;
}

interface RoundHistory {
  id: string;
  player_name: string;
  round_number: number;
  round_score: number;
  created_at: string;
}

export const ScoreDisplay = ({ players, onNewGame, onContinueGame }: ScoreDisplayProps) => {
  const { toast } = useToast();

  const { data: roundHistory } = useQuery({
    queryKey: ['roundHistory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('round_history')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as RoundHistory[];
    }
  });

  const roundsByNumber = roundHistory?.reduce((acc, round) => {
    if (!acc[round.round_number]) {
      acc[round.round_number] = [];
    }
    acc[round.round_number].push(round);
    return acc;
  }, {} as Record<number, RoundHistory[]>) || {};

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
      .filter(card => card && card.state === "visible")
      .reduce((sum, card) => sum + (card?.value || 0), 0);
  };

  const getRowBackgroundColor = (index: number): string => {
    const colors = [
      'bg-[#D3E4FD]', // Soft Blue for current round
      'bg-[#FDE1D3]', // Soft Peach
      'bg-[#F2FCE2]', // Soft Green
      'bg-[#FEC6A1]', // Soft Orange
      'bg-[#E5DEFF]', // Soft Purple
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-4">
      {players.map((player) => (
        <div key={player.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-3 bg-[#F1F0FB] border-b">
            <div className="flex justify-between items-center">
              <span className="font-medium text-gray-800">{player.name}</span>
              <div className="bg-[#0EA5E9] text-white px-3 py-1 rounded">
                <span className="font-bold">
                  {player.totalScore}
                </span>
              </div>
            </div>
          </div>
          
          {/* Current round */}
          <div className={`flex justify-between items-center p-3 ${getRowBackgroundColor(0)}`}>
            <span className="text-gray-700">Manche en cours</span>
            <span className="font-semibold text-gray-800">
              {calculateVisibleCardsSum(player)}
            </span>
          </div>

          {/* Round history */}
          {Object.entries(roundsByNumber)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([roundNumber, rounds], index) => {
              const roundScore = rounds.find(r => r.player_name === player.name)?.round_score || 0;
              return (
                <div
                  key={roundNumber}
                  className={`flex justify-between items-center p-3 ${getRowBackgroundColor(index + 1)}`}
                >
                  <span className="text-gray-700">Manche {roundNumber}</span>
                  <span className="font-semibold text-gray-800">{roundScore}</span>
                </div>
              );
            })}
        </div>
      ))}

      <div className="flex flex-col gap-2 mt-4">
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