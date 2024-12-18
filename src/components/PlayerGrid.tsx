import { Card } from "./Card";
import { Card as CardType, Player } from "@/lib/types";

interface PlayerGridProps {
  player: Player;
  onCardClick: (card: CardType) => void;
  disabled?: boolean;
}

export const PlayerGrid = ({ player, onCardClick, disabled }: PlayerGridProps) => {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-game-primary">{player.name}'s Grid</h2>
      <div className="grid grid-cols-4 gap-4">
        {player.grid.map((card) => (
          <Card
            key={card.id}
            card={card}
            onClick={() => onCardClick(card)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
};