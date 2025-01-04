import { useState, useEffect } from "react";
import { Player } from "@/lib/types";
import { PlayerSection } from "./game/PlayerSection";
import { GameControlSection } from "./game/GameControlSection";
import { InitialPhase } from "./game/InitialPhase";
import { createDeck, dealInitialCards } from "@/lib/gameLogic";

interface GameBoardProps {
  initialPlayerName: string;
}

export const GameBoard = ({ initialPlayerName }: GameBoardProps) => {
  const [gamePhase, setGamePhase] = useState<string>("selectInitialCards");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedInitialCards, setSelectedInitialCards] = useState(0);

  useEffect(() => {
    const deck = createDeck();
    const humanPlayerInitialCards = dealInitialCards(deck, 12);
    const aiPlayerInitialCards = dealInitialCards(deck, 12);

    setPlayers([
      {
        name: initialPlayerName,
        isAI: false,
        cards: humanPlayerInitialCards,
        score: 0,
        roundScore: 0
      },
      {
        name: "AI",
        isAI: true,
        cards: aiPlayerInitialCards,
        score: 0,
        roundScore: 0
      }
    ]);
  }, [initialPlayerName]);

  const handleNewGame = () => {
    const deck = createDeck();
    const humanPlayerInitialCards = dealInitialCards(deck, 12);
    const aiPlayerInitialCards = dealInitialCards(deck, 12);

    setPlayers([
      {
        ...players[0],
        cards: humanPlayerInitialCards,
        score: 0,
        roundScore: 0
      },
      {
        ...players[1],
        cards: aiPlayerInitialCards,
        score: 0,
        roundScore: 0
      }
    ]);
    setGamePhase("selectInitialCards");
    setSelectedInitialCards(0);
  };

  const currentPlayer = players[0] || { name: "Joueur", isAI: false, cards: [], score: 0, roundScore: 0 };

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
          {players.map((player, index) => (
            <PlayerSection
              key={index}
              player={player}
              gamePhase={gamePhase}
              onCardFlip={() => {}}
              isCurrentPlayer={index === 0}
            />
          ))}
        </div>
        <GameControlSection
          gamePhase={gamePhase}
          onNewGame={handleNewGame}
          currentPlayer={currentPlayer}
        />
      </div>
    </div>
  );
};