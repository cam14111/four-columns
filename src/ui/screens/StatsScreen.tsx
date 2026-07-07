import { Stats } from "@/game/stats";
import { Button } from "@/components/ui/button";
import { DIFFICULTY_LABEL } from "../theme";

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
    <div className="text-2xl font-black tabular-nums">{value}</div>
    <div className="text-xs text-white/60">{label}</div>
  </div>
);

export const StatsScreen = ({
  stats,
  onReset,
}: {
  stats: Stats;
  onReset: () => void;
}) => {
  const winRate =
    stats.gamesPlayed > 0
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
      : 0;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Parties jouées" value={stats.gamesPlayed} />
        <Stat label="Parties gagnées" value={stats.gamesWon} />
        <Stat label="Taux de victoire" value={`${winRate}%`} />
        <Stat label="Série en cours" value={stats.currentStreak} />
        <Stat label="Meilleure série" value={stats.bestStreak} />
        <Stat label="Manches jouées" value={stats.roundsPlayed} />
        <Stat label="Colonnes vidées" value={stats.columnsCleared} />
        <Stat
          label="Meilleur score (manche)"
          value={stats.bestRoundScore ?? "—"}
        />
        <Stat
          label="Meilleur total gagnant"
          value={stats.bestGameScore ?? "—"}
        />
      </div>

      <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-amber-300">
        Victoires par difficulté
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {(["easy", "normal", "hard"] as const).map((d) => (
          <div
            key={d}
            className="rounded-xl bg-white/5 p-3 text-center ring-1 ring-white/10"
          >
            <div className="text-xl font-black tabular-nums">
              {stats.winsByDifficulty[d]}
            </div>
            <div className="text-xs text-white/60">{DIFFICULTY_LABEL[d]}</div>
          </div>
        ))}
      </div>

      <Button
        variant="secondary"
        onClick={onReset}
        className="mt-6 w-full"
      >
        Réinitialiser les statistiques
      </Button>
    </div>
  );
};
