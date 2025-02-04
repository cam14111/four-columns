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
    <div className="space-y-2 md:space-y-4">
      <h2 className="text-lg md:text-xl font-semibold text-game-primary">
        Grille de {player.name}
      </h2>
      <div className={`grid grid-cols-4 ${isMobile ? 'gap-2' : 'gap-4'}`}>
        {player.grid.map((card, index) => (
          <div key={index} className={`${isMobile ? 'min-h-[80px]' : 'min-h-[100px]'}`}>
            {card && (
              <Card
                card={card}
                onClick={() => onCardClick(card)}
                disabled={disabled}
                className={isMobile ? 'scale-75 origin-top-left' : ''}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};