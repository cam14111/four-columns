import { Card, Player } from "./types";

export const selectInitialCardsForAI = (player: Player): { newGrid: Card[], initialCardsSum: number } => {
  // Create a deep copy of the grid to avoid modifying the original
  const newGrid = [...player.grid];
  
  // Get only hidden cards with their indices
  const hiddenCards = player.grid
    .map((card, index) => ({ card, index }))
    .filter(item => item.card && item.card.state === "hidden");

  console.log("AI found hidden cards:", hiddenCards.length);

  // Early return if we don't have enough hidden cards
  if (hiddenCards.length < 2) {
    console.error("Not enough hidden cards for AI selection");
    return { newGrid, initialCardsSum: 0 };
  }

  // Sort cards by value (ascending)
  const sortedCards = hiddenCards
    .sort((a, b) => (a.card?.value || 0) - (b.card?.value || 0))
    .slice(0, 2); // Take exactly 2 cards

  console.log("AI selected cards:", sortedCards.map(c => c.card?.value));

  // Verify we have exactly 2 cards
  if (sortedCards.length !== 2) {
    console.error("Could not select exactly 2 cards");
    return { newGrid, initialCardsSum: 0 };
  }

  // Calculate sum and reveal only these 2 cards
  let sum = 0;
  sortedCards.forEach(({ card, index }) => {
    if (card) {
      newGrid[index] = { ...card, state: "visible" };
      sum += card.value;
    }
  });

  // Verify the final state
  const finalVisibleCards = newGrid.filter(card => card && card.state === "visible");
  if (finalVisibleCards.length !== 2) {
    console.error("Final grid has wrong number of visible cards:", finalVisibleCards.length);
    return { newGrid: player.grid, initialCardsSum: 0 }; // Return original grid if something went wrong
  }

  console.log("AI selection complete. Sum:", sum, "Visible cards:", finalVisibleCards.length);
  return { newGrid, initialCardsSum: sum };
};