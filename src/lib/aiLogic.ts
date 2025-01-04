import { Card, Player } from "./types";

export const selectInitialCardsForAI = (player: Player): { newGrid: Card[], initialCardsSum: number } => {
  // Créer une copie profonde de la grille pour éviter toute mutation
  const gridCopy = player.grid.map(card => 
    card ? { ...card } : null
  );
  
  // Obtenir les cartes cachées avec leurs indices
  const hiddenCards = gridCopy
    .map((card, index) => ({ card, index }))
    .filter(item => item.card && item.card.state === "hidden");

  console.log("AI found hidden cards:", hiddenCards.length);

  // Retour anticipé si pas assez de cartes cachées
  if (hiddenCards.length < 2) {
    console.error("Not enough hidden cards for AI selection");
    return { newGrid: gridCopy, initialCardsSum: 0 };
  }

  // Trier les cartes par valeur (croissant)
  const sortedCards = [...hiddenCards]
    .sort((a, b) => (a.card?.value || 0) - (b.card?.value || 0))
    .slice(0, 2);

  console.log("AI selected cards:", sortedCards.map(c => c.card?.value));

  // Vérifier qu'on a exactement 2 cartes
  if (sortedCards.length !== 2) {
    console.error("Could not select exactly 2 cards");
    return { newGrid: gridCopy, initialCardsSum: 0 };
  }

  // Calculer la somme et révéler uniquement ces 2 cartes
  let sum = 0;
  sortedCards.forEach(({ card, index }) => {
    if (card) {
      gridCopy[index] = { ...card, state: "visible" };
      sum += card.value;
    }
  });

  // Vérifier l'état final
  const finalVisibleCards = gridCopy.filter(card => card && card.state === "visible");
  if (finalVisibleCards.length !== 2) {
    console.error("Final grid has wrong number of visible cards:", finalVisibleCards.length);
    return { newGrid: player.grid.map(card => card ? { ...card } : null), initialCardsSum: 0 };
  }

  console.log("AI selection complete. Sum:", sum, "Visible cards:", finalVisibleCards.length);
  return { newGrid: gridCopy, initialCardsSum: sum };
};