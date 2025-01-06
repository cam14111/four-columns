import { Card, Player } from "./types";

export const selectInitialCardsForAI = (player: Player): { newGrid: Card[], initialCardsSum: number } => {
  // Get all hidden cards indices
  const hiddenCardsIndices = player.grid
    .map((card, index) => ({ card, index }))
    .filter(item => item.card?.state === "hidden")
    .map(item => item.index);

  // Randomly select two indices
  const selectedIndices: number[] = [];
  while (selectedIndices.length < 2 && hiddenCardsIndices.length > 0) {
    const randomIndex = Math.floor(Math.random() * hiddenCardsIndices.length);
    const cardIndex = hiddenCardsIndices[randomIndex];
    selectedIndices.push(cardIndex);
    hiddenCardsIndices.splice(randomIndex, 1);
  }

  const newGrid = [...player.grid];
  let sum = 0;

  // Reveal the randomly selected cards
  selectedIndices.forEach(index => {
    const card = newGrid[index];
    if (card) {
      newGrid[index] = { ...card, state: "visible" };
      sum += card.value;
    }
  });

  return { newGrid, initialCardsSum: sum };
};