import { BarChart3, BookOpen, Play, Settings as SettingsIcon } from "lucide-react";
import { CardValue, Difficulty } from "@/game/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DIFFICULTY_LABEL } from "../theme";
import { PlayingCard } from "../PlayingCard";

interface HomeProps {
  name: string;
  difficulty: Difficulty;
  hasSavedGame: boolean;
  onNameChange: (name: string) => void;
  onDifficultyChange: (d: Difficulty) => void;
  onPlay: () => void;
  onResume: () => void;
  onOpen: (panel: "rules" | "stats" | "settings") => void;
}

const DIFFS: Difficulty[] = ["easy", "normal", "hard"];

const HeroFan = () => (
  <div className="relative mx-auto mb-2 flex h-24 w-40 items-end justify-center">
    {([-2, 5, 11] as CardValue[]).map((v, i) => (
      <div
        key={v}
        className="absolute animate-deal"
        style={{
          transform: `translateX(${(i - 1) * 44}px) rotate(${(i - 1) * 10}deg)`,
          animationDelay: `${i * 90}ms`,
          zIndex: i,
        }}
      >
        <PlayingCard card={{ id: `h${v}`, value: v, faceUp: true }} size="md" />
      </div>
    ))}
  </div>
);

export const Home = ({
  name,
  difficulty,
  hasSavedGame,
  onNameChange,
  onDifficultyChange,
  onPlay,
  onResume,
  onOpen,
}: HomeProps) => {
  return (
    <div className="app-bg flex min-h-[100dvh] flex-col items-center justify-center px-6 py-8 text-white">
      <div className="w-full max-w-sm">
        <HeroFan />
        <h1 className="text-center text-5xl font-black tracking-tight">
          4 <span className="text-amber-300">Columns</span>
        </h1>
        <p className="mt-2 text-center text-white/70">
          Videz vos colonnes, gardez le plus petit total. Vous contre
          l'ordinateur.
        </p>

        <div className="mt-7 space-y-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/60">
              Votre nom
            </label>
            <Input
              value={name}
              maxLength={16}
              placeholder="Vous"
              onChange={(e) => onNameChange(e.target.value)}
              className="border-white/15 bg-white/10 text-white placeholder:text-white/40"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/60">
              Difficulté
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {DIFFS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onDifficultyChange(d)}
                  className={cn(
                    "rounded-xl py-2 text-sm font-semibold transition-colors",
                    difficulty === d
                      ? "bg-amber-300 text-slate-900"
                      : "bg-white/10 text-white/80 hover:bg-white/15"
                  )}
                >
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {hasSavedGame && (
            <Button
              onClick={onResume}
              variant="secondary"
              className="h-12 w-full text-base"
            >
              Reprendre la partie
            </Button>
          )}
          <Button
            onClick={onPlay}
            className="h-14 w-full bg-amber-300 text-base font-bold text-slate-900 hover:bg-amber-200"
          >
            <Play className="mr-2" size={20} />
            {hasSavedGame ? "Nouvelle partie" : "Jouer"}
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <MenuTile icon={<BookOpen size={18} />} label="Règles" onClick={() => onOpen("rules")} />
          <MenuTile icon={<BarChart3 size={18} />} label="Stats" onClick={() => onOpen("stats")} />
          <MenuTile icon={<SettingsIcon size={18} />} label="Réglages" onClick={() => onOpen("settings")} />
        </div>
      </div>
    </div>
  );
};

const MenuTile = ({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex flex-col items-center gap-1 rounded-xl bg-white/5 py-3 text-xs font-medium text-white/80 ring-1 ring-white/10 hover:bg-white/10"
  >
    {icon}
    {label}
  </button>
);
