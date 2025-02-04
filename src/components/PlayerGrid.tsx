import { Card } from "./Card";
import { Card as CardType, Player } from "@/lib/types";

interface PlayerGridProps {
  player: Player;
  onCardClick: (card: CardType) => void;
  disabled?: boolean;
  isMobile?: boolean;
}

export const PlayerGrid = ({ player, onCardClick, disabled, isMobile }: PlayerGridProps) => {
  return (
    <div className="space-y-1 md:space-y-2">
      <h2 className="text-lg md:text-xl font-semibold text-game-primary">
        Grille de {player.name}
      </h2>
      <div className={`grid grid-cols-4 gap-0.5 md:gap-1`}>
        {player.grid.map((card, index) => (
          <div key={index} className="min-h-[50px]">
            {card && (
              <Card
                card={card}
                onClick={() => onCardClick(card)}
                disabled={disabled}
                className={isMobile ? 'scale-90 origin-top-left' : ''}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};