import { Card, Player } from "./types";

export const selectInitialCardsForAI = (player: Player): { newGrid: Card[], initialCardsSum: number } => {
  // Trouver les deux cartes avec les plus petites valeurs
  const hiddenCards = player.grid
    .map((card, index) => ({ card, index }))
    .filter(item => item.card.state === "hidden")
    .sort((a, b) => a.card.value - b.card.value);

  const newGrid = [...player.grid];
  let sum = 0;

  // Révéler les deux cartes avec les plus petites valeurs
  for (let i = 0; i < 2 && i < hiddenCards.length; i++) {
    const cardInfo = hiddenCards[i];
    newGrid[cardInfo.index] = { ...cardInfo.card, state: "visible" };
    sum += cardInfo.card.value;
  }

  return { newGrid, initialCardsSum: sum };
};