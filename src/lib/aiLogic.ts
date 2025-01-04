import { Card, Player } from "./types";

export const selectInitialCardsForAI = (player: Player): { newGrid: Card[], initialCardsSum: number } => {
  // Trouver toutes les cartes cachées
  const hiddenCards = player.grid
    .map((card, index) => ({ card, index }))
    .filter(item => item.card && item.card.state === "hidden")
    .sort((a, b) => a.card.value - b.card.value);

  const newGrid = [...player.grid];
  let sum = 0;

  // Sélectionner exactement 2 cartes avec les plus petites valeurs
  const cardsToReveal = hiddenCards.slice(0, 2);

  cardsToReveal.forEach(cardInfo => {
    newGrid[cardInfo.index] = { ...cardInfo.card, state: "visible" };
    sum += cardInfo.card.value;
  });

  console.log("AI selected cards:", cardsToReveal.length, "cards with sum:", sum);

  return { newGrid, initialCardsSum: sum };
};