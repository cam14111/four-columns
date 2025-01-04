import { Card, Player } from "./types";

export const selectInitialCardsForAI = (player: Player): { newGrid: Card[], initialCardsSum: number } => {
  // Créer une copie de la grille pour ne pas modifier l'original
  const newGrid = [...player.grid];
  let sum = 0;

  // Trouver toutes les cartes cachées
  const hiddenCards = player.grid
    .map((card, index) => ({ card, index }))
    .filter(item => item.card && item.card.state === "hidden");

  console.log("AI found hidden cards:", hiddenCards.length);

  // Vérification stricte qu'il y a au moins 2 cartes cachées
  if (hiddenCards.length < 2) {
    console.error("Error: Not enough hidden cards for AI to select");
    return { newGrid, initialCardsSum: 0 };
  }

  // Trier les cartes par valeur et prendre EXACTEMENT les 2 premières
  const sortedCards = [...hiddenCards].sort((a, b) => 
    (a.card?.value || 0) - (b.card?.value || 0)
  );
  
  // Prendre exactement 2 cartes
  const cardsToReveal = sortedCards.slice(0, 2);

  // Vérification stricte qu'on a exactement 2 cartes
  if (cardsToReveal.length !== 2) {
    console.error("Error: Could not select exactly 2 cards for AI");
    return { newGrid, initialCardsSum: 0 };
  }

  // Révéler uniquement ces 2 cartes
  cardsToReveal.forEach(({ card, index }) => {
    if (card) {
      newGrid[index] = { ...card, state: "visible" };
      sum += card.value;
    }
  });

  console.log("AI selected exactly", cardsToReveal.length, "cards with sum:", sum);
  console.log("Selected cards:", cardsToReveal.map(c => c.card?.value));

  return { newGrid, initialCardsSum: sum };
};