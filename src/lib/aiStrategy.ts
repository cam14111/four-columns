import { Card, Player } from "./types";

// Évalue si une carte est considérée comme "bonne" (faible valeur)
const isGoodCard = (value: number): boolean => value <= 4;

// Évalue si une carte peut améliorer la grille en remplaçant une carte existante
const canImproveGrid = (card: Card, grid: (Card | null)[]): boolean => {
  const visibleCards = grid.filter((c): c is Card => 
    c !== null && c.state === "visible"
  );
  return visibleCards.some(c => c.value > card.value);
};

// Trouve la meilleure carte à remplacer dans la grille
const findBestCardToReplace = (newCard: Card, grid: (Card | null)[]): number => {
  let highestValue = -Infinity;
  let bestIndex = -1;

  grid.forEach((card, index) => {
    if (card && card.state === "visible" && card.value > highestValue) {
      highestValue = card.value;
      bestIndex = index;
    }
  });

  return bestIndex;
};

// Évalue si une colonne est prometteuse pour être complétée
const isColumnPromising = (grid: (Card | null)[], columnIndex: number): boolean => {
  const columnCards = grid.filter((_, index) => index % 4 === columnIndex);
  const visibleCards = columnCards.filter(card => 
    card !== null && card.state === "visible"
  ) as Card[];

  // Si on a déjà 2 cartes visibles dans la colonne
  if (visibleCards.length === 2) {
    // Et qu'elles ont la même valeur
    if (visibleCards[0].value === visibleCards[1].value) {
      return true;
    }
    // Ou qu'elles sont toutes les deux basses
    if (visibleCards.every(card => isGoodCard(card.value))) {
      return true;
    }
  }

  return false;
};

// Trouve la meilleure carte cachée à révéler
const findBestHiddenCardToReveal = (grid: (Card | null)[]): number => {
  // Vérifier d'abord les colonnes prometteuses
  for (let col = 0; col < 4; col++) {
    if (isColumnPromising(grid, col)) {
      const columnCards = grid.filter((card, index) => 
        index % 4 === col && card !== null
      );
      const hiddenCardIndex = columnCards.findIndex(card => 
        card && card.state === "hidden"
      );
      if (hiddenCardIndex !== -1) {
        return hiddenCardIndex * 4 + col;
      }
    }
  }

  // Si aucune colonne n'est prometteuse, choisir une carte au hasard
  const hiddenCards = grid
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card && card.state === "hidden");

  if (hiddenCards.length > 0) {
    const randomIndex = Math.floor(Math.random() * hiddenCards.length);
    return hiddenCards[randomIndex].index;
  }

  return -1;
};

// Décide si l'IA doit piocher dans la défausse
export const shouldDrawFromDiscard = (
  discardCard: Card,
  currentPlayer: Player
): boolean => {
  // Toujours prendre une bonne carte
  if (isGoodCard(discardCard.value)) {
    return true;
  }

  // Prendre la carte si elle peut améliorer la grille
  if (canImproveGrid(discardCard, currentPlayer.grid)) {
    return true;
  }

  return false;
};

// Décide si l'IA doit garder la carte piochée
export const shouldKeepCard = (
  drawnCard: Card,
  currentPlayer: Player
): { keep: boolean; replaceIndex: number } => {
  const bestCardToReplaceIndex = findBestCardToReplace(drawnCard, currentPlayer.grid);

  if (bestCardToReplaceIndex === -1) {
    return { keep: false, replaceIndex: -1 };
  }

  const cardToReplace = currentPlayer.grid[bestCardToReplaceIndex];
  if (!cardToReplace) {
    return { keep: false, replaceIndex: -1 };
  }

  // Garder la carte si elle est meilleure que la pire carte visible
  return {
    keep: drawnCard.value < cardToReplace.value,
    replaceIndex: bestCardToReplaceIndex
  };
};

// Trouve la meilleure carte cachée à révéler
export const chooseBestHiddenCard = (currentPlayer: Player): number => {
  return findBestHiddenCardToReveal(currentPlayer.grid);
};