import { Card, CardValue, Player, GameState } from "./types";
import { checkColumnMatch } from "./columnMatchLogic";
import { 
  shouldDrawFromDiscard, 
  shouldKeepCard, 
  chooseBestHiddenCard 
} from "./aiStrategy";

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

export const calculateInitialCardsSum = (grid: Card[]): number => {
  return grid.filter(card => card && card.state === "visible")
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
  return grid.filter(card => card !== null).reduce((sum, card) => sum + card.value, 0);
};

export const isGameOver = (players: Player[]): boolean => {
  return players.some(player => player.totalScore >= 100);
};

export const isRoundOver = (grid: Card[]): boolean => {
  return grid.every(card => card === null || card.state === "visible");
};

export const calculateRoundScores = (players: Player[], firstFinishedPlayer: Player): Player[] => {
  const updatedPlayers = players.map(player => {
    const roundScore = calculateScore(player.grid);
    let finalRoundScore = roundScore;
    
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
    const hiddenCards = currentPlayer.grid
      .map((card, index) => ({ card, index }))
      .filter(item => item.card && item.card.state === "hidden")
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

        if (newState.players.every(p => p.initialCardsSum !== undefined)) {
          newState.currentPlayerIndex = determineFirstPlayer(newState.players);
          newState.gamePhase = "draw";
        }
      }
    }
  } else if (gameState.gamePhase === "draw") {
    if (newState.discardPile.length > 0 && 
        shouldDrawFromDiscard(newState.discardPile[0], currentPlayer)) {
      const drawnCard = newState.discardPile[0];
      newState.discardPile = newState.discardPile.slice(1);
      newState.selectedCard = { ...drawnCard, state: "replacing" };
      newState.gamePhase = "action";
    } else {
      const drawnCard = newState.deck[0];
      newState.deck = newState.deck.slice(1);
      newState.selectedCard = drawnCard;
      newState.gamePhase = "action";
    }
  } else if (gameState.gamePhase === "action" && newState.selectedCard) {
    const { keep, replaceIndex } = shouldKeepCard(newState.selectedCard, currentPlayer);

    if (keep && replaceIndex !== -1) {
      const oldCard = currentPlayer.grid[replaceIndex];
      if (oldCard) {
        newState.discardPile = [oldCard, ...newState.discardPile];
        const newGrid = [...currentPlayer.grid];
        newGrid[replaceIndex] = { ...newState.selectedCard, state: "visible" };
        currentPlayer.grid = newGrid;
      }
    } else {
      newState.discardPile = [newState.selectedCard, ...newState.discardPile];
      const bestHiddenCardIndex = chooseBestHiddenCard(currentPlayer);
      
      if (bestHiddenCardIndex !== -1) {
        const newGrid = [...currentPlayer.grid];
        const cardToReveal = newGrid[bestHiddenCardIndex];
        if (cardToReveal) {
          newGrid[bestHiddenCardIndex] = { ...cardToReveal, state: "visible" };
          currentPlayer.grid = newGrid;
        }
      }
    }

    newState.selectedCard = null;
    newState.gamePhase = "draw";
    newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
  }

  return newState;
};

export const revealAllCards = (players: Player[]): Player[] => {
  return players.map(player => ({
    ...player,
    grid: player.grid.map(card => 
      card ? { ...card, state: "visible" as const } : null
    )
  }));
};
