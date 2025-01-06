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

// Trouve la meilleure carte à remplacer dans la grille (uniquement parmi les cartes visibles)
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

// Évalue si une colonne est prometteuse pour être complétée (uniquement avec les cartes visibles)
const isColumnPromising = (grid: (Card | null)[], columnIndex: number): boolean => {
  const columnCards = grid.filter((card, index) => 
    index % 4 === columnIndex && card !== null && card.state === "visible"
  );
  
  // Si on a déjà 2 cartes visibles dans la colonne
  if (columnCards.length === 2) {
    // Et qu'elles ont la même valeur
    if (columnCards[0].value === columnCards[1].value) {
      return true;
    }
    // Ou qu'elles sont toutes les deux basses
    if (columnCards.every(card => isGoodCard(card.value))) {
      return true;
    }
  }

  return false;
};

// Trouve une carte cachée à révéler de manière aléatoire
const findRandomHiddenCard = (grid: (Card | null)[]): number => {
  const hiddenCards = grid
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card && card.state === "hidden");

  if (hiddenCards.length > 0) {
    const randomIndex = Math.floor(Math.random() * hiddenCards.length);
    return hiddenCards[randomIndex].index;
  }

  return -1;
};

// Décide si l'IA doit piocher dans la défausse (la carte est toujours visible)
export const shouldDrawFromDiscard = (
  discardCard: Card,
  currentPlayer: Player
): boolean => {
  // Toujours prendre une bonne carte
  if (isGoodCard(discardCard.value)) {
    return true;
  }

  // Prendre la carte si elle peut améliorer la grille visible
  if (canImproveGrid(discardCard, currentPlayer.grid)) {
    return true;
  }

  // Sinon, décision aléatoire avec une préférence pour ne pas prendre (30% de chances de prendre)
  return Math.random() < 0.3;
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
  // ou de manière aléatoire avec une préférence pour garder (70% de chances)
  const shouldKeep = drawnCard.value < cardToReplace.value || Math.random() < 0.7;
  
  return {
    keep: shouldKeep,
    replaceIndex: bestCardToReplaceIndex
  };
};

// Trouve une carte cachée à révéler
export const chooseBestHiddenCard = (currentPlayer: Player): number => {
  // Vérifier d'abord les colonnes prometteuses
  for (let col = 0; col < 4; col++) {
    if (isColumnPromising(currentPlayer.grid, col)) {
      // Trouver une carte cachée dans cette colonne
      const hiddenCardIndex = currentPlayer.grid.findIndex((card, index) => 
        index % 4 === col && card && card.state === "hidden"
      );
      if (hiddenCardIndex !== -1) {
        return hiddenCardIndex;
      }
    }
  }

  // Si aucune colonne n'est prometteuse, choisir une carte au hasard
  return findRandomHiddenCard(currentPlayer.grid);
};