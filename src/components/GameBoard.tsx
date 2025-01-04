import React, { useEffect } from "react";
import { useGameState } from "@/hooks/use-game-state";
import { GameActions } from "@/components/GameActions";
import { useCardClickHandler } from "@/components/CardClickHandler";
import { PlayerGrid } from "./PlayerGrid";
import { GameControls } from "./GameControls";
import { ScoreDisplay } from "./ScoreDisplay";
import { DiscardPile } from "./DiscardPile";
import { TurnPhase } from "./TurnPhase";
import { InitialCardsSelection } from "./InitialCardsSelection";
import { PlayerNameForm } from "./PlayerNameForm";
import { saveGameScore } from "@/lib/scoreService";
import { useToast } from "@/hooks/use-toast";
import { createDeck, dealInitialCards } from "@/lib/gameLogic";
import { supabase } from "@/integrations/supabase/client";
import { Player } from "@/lib/types";

export const GameBoard = () => {
  const { gameState, setGameState } = useGameState();
  const { handleCardClick } = useCardClickHandler({ gameState, setGameState });
  const { 
    handleKeepCard, 
    handleDiscardCard, 
    handleDrawFromDeck, 
    handleDrawFromDiscard 
  } = GameActions({ gameState, setGameState });
  const { toast } = useToast();

  const handlePlayerNameSubmit = (name: string) => {
    setGameState(prev => ({
      ...prev,
      players: [
        { ...prev.players[0], name },
        prev.players[1]
      ]
    }));
  };

  const handleNewGame = () => {
    const deck = createDeck();
    const { playerGrid: humanGrid, remainingDeck: deck1 } = dealInitialCards(deck);
    const { playerGrid: aiGrid, remainingDeck: deck2 } = dealInitialCards(deck1);
    
    const firstDiscardCard = { ...deck2[0], state: "visible" as const };
    const remainingDeck = deck2.slice(1);
    
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(player => ({
        ...player,
        score: 0,
        totalScore: 0,
        grid: player.isAI ? aiGrid : humanGrid,
      })),
      currentPlayerIndex: 0,
      deck: remainingDeck,
      discardPile: [firstDiscardCard],
      gamePhase: "selectInitialCards",
      selectedCard: null,
      roundWinner: null,
      selectedInitialCards: 0
    }));
  };

  const handleContinueGame = () => {
    const deck = createDeck();
    const { playerGrid: humanGrid, remainingDeck: deck1 } = dealInitialCards(deck);
    const { playerGrid: aiGrid, remainingDeck: deck2 } = dealInitialCards(deck1);
    
    const firstDiscardCard = { ...deck2[0], state: "visible" as const };
    const remainingDeck = deck2.slice(1);
    
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(player => ({
        ...player,
        score: 0,
        grid: player.isAI ? aiGrid : humanGrid,
      })),
      currentPlayerIndex: 0,
      deck: remainingDeck,
      discardPile: [firstDiscardCard],
      gamePhase: "selectInitialCards",
      selectedCard: null,
      roundWinner: null,
      selectedInitialCards: 0
    }));
  };

  const calculateVisibleCardsSum = (player: Player) => {
    return player.grid
      .filter(card => card && card.state === "visible")
      .reduce((sum, card) => sum + (card?.value || 0), 0);
  };

  const handleGameEnd = async () => {
    // Calculer les scores finaux pour tous les joueurs
    const updatedPlayers = gameState.players.map(player => ({
      ...player,
      score: calculateVisibleCardsSum(player)
    }));

    // Déterminer le vainqueur de la manche
    const minScore = Math.min(...updatedPlayers.map(p => p.score));
    const winners = updatedPlayers.filter(p => p.score === minScore);

    // Mettre à jour le state avec les scores finaux
    setGameState(prev => ({
      ...prev,
      players: updatedPlayers,
      roundWinner: winners[0]
    }));

    // Sauvegarder les scores dans la base de données
    const roundNumber = (await supabase
      .from('round_history')
      .select('round_number')
      .order('round_number', { ascending: false })
      .limit(1)
      .single()
    ).data?.round_number || 0;

    const currentRoundNumber = roundNumber + 1;

    // Sauvegarder les scores de la manche pour chaque joueur
    for (const player of updatedPlayers) {
      try {
        await supabase.from('round_history').insert({
          player_name: player.name,
          round_number: currentRoundNumber,
          round_score: player.score
        });

        await saveGameScore(
          player.name,
          player.score,
          player.totalScore + player.score
        );
      } catch (error) {
        console.error('Error saving scores:', error);
        toast({
          title: "Erreur",
          description: "Impossible de sauvegarder les scores",
          variant: "destructive",
        });
        return;
      }
    }

    toast({
      title: "Partie terminée !",
      description: `${winners.map(w => w.name).join(" et ")} ${winners.length > 1 ? 'remportent' : 'remporte'} la manche avec ${minScore} points !`,
    });
  };

  const checkAllCardsRevealed = (playerIndex: number) => {
    const player = gameState.players[playerIndex];
    return player.grid.every(card => card === null || card.state === "visible");
  };

  useEffect(() => {
    const currentPlayerAllRevealed = checkAllCardsRevealed(gameState.currentPlayerIndex);
    
    if (currentPlayerAllRevealed && gameState.gamePhase !== "roundEnd" && gameState.gamePhase !== "gameEnd") {
      // Révéler toutes les cartes des deux joueurs
      setGameState(prev => {
        const updatedPlayers = prev.players.map(player => ({
          ...player,
          grid: player.grid.map(card => 
            card ? { ...card, state: "visible" as const } : null
          )
        }));
        
        return {
          ...prev,
          players: updatedPlayers,
          gamePhase: "roundEnd"
        };
      });
    }
  }, [gameState.players, gameState.currentPlayerIndex, gameState.gamePhase]);

  useEffect(() => {
    if (gameState.gamePhase === "gameEnd" && gameState.players[0].name !== "Joueur") {
      handleGameEnd();
    }
  }, [gameState.gamePhase]);

  if (gameState.players[0].name === "Joueur") {
    return <PlayerNameForm onSubmit={handlePlayerNameSubmit} />;
  }

  return (
    <div className="min-h-screen bg-game-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-center text-game-primary">Skyjo</h1>
        
        {gameState.gamePhase === "selectInitialCards" && !gameState.players[gameState.currentPlayerIndex].isAI && (
          <InitialCardsSelection 
            currentPlayer={gameState.players[gameState.currentPlayerIndex]}
            selectedInitialCards={gameState.selectedInitialCards}
          />
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">
            {gameState.players.map((player, index) => (
              <PlayerGrid
                key={player.id}
                player={player}
                onCardClick={handleCardClick}
                disabled={
                  (index !== gameState.currentPlayerIndex || 
                  player.isAI ||
                  (gameState.gamePhase === "action" && !gameState.selectedCard) ||
                  ["roundEnd", "gameEnd"].includes(gameState.gamePhase)) &&
                  gameState.gamePhase !== "selectInitialCards"
                }
              />
            ))}
          </div>
          
          <div className="space-y-8">
            <div className="flex gap-4 items-start">
              <GameControls
                gameState={gameState}
                onDrawFromDeck={handleDrawFromDeck}
                disabled={
                  gameState.players[gameState.currentPlayerIndex].isAI ||
                  gameState.gamePhase === "selectInitialCards" ||
                  ["roundEnd", "gameEnd"].includes(gameState.gamePhase)
                }
              />
              <DiscardPile 
                discardPile={gameState.discardPile}
                onDrawFromDiscard={handleDrawFromDiscard}
                disabled={
                  gameState.players[gameState.currentPlayerIndex].isAI ||
                  gameState.gamePhase !== "draw" ||
                  ["roundEnd", "gameEnd"].includes(gameState.gamePhase)
                }
              />
            </div>
            <ScoreDisplay 
              players={gameState.players} 
              onNewGame={handleNewGame}
              onContinueGame={handleContinueGame}
            />
          </div>
        </div>

        <TurnPhase
          gamePhase={gameState.gamePhase}
          selectedCard={gameState.selectedCard}
          onKeepCard={handleKeepCard}
          onDiscardCard={handleDiscardCard}
          isCurrentPlayerAI={gameState.players[gameState.currentPlayerIndex].isAI}
        />
      </div>
    </div>
  );
};