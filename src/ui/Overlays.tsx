import { useEffect, useState } from "react";
import { GameState } from "@/game/types";
import { gridScore, lowestTotalIndex } from "@/game/engine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CLEAR_ANIMATION_MS } from "./theme";
import { Confetti } from "./Confetti";

/** Online context for the end-of-round / end-of-game panels. */
export interface OnlineOverlayProps {
  mySeat: number;
  /** abandon / claim / score verdict, if any. */
  result: { winner: number; reason: "abandon" | "claim" | "score" } | null;
  nextReady: { me: boolean; them: boolean };
  /** Rematch advertised by the opponent, joinable now. */
  rematchOffered: boolean;
  /** I already created the rematch and am waiting for them. */
  rematchRequested: boolean;
  onRematch: () => void;
  onJoinRematch: () => void;
}

interface OverlayProps {
  game: GameState;
  onNextRound: () => void;
  onNewGame: () => void;
  onHome: () => void;
  online?: OnlineOverlayProps;
}

const ScoreTable = ({ game }: { game: GameState }) => {
  const rounds = game.players[0].roundScores.length;
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/10 text-white/70">
            <th className="px-3 py-2 text-left font-medium">Manche</th>
            {game.players.map((p) => (
              <th key={p.id} className="px-3 py-2 text-right font-medium">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, r) => (
            <tr key={r} className="odd:bg-white/[0.03]">
              <td className="px-3 py-1.5 text-white/70">{r + 1}</td>
              {game.players.map((p) => (
                <td key={p.id} className="px-3 py-1.5 text-right tabular-nums">
                  {p.roundScores[r]}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-white/15 bg-white/[0.06] font-bold">
            <td className="px-3 py-2">Total</td>
            {game.players.map((p) => (
              <td key={p.id} className="px-3 py-2 text-right tabular-nums">
                {p.totalScore}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const Overlays = ({
  game,
  onNextRound,
  onNewGame,
  onHome,
  online,
}: OverlayProps) => {
  // An abandon/claim verdict ends the game whatever the board phase was.
  const verdict =
    online?.result && online.result.reason !== "score" ? online.result : null;
  const over =
    game.phase === "roundOver" || game.phase === "gameOver" || !!verdict;
  // Hold the panel back for a beat so the final reveal (and any column swept
  // away by it) is actually seen on the board before the scores slide in.
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!over) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), CLEAR_ANIMATION_MS + 300);
    return () => clearTimeout(t);
  }, [over]);

  if (!over || !show) return null;

  const isGameOver = game.phase === "gameOver" || !!verdict;
  const duo = game.mode === "duo";
  const isOnline = game.mode === "online" && !!online;
  const winner = verdict ? verdict.winner : lowestTotalIndex(game.players);
  const humanWon = winner === 0;
  const iWon = isOnline && winner === online.mySeat;
  const tie =
    !verdict &&
    game.players.length === 2 &&
    game.players[0].totalScore === game.players[1].totalScore;
  const closer = game.closedBy ?? 0;
  // Derived from state, not from events: a restored game has its events
  // stripped (they already played their side effects), but the doubled round
  // score is visible as a mismatch with the closer's still-revealed grid.
  const penalized =
    game.players[closer].lastRoundScore !== gridScore(game.players[closer].grid);

  // Celebrate a human winner: the human in solo, me online, always in duo.
  const celebrate = isGameOver && (isOnline ? iWon : duo ? !tie : humanWon);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center">
      <Confetti run={celebrate} />
      <div className="animate-float-up w-full max-w-md rounded-2xl bg-slate-900 p-5 text-white shadow-2xl ring-1 ring-white/10">
        <div className="mb-3 text-center">
          {isGameOver ? (
            isOnline ? (
              <>
                <div className="text-4xl">
                  {tie ? "🤝" : iWon ? "🏆" : "😔"}
                </div>
                <h2 className="mt-1 text-2xl font-extrabold">
                  {tie
                    ? "Égalité !"
                    : iWon
                      ? "Vous gagnez !"
                      : `${game.players[winner]?.name ?? "L'adversaire"} gagne`}
                </h2>
                <p className="text-white/70">
                  {verdict?.reason === "abandon"
                    ? verdict.winner === online.mySeat
                      ? `${game.players[1 - online.mySeat].name} a abandonné la partie.`
                      : "Vous avez abandonné la partie."
                    : verdict?.reason === "claim"
                      ? verdict.winner === online.mySeat
                        ? "Victoire réclamée : votre adversaire a quitté la partie."
                        : "La victoire a été réclamée pendant votre absence."
                      : tie
                        ? "Les deux totaux sont à égalité."
                        : "Le plus petit total l'emporte."}
                </p>
              </>
            ) : duo ? (
              <>
                <div className="text-4xl">{tie ? "🤝" : "🏆"}</div>
                <h2 className="mt-1 text-2xl font-extrabold">
                  {tie ? "Égalité !" : `${game.players[winner].name} gagne !`}
                </h2>
                <p className="text-white/70">
                  {tie
                    ? "Les deux totaux sont à égalité."
                    : "Le plus petit total l'emporte. Bien joué !"}
                </p>
              </>
            ) : (
              <>
                <div className="text-4xl">{humanWon ? "🏆" : "🤖"}</div>
                <h2 className="mt-1 text-2xl font-extrabold">
                  {humanWon ? "Vous gagnez !" : "L'ordinateur gagne"}
                </h2>
                <p className="text-white/70">
                  {humanWon
                    ? "Le plus petit total l'emporte. Bien joué !"
                    : "Ce sera pour la prochaine fois."}
                </p>
              </>
            )
          ) : (
            <>
              <h2 className="text-2xl font-extrabold">Fin de la manche</h2>
              <p className="text-white/70">
                {game.players[closer].name} a bouclé sa grille
                {penalized ? " — score doublé !" : "."}
              </p>
            </>
          )}
        </div>

        <ScoreTable game={game} />

        <div
          className={cn(
            "mt-4 flex gap-2",
            isGameOver ? "flex-col" : "flex-col sm:flex-row"
          )}
        >
          {isGameOver ? (
            <>
              {isOnline ? (
                online.rematchOffered ? (
                  <Button
                    onClick={online.onJoinRematch}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    Rejoindre la revanche
                  </Button>
                ) : online.rematchRequested ? (
                  <Button disabled className="w-full" variant="secondary">
                    Revanche proposée — en attente…
                  </Button>
                ) : (
                  <Button
                    onClick={online.onRematch}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    Proposer une revanche
                  </Button>
                )
              ) : (
                <Button
                  onClick={onNewGame}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  Rejouer
                </Button>
              )}
              <Button variant="secondary" onClick={onHome} className="w-full">
                Menu principal
              </Button>
            </>
          ) : isOnline && online.nextReady.me ? (
            <Button disabled className="w-full" variant="secondary">
              En attente de {game.players[1 - online.mySeat].name}…
            </Button>
          ) : (
            <Button
              onClick={onNextRound}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              Manche suivante
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
