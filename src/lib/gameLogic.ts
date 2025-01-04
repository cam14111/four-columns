import { GameState } from "./types";
import { createDeck, dealInitialCards } from "./game/deckOperations";
import { calculateInitialCardsSum, calculateRoundScores, calculateScore } from "./game/scoreCalculation";
import { isGameOver, isRoundOver, determineFirstPlayer, revealAllCards } from "./game/gameStateChecks";
import { checkColumnMatch } from "./columnMatchLogic";

export {
  createDeck,
  dealInitialCards,
  calculateInitialCardsSum,
  calculateRoundScores,
  calculateScore,
  isGameOver,
  isRoundOver,
  determineFirstPlayer,
  revealAllCards
};

export const makeAIMove = (gameState: GameState): GameState => {
  const newState = { ...gameState };
  const currentPlayer = newState.players[newState.currentPlayerIndex];

  if (gameState.gamePhase === "selectInitialCards") {
    // L'IA choisit les deux cartes avec les plus petites valeurs
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
    // Décision de l'IA : piocher ou prendre dans la défausse
    const shouldDrawFromDiscard = 
      newState.discardPile.length > 0 && 
      newState.discardPile[0].value < Math.max(...currentPlayer.grid
        .filter(card => card && card.state === "visible")
        .map(card => card.value));

    if (shouldDrawFromDiscard) {
      // Prendre la carte de la défausse
      const drawnCard = newState.discardPile[0];
      newState.discardPile = newState.discardPile.slice(1);
      newState.selectedCard = drawnCard;
      newState.gamePhase = "action";
    } else {
      // Piocher une carte
      const drawnCard = newState.deck[0];
      newState.deck = newState.deck.slice(1);
      newState.selectedCard = drawnCard;
      newState.gamePhase = "action";
    }
  } else if (gameState.gamePhase === "action" && newState.selectedCard) {
    // Décision de l'IA : garder ou défausser la carte
    const visibleCards = currentPlayer.grid.filter(card => card && card.state === "visible");
    const highestVisibleCard = visibleCards.reduce((prev, curr) => 
      curr.value > prev.value ? curr : prev
    , visibleCards[0]);

    if (highestVisibleCard && newState.selectedCard.value < highestVisibleCard.value) {
      // Garder la carte et remplacer la plus haute carte visible
      const index = currentPlayer.grid.findIndex(card => card && card.id === highestVisibleCard.id);
      newState.discardPile = [highestVisibleCard, ...newState.discardPile];
      const newGrid = [...currentPlayer.grid];
      newGrid[index] = { ...newState.selectedCard, state: "visible" };

      if (checkColumnMatch(newGrid, Math.floor(index / 3))) {
        newGrid.forEach((card, i) => {
          if (Math.floor(i / 3) === Math.floor(index / 3)) {
            newGrid[i] = { ...card, state: "hidden" };
          }
        });
      }

      currentPlayer.grid = newGrid;
    } else {
      // Défausser la carte et retourner une carte cachée
      newState.discardPile = [newState.selectedCard, ...newState.discardPile];
      const hiddenCards = currentPlayer.grid
        .map((card, index) => ({ card, index }))
        .filter(item => item.card && item.card.state === "hidden");

      if (hiddenCards.length > 0) {
        // Choisir une carte cachée au hasard
        const randomIndex = Math.floor(Math.random() * hiddenCards.length);
        const cardToReveal = hiddenCards[randomIndex];
        const newGrid = [...currentPlayer.grid];
        newGrid[cardToReveal.index] = { ...cardToReveal.card, state: "visible" };
        currentPlayer.grid = newGrid;
      }
    }

    newState.selectedCard = null;
    newState.gamePhase = "draw";
    newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
  }

  return newState;
};
