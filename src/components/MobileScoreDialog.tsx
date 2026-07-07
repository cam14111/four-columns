
import { Player } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import {
  getRoundHistory,
  RoundHistoryRecord as RoundHistory,
} from "@/lib/roundHistoryStore";

interface MobileScoreDialogProps {
  players: Player[];
  onNewGame: () => void;
  onContinueGame: () => void;
  open: boolean;
}

export const MobileScoreDialog = ({
  players,
  onNewGame,
  onContinueGame,
  open
}: MobileScoreDialogProps) => {
  const { data: roundHistory } = useQuery({
    queryKey: ['roundHistory'],
    queryFn: async () => getRoundHistory() as RoundHistory[]
  });

  const roundsByNumber = roundHistory?.reduce((acc, round) => {
    if (!acc[round.round_number]) {
      acc[round.round_number] = [];
    }
    acc[round.round_number].push(round);
    return acc;
  }, {} as Record<number, RoundHistory[]>) || {};

  const calculateTotalScore = (playerName: string): number => {
    if (!roundHistory) return 0;
    
    const completedRounds = roundHistory
      .filter(round => round.player_name === playerName)
      .sort((a, b) => a.round_number - b.round_number);
    
    return completedRounds.reduce((total, round) => total + round.round_score, 0);
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

  const isGameOver = () => {
    return players.some(player => {
      const totalScore = calculateTotalScore(player.name);
      return totalScore >= 100;
    });
  };

  return (
    <Dialog open={open} modal={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Scores</DialogTitle>
          <DialogDescription className="text-center sr-only">
            Récapitulatif des scores par manche
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {players.map((player) => {
            const totalScore = calculateTotalScore(player.name);
            const isOver100 = totalScore >= 100;
            
            return (
              <div key={player.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="p-3 bg-[#F1F0FB] border-b">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-800">{player.name}</span>
                    <div className={`${isOver100 ? 'bg-red-500' : 'bg-[#0EA5E9]'} text-white px-3 py-1 rounded`}>
                      <span className="font-bold">
                        {totalScore}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className={`flex justify-between items-center p-3 ${getRowBackgroundColor(0)}`}>
                  <span className="text-gray-700">Manche en cours</span>
                  <span className="font-semibold text-gray-800">
                    {player.score}
                  </span>
                </div>

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
            );
          })}
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <Button 
            onClick={onNewGame}
            variant="default"
            className="w-full bg-[#0F172A] hover:bg-[#1E293B]"
          >
            Nouvelle partie
          </Button>
          <Button 
            onClick={onContinueGame}
            variant="secondary"
            className="w-full"
            disabled={isGameOver()}
          >
            Continuer la partie
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
