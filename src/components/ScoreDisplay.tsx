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

  return (
    <div className="space-y-4">
      {players.map((player) => (
        <div key={player.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="flex justify-between items-center p-3 bg-[#0EA5E9] text-white">
            <span className="font-medium">{player.name}</span>
            <div className="flex flex-col items-end">
              <span className="text-sm opacity-90">Total des manches</span>
              <span className="text-lg font-bold">
                {player.totalScore}
              </span>
            </div>
          </div>
          
          <div className="divide-y divide-gray-100">
            <div className="p-2.5 bg-[#D3E4FD]">
              <div className="flex justify-between items-center">
                <span className="text-gray-700">Manche en cours</span>
                <span className="font-semibold text-gray-900">
                  {calculateVisibleCardsSum(player)}
                </span>
              </div>
            </div>

            {Object.entries(roundsByNumber)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([roundNumber, rounds]) => {
                const playerRound = rounds.find(r => r.player_name === player.name);
                if (!playerRound) return null;
                
                return (
                  <div 
                    key={roundNumber}
                    className={`p-2.5 ${
                      Number(roundNumber) % 2 === 0 
                        ? 'bg-[#F2FCE2]' 
                        : 'bg-[#FEF7CD]'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Manche {roundNumber}</span>
                      <span className="font-semibold text-gray-900">
                        {playerRound.round_score}
                      </span>
                    </div>
                  </div>
                );
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-2 mt-4">
        <Button 
          onClick={handleNewGame}
          variant="default"
          className="w-full bg-[#0EA5E9] hover:bg-[#0284C7]"
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