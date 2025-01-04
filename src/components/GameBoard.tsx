import { useState, useEffect } from "react";
import { Player, GamePhase } from "@/lib/types";
import { PlayerSection } from "./game/PlayerSection";
import { GameControlSection } from "./game/GameControlSection";
import { InitialPhase } from "./game/InitialPhase";
import { createDeck } from "@/lib/gameLogic";

interface GameBoardProps {
  initialPlayerName: string;
}

export const GameBoard = ({ initialPlayerName }: GameBoardProps) => {
  const [gamePhase, setGamePhase] = useState<GamePhase>("selectInitialCards");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedInitialCards, setSelectedInitialCards] = useState(0);
  const [deck, setDeck] = useState<any[]>([]);
  const [discardPile, setDiscardPile] = useState<any[]>([]);

  useEffect(() => {
    console.log("Initializing game with player:", initialPlayerName);
    const newDeck = createDeck();
    setDeck(newDeck);

    setPlayers([
      {
        id: "1",
        name: initialPlayerName,
        isAI: false,
        score: 0,
        totalScore: 0,
        grid: Array(12).fill(null)
      },
      {
        id: "2",
        name: "AI",
        isAI: true,
        score: 0,
        totalScore: 0,
        grid: Array(12).fill(null)
      }
    ]);
  }, [initialPlayerName]);

  const handleNewGame = () => {
    const newDeck = createDeck();
    setDeck(newDeck);
    setDiscardPile([]);

    setPlayers(prevPlayers => prevPlayers.map(player => ({
      ...player,
      score: 0,
      totalScore: 0,
      grid: Array(12).fill(null)
    })));
    
    setGamePhase("selectInitialCards");
    setSelectedInitialCards(0);
  };

  const currentPlayer = players[0] || {
    id: "1",
    name: initialPlayerName,
    isAI: false,
    score: 0,
    totalScore: 0,
    grid: Array(12).fill(null)
  };

  const gameState = {
    players,
    currentPlayerIndex: 0,
    deck,
    discardPile,
    gamePhase,
    selectedCard: null,
    roundWinner: null,
    selectedInitialCards
  };

  console.log("Current game state:", gameState);

  return (
    <div className="min-h-screen bg-game-background p-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <InitialPhase
          gamePhase={gamePhase}
          currentPlayer={currentPlayer}
          selectedInitialCards={selectedInitialCards}
          playerName={currentPlayer.name}
          onPlayerNameSubmit={() => {}}
        />
        <div className="grid gap-8">
          <PlayerSection
            players={players}
            currentPlayerIndex={0}
            gamePhase={gamePhase}
            onCardClick={() => {}}
          />
        </div>
        <GameControlSection
          gameState={gameState}
          onDrawFromDeck={() => {}}
          onDrawFromDiscard={() => {}}
          onNewGame={handleNewGame}
          onContinueGame={() => {}}
        />
      </div>
    </div>
  );
};

export default GameBoard;