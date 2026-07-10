import { SCORE_LIMITS, Settings } from "@/game/settings";
import { Difficulty } from "@/game/types";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DIFFICULTY_LABEL } from "../theme";

interface SettingsScreenProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

const Row = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4 py-3">
    <div>
      <div className="text-sm font-medium">{label}</div>
      {hint && <div className="text-xs text-white/50">{hint}</div>}
    </div>
    {children}
  </div>
);

const DIFFS: Difficulty[] = ["easy", "normal", "hard"];

export const SettingsScreen = ({ settings, onChange }: SettingsScreenProps) => (
  <div className="divide-y divide-white/10">
    <Row label="Nom du joueur">
      <Input
        value={settings.playerName}
        maxLength={16}
        placeholder="Vous"
        onChange={(e) => onChange({ playerName: e.target.value })}
        className="w-40 border-white/15 bg-white/10 text-right text-white placeholder:text-white/40"
      />
    </Row>

    <Row label="Difficulté" hint="S'applique à la prochaine partie">
      <div className="flex gap-1">
        {DIFFS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange({ difficulty: d })}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold",
              settings.difficulty === d
                ? "bg-amber-300 text-slate-900"
                : "bg-white/10 text-white/80"
            )}
          >
            {DIFFICULTY_LABEL[d]}
          </button>
        ))}
      </div>
    </Row>

    <Row label="Limite de score" hint="Fin de partie à ce total — prochaine partie">
      <div className="flex gap-1">
        {SCORE_LIMITS.map((limit) => (
          <button
            key={limit}
            type="button"
            onClick={() => onChange({ scoreLimit: limit })}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums",
              settings.scoreLimit === limit
                ? "bg-amber-300 text-slate-900"
                : "bg-white/10 text-white/80"
            )}
          >
            {limit}
          </button>
        ))}
      </div>
    </Row>

    <Row label="Sons" hint="Effets sonores synthétisés">
      <Switch
        checked={settings.sound}
        onCheckedChange={(v) => onChange({ sound: v })}
      />
    </Row>

    <Row label="Vibrations" hint="Retour haptique (mobile)">
      <Switch
        checked={settings.haptics}
        onCheckedChange={(v) => onChange({ haptics: v })}
      />
    </Row>
  </div>
);
