import { Card, CardValue } from "../types";

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  const values: CardValue[] = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  
  values.forEach((value) => {
    const frequency = value === -2 ? 5 :
                     value === -1 ? 10 :
                     value === 0 ? 15 :
                     10;
    
    for (let i = 0; i < frequency; i++) {
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
  return { playerGrid, remainingDeck };
};