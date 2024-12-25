import { Card as CardType, Player } from "@/lib/types";

interface InitialCardsSelectionProps {
  currentPlayer: Player;
  selectedInitialCards: number;
}

export const InitialCardsSelection = ({ currentPlayer, selectedInitialCards }: InitialCardsSelectionProps) => {
  return (
    <div className="text-center text-lg text-game-primary mb-4">
      {`${currentPlayer.name}, sélectionnez ${2 - selectedInitialCards} carte${selectedInitialCards === 1 ? '' : 's'}`}
    </div>
  );
};