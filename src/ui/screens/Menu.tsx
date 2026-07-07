import {
  BarChart3,
  BookOpen,
  Home as HomeIcon,
  Play,
  RefreshCw,
  Settings as SettingsIcon,
} from "lucide-react";

interface MenuProps {
  onResume: () => void;
  onNewGame: () => void;
  onOpen: (panel: "rules" | "stats" | "settings") => void;
  onHome: () => void;
}

const Item = ({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-medium ring-1 ring-white/10 transition-colors hover:bg-white/10 ${
      danger ? "bg-white/5 text-rose-200" : "bg-white/5 text-white"
    }`}
  >
    <span className="text-white/70">{icon}</span>
    {label}
  </button>
);

export const Menu = ({ onResume, onNewGame, onOpen, onHome }: MenuProps) => (
  <div className="space-y-2">
    <Item icon={<Play size={18} />} label="Reprendre" onClick={onResume} />
    <Item icon={<RefreshCw size={18} />} label="Nouvelle partie" onClick={onNewGame} />
    <Item icon={<BookOpen size={18} />} label="Règles" onClick={() => onOpen("rules")} />
    <Item icon={<BarChart3 size={18} />} label="Statistiques" onClick={() => onOpen("stats")} />
    <Item icon={<SettingsIcon size={18} />} label="Réglages" onClick={() => onOpen("settings")} />
    <Item icon={<HomeIcon size={18} />} label="Menu principal" onClick={onHome} danger />
  </div>
);
