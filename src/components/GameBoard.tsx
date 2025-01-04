import { useState, useEffect } from "react";
import { Player, GamePhase, GameState } from "@/lib/types";
import { PlayerSection } from "./game/PlayerSection";
import { GameControlSection } from "./game/GameControlSection";
import { InitialPhase } from "./game/InitialPhase";
import { createDeck, dealInitialCards } from "@/lib/gameLogic";
import { useCardClickHandler } from "./CardClickHandler";
import { selectInitialCardsForAI } from "@/lib/aiLogic";
import { useToast } from "@/hooks/use-toast";
import { GameActions } from "./GameActions";

interface GameBoardProps {
  initialPlayerName: string;
}

export const GameBoard = ({ initialPlayerName }: GameBoardProps) => {
  const [gamePhase, setGamePhase] = useState<GamePhase>("selectInitialCards");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedInitialCards, setSelectedInitialCards] = useState(0);
  const [deck, setDeck] = useState<any[]>([]);
  const [discardPile, setDiscardPile] = useState<any[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    console.log("Initializing game with player:", initialPlayerName);
    const newDeck = createDeck();
    const { playerGrid: humanGrid, remainingDeck: deck1 } = dealInitialCards(newDeck);
    const { playerGrid: aiGrid, remainingDeck: deck2 } = dealInitialCards(deck1);

    // Prendre la première carte du deck pour la défausse et la retourner face visible
    const firstDiscardCard = { ...deck2[0], state: "visible" as const };
    const remainingDeck = deck2.slice(1);

    setDeck(remainingDeck);
    setDiscardPile([firstDiscardCard]);

    setPlayers([
      {
        id: "1",
        name: initialPlayerName,
        isAI: false,
        score: 0,
        totalScore: 0,
        grid: humanGrid,
        initialCardsSum: 0
      },
      {
        id: "2",
        name: "AI",
        isAI: true,
        score: 0,
        totalScore: 0,
        grid: aiGrid,
        initialCardsSum: 0
      }
    ]);
  }, [initialPlayerName]);

  useEffect(() => {
    const currentPlayer = players[currentPlayerIndex];
    
    if (currentPlayer?.isAI && gamePhase === "selectInitialCards") {
      setTimeout(() => {
        const { newGrid, initialCardsSum } = selectInitialCardsForAI(currentPlayer);
        
        setPlayers(prevPlayers => {
          const newPlayers = [...prevPlayers];
          newPlayers[currentPlayerIndex] = {
            ...currentPlayer,
            grid: newGrid,
            initialCardsSum
          };

          // Vérifier si les deux joueurs ont sélectionné leurs cartes
          const allPlayersSelected = newPlayers.every(p => p.initialCardsSum > 0);
          
          if (allPlayersSelected) {
            // Déterminer le premier joueur en fonction de la plus grande somme
            const firstPlayerIndex = newPlayers[0].initialCardsSum > newPlayers[1].initialCardsSum ? 0 : 1;
            setCurrentPlayerIndex(firstPlayerIndex);
            setGamePhase("draw");
            
            toast({
              title: "Premier joueur déterminé !",
              description: `${newPlayers[firstPlayerIndex].name} commence avec la plus grande somme (${newPlayers[firstPlayerIndex].initialCardsSum}).`
            });
          }
          
          return newPlayers;
        });
        
        setSelectedInitialCards(0);
      }, 1000);
    }
  }, [currentPlayerIndex, gamePhase, players, toast]);

  const gameState: GameState = {
    players,
    currentPlayerIndex,
    deck,
    discardPile,
    gamePhase,
    selectedCard: null,
    roundWinner: null,
    selectedInitialCards
  };

  const { handleCardClick } = useCardClickHandler({
    gameState,
    setGameState: (newState) => {
      if (typeof newState === 'function') {
        const updatedState = newState(gameState);
        setPlayers(updatedState.players);
        setCurrentPlayerIndex(updatedState.currentPlayerIndex);
        setDeck(updatedState.deck);
        setDiscardPile(updatedState.discardPile);
        setGamePhase(updatedState.gamePhase);
        setSelectedInitialCards(updatedState.selectedInitialCards);
      } else {
        setPlayers(newState.players);
        setCurrentPlayerIndex(newState.currentPlayerIndex);
        setDeck(newState.deck);
        setDiscardPile(newState.discardPile);
        setGamePhase(newState.gamePhase);
        setSelectedInitialCards(newState.selectedInitialCards);
      }
    }
  });

  const { handleDrawFromDeck, handleDrawFromDiscard } = GameActions({ 
    gameState, 
    setGameState: (newState) => {
      if (typeof newState === 'function') {
        const updatedState = newState(gameState);
        setPlayers(updatedState.players);
        setCurrentPlayerIndex(updatedState.currentPlayerIndex);
        setDeck(updatedState.deck);
        setDiscardPile(updatedState.discardPile);
        setGamePhase(updatedState.gamePhase);
        setSelectedInitialCards(updatedState.selectedInitialCards);
      } else {
        setPlayers(newState.players);
        setCurrentPlayerIndex(newState.currentPlayerIndex);
        setDeck(newState.deck);
        setDiscardPile(newState.discardPile);
        setGamePhase(newState.gamePhase);
        setSelectedInitialCards(newState.selectedInitialCards);
      }
    }
  });

  const handleNewGame = () => {
    const newDeck = createDeck();
    const { playerGrid: humanGrid, remainingDeck: deck1 } = dealInitialCards(newDeck);
    const { playerGrid: aiGrid, remainingDeck: finalDeck } = dealInitialCards(deck1);

    setDeck(finalDeck);
    setDiscardPile([]);
    setCurrentPlayerIndex(0);

    setPlayers(prevPlayers => prevPlayers.map((player, index) => ({
      ...player,
      score: 0,
      totalScore: 0,
      grid: index === 0 ? humanGrid : aiGrid
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

  console.log("Current game state:", gameState);

  return (
    <div className="min-h-screen bg-game-background p-4">
      <div className="max-w-7xl mx-auto">
        <InitialPhase
          gamePhase={gamePhase}
          currentPlayer={currentPlayer}
          selectedInitialCards={selectedInitialCards}
          playerName={currentPlayer.name}
          onPlayerNameSubmit={() => {}}
        />
        <div className="grid grid-cols-1 md:grid-cols-[1fr,400px] gap-8">
          <PlayerSection
            players={players}
            currentPlayerIndex={currentPlayerIndex}
            gamePhase={gamePhase}
            onCardClick={handleCardClick}
          />
          <GameControlSection
            gameState={gameState}
            onDrawFromDeck={handleDrawFromDeck}
            onDrawFromDiscard={handleDrawFromDiscard}
            onNewGame={handleNewGame}
            onContinueGame={() => {}}
          />
        </div>
      </div>
    </div>
  );
};

export default GameBoard;