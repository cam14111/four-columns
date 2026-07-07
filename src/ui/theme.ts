// Card colour tiers. Values are grouped into readable bands so the board can be
// scanned at a glance: cool colours = good (low), warm = bad (high).

export interface CardTier {
  from: string;
  to: string;
  text: string;
  ring: string;
}

export const cardTier = (value: number): CardTier => {
  if (value < 0)
    return { from: "#3b4fd6", to: "#2536a8", text: "#ffffff", ring: "#8b9cff" };
  if (value === 0)
    return { from: "#22b6e0", to: "#0e8fc0", text: "#ffffff", ring: "#7fdcf5" };
  if (value <= 4)
    return { from: "#31c56a", to: "#1f9c50", text: "#ffffff", ring: "#8ef0b4" };
  if (value <= 8)
    return { from: "#f6b93b", to: "#e0912a", text: "#3a2a05", ring: "#ffd98a" };
  return { from: "#f5556b", to: "#d63251", text: "#ffffff", ring: "#ffb0bd" };
};

export const cardGradient = (value: number): string => {
  const t = cardTier(value);
  return `linear-gradient(150deg, ${t.from}, ${t.to})`;
};

export const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Facile",
  normal: "Normal",
  hard: "Expert",
};
