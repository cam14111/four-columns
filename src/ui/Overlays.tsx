import { useEffect, useState } from "react";
import { GameState } from "@/game/types";
import { gridScore, isActive, lowestTotalIndex } from "@/game/engine";
import type { OnlinePlayerMeta } from "@/online/client";
import type { GameResult } from "@/online/protocol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CLEAR_ANIMATION_MS, GRID_DIMS } from "./theme";
import { Confetti } from "./Confetti";
import { Grid } from "./Grid";
import { ScaledBox } from "./ScaledBox";

/** Online context for the end-of-round / end-of-game panels. */
export interface OnlineOverlayProps {
  mySeat: number;
  /** abandon / claim / score / forfeit verdict, if any. */
  result: GameResult | null;
  /** One entry per seat (presence, ready flags, exclusion rights). */
  players: OnlinePlayerMeta[];
  /** I already pressed "next round". */
  myNextReady: boolean;
  /** Two-player: opponent away long enough to claim the win. */
  canClaimVictory: boolean;
  onClaim: () => void;
  /** 3+ players: exclude an absent player who blocks the handshake. */
  onExclude: (seat: number) => void;
  /** Leave without abandoning — the game stays resumable from Home. */
  onLeave: () => void;
  /** Rematch advertised by another player, joinable now. */
  rematchOffered: boolean;
  /** I already created the rematch and am waiting for the others. */
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

/**
 * Fits `cols` side-by-side boards in the panel whatever the phone width (the
 * panel is centred at max-w-md; padding and the gaps eat ~90px), capped at a
 * comfortable reading size. Computed in JS because CSS `scale()` needs a
 * plain number — a calc() of viewport lengths cannot become one.
 */
const useBoardScale = (cols: number): number => {
  const compute = () =>
    Math.min(
      0.64,
      (Math.min(window.innerWidth, 448) - 90) / (cols * GRID_DIMS.sm.w)
    );
  const [scale, setScale] = useState(compute);
  useEffect(() => {
    const onResize = () => setScale(compute());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols]);
  return scale;
};

/**
 * Every board in miniature, cards face-up (the engine reveals them when the
 * round is scored) — so the end-of-round panel shows *why* the scores are
 * what they are, without having to peek behind the blurred backdrop. Players
 * who left the game keep their tile, dimmed, so the table stays readable.
 */
const BoardsRecap = ({ game }: { game: GameState }) => {
  const n = game.players.length;
  const cols = n <= 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : 3;
  const scale = useBoardScale(cols);
  return (
    <div className="mb-3 flex flex-wrap items-start justify-center gap-3">
      {game.players.map((p) => (
        <div
          key={p.id}
          className={cn(
            "flex min-w-0 flex-col items-center gap-1",
            p.out && "opacity-45"
          )}
        >
          <span className="max-w-[10rem] truncate text-xs font-semibold text-white/80">
            {p.name}
            {p.out ? " · parti·e" : ""}
          </span>
          <ScaledBox
            width={GRID_DIMS.sm.w}
            height={GRID_DIMS.sm.h}
            scale={String(scale)}
          >
            <Grid player={p} size="sm" />
          </ScaledBox>
        </div>
      ))}
    </div>
  );
};

const ScoreTable = ({ game }: { game: GameState }) => {
  const rounds = game.players[0].roundScores.length;
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/10 text-white/70">
            <th className="px-3 py-2 text-left font-medium">Manche</th>
            {game.players.map((p) => (
              <th key={p.id} className="px-3 py-2 text-right font-medium">
                <span
                  className={cn(
                    "inline-block max-w-[5.5rem] truncate align-bottom",
                    p.out && "text-white/40 line-through"
                  )}
                >
                  {p.name}
                </span>
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
  // An abandon/claim/forfeit verdict ends the game whatever the phase was.
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
  const activePlayers = game.players.filter(isActive);
  const tie =
    !verdict &&
    (isOnline || duo
      ? activePlayers.length > 1 &&
        winner >= 0 &&
        activePlayers.filter(
          (p) => p.totalScore === game.players[winner].totalScore
        ).length > 1
      : false);
  const closer = game.closedBy ?? 0;
  // Derived from state, not from events: a restored game has its events
  // stripped (they already played their side effects), but the doubled round
  // score is visible as a mismatch with the closer's still-revealed grid.
  const penalized =
    isActive(game.players[closer]) &&
    game.players[closer].lastRoundScore !== gridScore(game.players[closer].grid);

  // Celebrate a human winner: the human in solo, me online, always in duo.
  const celebrate = isGameOver && !tie && (isOnline ? iWon : duo ? true : humanWon);

  const winnerName = game.players[winner]?.name ?? "";

  // Online, between rounds: who has not pressed "next round" yet.
  const waitingOn = isOnline
    ? online.players.filter((p) => p && !p.out && !p.ready && !p.isMe)
    : [];
  const excludable = waitingOn.filter((p) => p.canExclude);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center">
      <Confetti run={celebrate} />
      <div className="animate-float-up max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-slate-900 p-5 text-white shadow-2xl ring-1 ring-white/10">
        <div className="mb-3 text-center">
          {isGameOver ? (
            isOnline ? (
              <>
                <div className="text-4xl">
                  {tie || winner < 0 ? "🤝" : iWon ? "🏆" : "😔"}
                </div>
                <h2 className="mt-1 text-2xl font-extrabold">
                  {tie || winner < 0
                    ? "Égalité !"
                    : iWon
                      ? "Vous gagnez !"
                      : `${winnerName || "Un joueur"} gagne`}
                </h2>
                <p className="text-white/70">
                  {verdict?.reason === "abandon"
                    ? verdict.winner === online.mySeat
                      ? "Votre adversaire a abandonné la partie."
                      : "Vous avez abandonné la partie."
                    : verdict?.reason === "claim"
                      ? verdict.winner === online.mySeat
                        ? "Victoire réclamée : votre adversaire a quitté la partie."
                        : "La victoire a été réclamée pendant votre absence."
                      : verdict?.reason === "forfeit"
                        ? verdict.winner === online.mySeat
                          ? "Tous les autres joueurs ont quitté la partie."
                          : "Vous avez quitté la partie."
                        : tie || winner < 0
                          ? "Les totaux sont à égalité."
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

        <BoardsRecap game={game} />
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
          ) : isOnline && online.myNextReady ? (
            <Button disabled className="w-full" variant="secondary">
              {waitingOn.length === 0
                ? "Lancement de la manche…"
                : waitingOn.length === 1
                  ? `En attente de ${waitingOn[0].name}…`
                  : `En attente de ${waitingOn.map((p) => p.name).join(", ")}…`}
            </Button>
          ) : (
            <Button
              onClick={onNextRound}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              Manche suivante
            </Button>
          )}

          {/* The panel covers the whole screen, so the between-rounds wait
              must offer its own exits: absent players may never come back. */}
          {isOnline && !isGameOver && (
            <>
              {waitingOn.some((p) => !p.online) && (
                <p className="text-center text-xs text-white/60">
                  {waitingOn
                    .filter((p) => !p.online)
                    .map((p) => p.name)
                    .join(", ")}{" "}
                  {waitingOn.filter((p) => !p.online).length > 1
                    ? "sont déconnectés"
                    : "est déconnecté·e"}{" "}
                  — la partie reprendra à leur retour.
                </p>
              )}
              {online.canClaimVictory && (
                <Button
                  onClick={online.onClaim}
                  className="w-full bg-amber-300 font-bold text-slate-900 hover:bg-amber-200"
                >
                  Réclamer la victoire
                </Button>
              )}
              {excludable.map((p) => (
                <Button
                  key={p.seat}
                  onClick={() => online.onExclude(p.seat)}
                  className="w-full bg-amber-300 font-bold text-slate-900 hover:bg-amber-200"
                >
                  Continuer sans {p.name}
                </Button>
              ))}
              <Button
                variant="ghost"
                onClick={online.onLeave}
                className="w-full text-white/60 hover:text-white"
              >
                Quitter (partie conservée)
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
