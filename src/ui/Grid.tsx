import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Card, Grid as GridCards, PlayerState } from "@/game/types";
import { visibleScore } from "@/game/engine";
import { cn } from "@/lib/utils";
import { CLEAR_ANIMATION_MS } from "./theme";
import { PlayingCard } from "./PlayingCard";

/**
 * When a column is cleared the engine nulls the slots instantly; keeping the
 * just-removed cards around as short-lived "ghosts" lets them play the
 * clear-out animation instead of vanishing abruptly.
 */
const useClearGhosts = (playerId: string, grid: GridCards) => {
  const prev = useRef<{ playerId: string; grid: GridCards } | null>(null);
  const [ghosts, setGhosts] = useState<Record<number, Card>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Layout effect: the ghost must be in place before the browser paints the
  // post-clear frame, or the empty slot flashes for one frame first.
  useLayoutEffect(() => {
    const last = prev.current;
    prev.current = { playerId, grid };
    // In duo pass-the-phone the same Grid slot swaps players; only diff grids
    // belonging to the same player, and never let a departing player's ghosts
    // linger into the incoming player's board.
    if (!last || last.playerId !== playerId) {
      setGhosts((g) => (Object.keys(g).length ? {} : g));
      return;
    }
    const cleared: Record<number, Card> = {};
    grid.forEach((c, i) => {
      const old = last.grid[i];
      if (c === null && old) cleared[i] = old;
    });
    if (Object.keys(cleared).length === 0) return;
    setGhosts((g) => ({ ...g, ...cleared }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setGhosts({}), CLEAR_ANIMATION_MS);
  }, [playerId, grid]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return ghosts;
};

interface GridProps {
  player: PlayerState;
  onCardClick?: (index: number) => void;
  selectableIndex?: (index: number) => boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  dealKey?: number; // change to retrigger the deal-in animation
}

export const Grid = ({
  player,
  onCardClick,
  selectableIndex,
  disabled,
  size = "md",
  active,
  dealKey = 0,
}: GridProps) => {
  const ghosts = useClearGhosts(player.id, player.grid);
  return (
    <div
      className={cn(
        "rounded-2xl p-2.5 transition-all",
        active
          ? "bg-white/10 ring-2 ring-amber-300/70 shadow-[0_0_24px_-6px_rgba(251,191,36,0.5)]"
          : "bg-white/5 ring-1 ring-white/10"
      )}
    >
      <div className="grid grid-cols-4 gap-1.5 place-items-center">
        {player.grid.map((card, index) =>
          card === null && ghosts[index] ? (
            <PlayingCard
              key={`${dealKey}-${index}-ghost`}
              card={{ ...ghosts[index], faceUp: true }}
              size={size}
              clearing
            />
          ) : (
            <PlayingCard
              key={`${dealKey}-${index}`}
              card={card}
              size={size}
              dealDelay={card ? index * 35 : undefined}
              selectable={selectableIndex?.(index) ?? false}
              disabled={disabled}
              onClick={
                onCardClick && !disabled ? () => onCardClick(index) : undefined
              }
            />
          )
        )}
      </div>
    </div>
  );
};

interface PlayerBadgeProps {
  player: PlayerState;
  active: boolean;
  finalTurn?: boolean;
  live?: boolean; // show live visible-card sum instead of total
}

export const PlayerBadge = ({
  player,
  active,
  finalTurn,
  live,
}: PlayerBadgeProps) => (
  <div
    className={cn(
      "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-amber-300 text-slate-900" : "bg-white/10 text-white/90"
    )}
  >
    <span
      className={cn(
        "grid h-6 w-6 place-items-center rounded-full text-xs font-bold",
        player.isAI ? "bg-fuchsia-500/80" : "bg-sky-500/80",
        active && "bg-slate-900/80 text-white"
      )}
      aria-hidden
    >
      {player.isAI ? "IA" : (player.name[0] || "V").toUpperCase()}
    </span>
    <span className="max-w-[7rem] truncate">{player.name}</span>
    <span className="ml-1 rounded-full bg-black/20 px-2 py-0.5 tabular-nums">
      {live ? visibleScore(player.grid) : player.totalScore}
    </span>
    {finalTurn && (
      <span className="ml-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
        Dernier tour
      </span>
    )}
  </div>
);
