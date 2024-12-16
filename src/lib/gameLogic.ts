import { Card, CardValue, Player, GameState } from "./types";

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  const values: CardValue[] = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  
  values.forEach((value) => {
    for (let i = 0; i < 10; i++) {
      deck.push({
        id: `${value}-${i}`,
        value,
        state: "hidden",
      });
    }
  });

  return shuffle(deck);
};

export const shuffle = (array: Card[]): Card[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const dealInitialCards = (deck: Card[]): { playerGrid: Card[], remainingDeck: Card[] } => {
  const playerGrid = deck.slice(0, 12);
  const remainingDeck = deck.slice(12);
  
  // Reveal two random cards
  const indices = [
    Math.floor(Math.random() * 12),
    Math.floor(Math.random() * 11)
  ];
  playerGrid[indices[0]].state = "visible";
  playerGrid[indices[1]].state = "visible";
  
  return { playerGrid, remainingDeck };
};

export const calculateScore = (grid: Card[]): number => {
  return grid.reduce((sum, card) => sum + (card.state === "visible" ? card.value : 0), 0);
};

export const isGameOver = (grid: Card[]): boolean => {
  return grid.every(card => card.state === "visible");
};

export const makeAIMove = (gameState: GameState): GameState => {
  // Simple AI strategy: Always draw from deck and replace highest visible card
  const newState = { ...gameState };
  const currentPlayer = newState.players[newState.currentPlayerIndex];
  
  if (gameState.gamePhase === "draw") {
    // AI always draws from deck for simplicity
    const drawnCard = newState.deck[0];
    newState.deck = newState.deck.slice(1);
    newState.selectedCard = drawnCard;
    newState.gamePhase = "action";
  } else if (gameState.gamePhase === "action" && newState.selectedCard) {
    // Find highest visible card and replace it
    const visibleCards = currentPlayer.grid.filter(card => card.state === "visible");
    const highestCard = visibleCards.reduce((prev, curr) => 
      curr.value > prev.value ? curr : prev
    , visibleCards[0]);
    
    if (highestCard && newState.selectedCard.value < highestCard.value) {
      const index = currentPlayer.grid.findIndex(card => card.id === highestCard.id);
      newState.discardPile = [highestCard, ...newState.discardPile];
      currentPlayer.grid[index] = { ...newState.selectedCard, state: "visible" };
    } else {
      newState.discardPile = [newState.selectedCard, ...newState.discardPile];
    }
    
    newState.selectedCard = null;
    newState.gamePhase = "draw";
    newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
  }
  
  return newState;
};