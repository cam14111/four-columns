// Original card colour scheme (no third-party artwork).
// The colour tiers follow the value ranges so the board stays easy to read.
export interface CardTheme {
  bg: string;
  fg: string;
}

export const getCardTheme = (value: number): CardTheme => {
  if (value < 0) return { bg: "#1e3a8a", fg: "#ffffff" }; // -2, -1 : bleu foncé
  if (value === 0) return { bg: "#0ea5e9", fg: "#ffffff" }; // 0 : bleu clair
  if (value <= 4) return { bg: "#22c55e", fg: "#ffffff" }; // 1-4 : vert
  if (value <= 8) return { bg: "#f4c025", fg: "#1f2937" }; // 5-8 : jaune
  return { bg: "#ef4444", fg: "#ffffff" }; // 9-12 : rouge
};
