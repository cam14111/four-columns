import { useState } from "react";
import { GameBoard } from "@/components/GameBoard";
import { PlayerNameForm } from "@/components/PlayerNameForm";

const Index = () => {
  const [authorizedPlayer, setAuthorizedPlayer] = useState<string | null>(null);

  const handlePlayerAuthorized = (playerName: string) => {
    console.log("Player authorized:", playerName);
    setAuthorizedPlayer(playerName);
  };

  if (!authorizedPlayer) {
    return (
      <div className="min-h-screen bg-game-background p-4">
        <PlayerNameForm onSubmit={handlePlayerAuthorized} />
      </div>
    );
  }

  return <GameBoard initialPlayerName={authorizedPlayer} />;
};

export default Index;