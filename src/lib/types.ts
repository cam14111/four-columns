export type CardValue = -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type CardState = "hidden" | "visible" | "replacing";

export interface Card {
  id: string;
  value: CardValue;
  state: CardState;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  totalScore: number;
  grid: (Card | null)[];
  isAI: boolean;
  initialCardsSum?: number;
  roundHistory: number[];
}

export type GamePhase = 
  | "initial" 
  | "selectInitialCards" 
  | "draw" 
  | "action" 
  | "selectHiddenCard"
  | "roundEnd" 
  | "gameEnd";

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  deck: Card[];
  discardPile: Card[];
  gamePhase: GamePhase;
  selectedCard: Card | null;
  roundWinner: Player | null;
  selectedInitialCards: number;
}