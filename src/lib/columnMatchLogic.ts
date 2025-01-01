import { Card } from "@/lib/types";

export const checkColumnMatch = (grid: Card[], columnIndex: number): boolean => {
  // Récupérer toutes les cartes de la colonne spécifiée
  const column = grid.filter((_, index) => index % 4 === columnIndex);
  
  // Une colonne doit avoir exactement 3 cartes pour être valide
  if (column.length !== 3) return false;
  
  // Toutes les cartes doivent être visibles
  if (!column.every(card => card.state === "visible")) return false;
  
  // Vérifier que toutes les cartes ont la même valeur
  const firstValue = column[0].value;
  const allSameValue = column.every(card => card.value === firstValue);
  
  // Pour le débogage
  if (allSameValue) {
    console.log(`Colonne ${columnIndex} correspond: toutes les cartes sont ${firstValue}`);
  }
  
  return allSameValue;
};

export const handleColumnMatch = (grid: Card[], cardIndex: number) => {
  const columnIndex = cardIndex % 4;
  
  // Vérifier si la colonne est complète avec des cartes identiques
  if (checkColumnMatch(grid, columnIndex)) {
    console.log(`Colonne ${columnIndex} correspond, préparation à la suppression`);
    
    // Au lieu de filtrer la grille, nous allons créer une nouvelle grille
    // où les cartes de la colonne correspondante sont marquées comme supprimées
    const newGrid = grid.map((card, index) => {
      if (index % 4 === columnIndex) {
        // Marquer la carte comme supprimée en la rendant invisible
        return { ...card, state: "hidden" as const };
      }
      return card;
    });
    
    // Récupérer les cartes de la colonne pour la défausse
    const columnCards = grid.filter((_, index) => index % 4 === columnIndex);
    
    return {
      columnCards,
      filteredGrid: newGrid,
      hasMatch: true
    };
  }
  
  return {
    columnCards: [],
    filteredGrid: grid,
    hasMatch: false
  };
};