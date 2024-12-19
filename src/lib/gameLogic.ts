import { Card, CardValue, Player, GameState } from "./types";

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  const values: CardValue[] = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  
  // Distribution des cartes selon leur fréquence
  values.forEach((value) => {
    const frequency = value === -2 ? 5 : // 5 cartes de -2
                     value === -1 ? 10 : // 10 cartes de -1
                     value === 0 ? 15 : // 15 cartes de 0
                     10; // 10 cartes pour toutes les autres valeurs
    
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

export const calculateInitialCardsSum = (grid: Card[]): number => {
  return grid.filter(card => card.state === "visible")
    .reduce((sum, card) => sum + card.value, 0);
};

export const determineFirstPlayer = (players: Player[]): number => {
  let maxSum = -Infinity;
  let firstPlayerIndex = 0;

  players.forEach((player, index) => {
    if (player.initialCardsSum !== undefined && player.initialCardsSum > maxSum) {
      maxSum = player.initialCardsSum;
      firstPlayerIndex = index;
    }
  });

  return firstPlayerIndex;
};

export const calculateScore = (grid: Card[]): number => {
  return grid.reduce((sum, card) => sum + card.value, 0);
};

export const isGameOver = (players: Player[]): boolean => {
  return players.some(player => player.totalScore >= 100);
};

export const isRoundOver = (grid: Card[]): boolean => {
  return grid.every(card => card.state === "visible");
};

export const checkColumnMatch = (grid: Card[], columnIndex: number): boolean => {
  const column = grid.filter((_, index) => Math.floor(index / 3) === columnIndex);
  if (column.length !== 3) return false;
  
  return column.every(card => 
    card.state === "visible" && 
    card.value === column[0].value
  );
};

export const calculateRoundScores = (players: Player[], firstFinishedPlayer: Player): Player[] => {
  const updatedPlayers = players.map(player => {
    const roundScore = calculateScore(player.grid);
    let finalRoundScore = roundScore;
    
    // Si le premier joueur à finir n'a pas le plus petit score, il prend 10 points de pénalité
    if (player.id === firstFinishedPlayer.id) {
      const otherPlayersMinScore = Math.min(
        ...players
          .filter(p => p.id !== player.id)
          .map(p => calculateScore(p.grid))
      );
      
      if (roundScore >= otherPlayersMinScore) {
        finalRoundScore += 10;
      }
    }
    
    return {
      ...player,
      score: finalRoundScore,
      totalScore: player.totalScore + finalRoundScore
    };
  });
  
  return updatedPlayers;
};

export const makeAIMove = (gameState: GameState): GameState => {
  const newState = { ...gameState };
  const currentPlayer = newState.players[newState.currentPlayerIndex];

  if (gameState.gamePhase === "selectInitialCards") {
    // L'IA choisit les deux cartes avec les plus petites valeurs
    const hiddenCards = currentPlayer.grid
      .map((card, index) => ({ card, index }))
      .filter(item => item.card.state === "hidden")
      .sort((a, b) => a.card.value - b.card.value);

    if (hiddenCards.length > 0) {
      const cardToReveal = hiddenCards[0];
      const newGrid = [...currentPlayer.grid];
      newGrid[cardToReveal.index] = { ...cardToReveal.card, state: "visible" };
      currentPlayer.grid = newGrid;
      newState.selectedInitialCards++;

      if (newState.selectedInitialCards === 2) {
        currentPlayer.initialCardsSum = calculateInitialCardsSum(newGrid);
        newState.selectedInitialCards = 0;
        newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;

        // Si tous les joueurs ont sélectionné leurs cartes
        if (newState.players.every(p => p.initialCardsSum !== undefined)) {
          newState.currentPlayerIndex = determineFirstPlayer(newState.players);
          newState.gamePhase = "draw";
        }
      }
    }
  } else if (gameState.gamePhase === "draw") {
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
