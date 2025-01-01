import { Card } from "@/lib/types";

export const checkColumnMatch = (grid: Card[], columnIndex: number): boolean => {
  // Récupérer toutes les cartes de la colonne spécifiée
  const column = grid.filter((_, index) => Math.floor(index / 3) === columnIndex);
  
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
  const columnIndex = Math.floor(cardIndex / 3);
  
  // Vérifier si la colonne est complète avec des cartes identiques
  if (checkColumnMatch(grid, columnIndex)) {
    console.log(`Colonne ${columnIndex} correspond, préparation à la suppression`);
    
    // Récupérer les cartes de la colonne
    const columnCards = grid.filter((_, index) => Math.floor(index / 3) === columnIndex);
    
    // Retirer la colonne du jeu
    const filteredGrid = grid.filter((_, index) => Math.floor(index / 3) !== columnIndex);
    
    return {
      columnCards,
      filteredGrid,
      hasMatch: true
    };
  }
  
  return {
    columnCards: [],
    filteredGrid: grid,
    hasMatch: false
  };
};