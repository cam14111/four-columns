import {
  buildExpertCtx,
  estScore,
  gameEndingClose,
  expertDecide,
  expertDraw,
  expertFlip,
  expertPlace,
  expertSetup,
  gridAfterPlace,
  hiddenIndices,
  opponentShows,
  raceBonus,
  scorePlacements,
  type ExpertCtx,
} from "./ai";
import { columnIndices, countFaceUp } from "./engine";
import { Card, COLS, GameAction, GameState, Grid } from "./types";

// The coach is the learning companion of solo mode: on each of the human
// player's decisions it runs the *expert* AI evaluation on their behalf and
// explains, in one short sentence, why the recommended move is interesting —
// a completion to grab, a card not to hand the opponent, a closing risk to
// dodge. It never plays for the player and, like the AI, works only from
// public information (face-up cards, the discard history, the held card).
//
// The advice is deliberately independent from the game's difficulty setting:
// whatever level you practice against, the coach always shows the strongest
// line it can see.

export interface CoachAdvice {
  /** The move the coach would play. */
  action: GameAction;
  /** One short, plain-French sentence explaining why. */
  text: string;
  /** Grid slot the advice points at (for a subtle highlight), if any. */
  index: number | null;
}

const colName = (index: number): string => `colonne ${(index % COLS) + 1}`;

const round1 = (n: number): number => Math.round(n);

/**
 * The dominant reason a placement of `value` at `index` is good, in priority
 * order: completes a column > closes the round > builds a pair > plain swap.
 */
type PlaceReason =
  | { kind: "clear"; removed: number }
  | {
      kind: "close";
      ourFinal: number;
      winning: boolean;
      /** Closing here would decide the whole game (score limit crossed). */
      gameEnd: "win" | "lose" | null;
    }
  | { kind: "pair" }
  | { kind: "swap"; replaced: number }
  | { kind: "dig" };

const placeReason = (
  grid: Grid,
  value: number,
  index: number,
  ctx: ExpertCtx
): PlaceReason => {
  const after = gridAfterPlace(grid, value, index);
  if (after[index] === null) {
    return { kind: "clear", removed: 3 * value };
  }
  const replaced = grid[index] as Card;
  if (!replaced.faceUp && hiddenIndices(grid).length === 1) {
    const ourFinal = estScore(after); // fully revealed -> exact
    return {
      kind: "close",
      ourFinal,
      winning: ourFinal < ctx.oppEst,
      gameEnd: gameEndingClose(ourFinal, ctx),
    };
  }
  const mates = columnIndices(index % COLS)
    .filter((j) => j !== index)
    .map((j) => after[j])
    .filter((c): c is Card => c !== null && c.faceUp && c.value === value);
  if (mates.length === 1) return { kind: "pair" };
  if (replaced.faceUp) return { kind: "swap", replaced: replaced.value };
  return { kind: "dig" };
};

/** Reason text as a sentence tail (follows "Prenez le 9 : …" / "Gardez-le : …"). */
const placeTail = (
  reason: PlaceReason,
  value: number,
  index: number,
  ctx: ExpertCtx
): string => {
  switch (reason.kind) {
    case "clear":
      return `il complète vos trois ${value} en ${colName(index)} — la colonne entière part à la défausse (−${reason.removed} pts).`;
    case "close": {
      if (reason.gameEnd === "win") {
        return `posé sur votre dernière carte cachée, il ferme la manche — et devrait conclure la partie en votre faveur !`;
      }
      return reason.winning
        ? `posé sur votre dernière carte cachée, il ferme la manche avec ${reason.ourFinal} pt${Math.abs(reason.ourFinal) > 1 ? "s" : ""} : vous êtes devant, verrouillez.`
        : `posez-le sur votre dernière carte cachée pour finir la manche.`;
    }
    case "pair":
      return `il forme une paire de ${value} en ${colName(index)} — un troisième ${value} viderait la colonne.`;
    case "swap":
      return reason.replaced > value
        ? `il remplace votre ${reason.replaced} (−${reason.replaced - value} pts).`
        : `remplacer votre ${reason.replaced} est le moins mauvais échange ici.`;
    case "dig":
      return `posez-le sur une carte cachée : en moyenne elle vaut ~${round1(ctx.mu)}, il fait mieux.`;
  }
};

/**
 * When the best placement deliberately avoids the last hidden card, say why:
 * closing now would risk the doubling penalty.
 */
const avoidCloseNote = (
  grid: Grid,
  value: number,
  chosen: number,
  ctx: ExpertCtx
): string => {
  const hidden = hiddenIndices(grid);
  if (hidden.length !== 1 || chosen === hidden[0]) return "";
  const closingFinal = estScore(gridAfterPlace(grid, value, hidden[0]));
  if (gameEndingClose(closingFinal, ctx) === "lose") {
    return " Surtout pas la dernière carte cachée : fermer maintenant terminerait la partie à votre désavantage.";
  }
  if (closingFinal <= 0 || closingFinal < ctx.oppEst) return "";
  return " Évitez votre dernière carte cachée : fermer maintenant risquerait de doubler votre score.";
};

/**
 * The coach compares every legal slot; when the second-best is nearly as good
 * it says so (a genuine choice), and when the pick is clearly ahead it flags
 * that too — so the advice reads as an analysis of the options, not a decree.
 */
const runnerUpNote = (
  grid: Grid,
  value: number,
  chosen: number,
  ctx: ExpertCtx
): string => {
  const ranked = scorePlacements(grid, value, ctx);
  if (ranked.length < 2 || ranked[0].index !== chosen) return "";
  const margin = ranked[0].score - ranked[1].score;
  if (margin < 0.6) {
    // Same column: "colonne N would be equivalent" would read absurd.
    return ranked[1].index % COLS === chosen % COLS
      ? ` Une autre case de la ${colName(chosen)} ferait aussi bien.`
      : ` La ${colName(ranked[1].index)} serait presque équivalente.`;
  }
  if (margin > 6) return " C'est nettement le meilleur emplacement.";
  return "";
};

/**
 * The classic Skyjo tip behind grabbing a strong card: when the pick builds a
 * high column and the opponent is showing that very value, they will likely
 * shed a copy soon — say so, it is the whole point of the move.
 */
const shedNote = (value: number, ctx: ExpertCtx): string =>
  value >= 5 && opponentShows(value, ctx)
    ? ` L'ordinateur montre un ${value} : il finira sans doute par le défausser, la colonne est très jouable.`
    : "";

/** Face-up pair (two equal cards) around a hidden slot, if any. */
const pairAround = (grid: Grid, index: number): number | null => {
  const others = columnIndices(index % COLS)
    .filter((j) => j !== index)
    .map((j) => grid[j])
    .filter((c): c is Card => c !== null && c.faceUp);
  if (others.length === 2 && others[0].value === others[1].value) {
    return others[0].value;
  }
  return null;
};

/**
 * Advice for the current human decision, or null when there is nothing to
 * advise (not solo, not the player's turn, or a non-decision phase).
 */
export const coachAdvice = (state: GameState): CoachAdvice | null => {
  if (state.mode !== "solo") return null;
  const me = state.currentPlayer;
  const player = state.players[me];
  if (!player || player.isAI) return null;
  const grid = player.grid;

  switch (state.phase) {
    case "setup": {
      const hidden = hiddenIndices(grid);
      if (hidden.length === 0) return null;
      const index = expertSetup(grid);
      const text =
        countFaceUp(grid) === 0
          ? "Révélez vos deux cartes dans des colonnes différentes : vous garderez plus d'options pour compléter des colonnes."
          : "Révélez la seconde carte dans une autre colonne, pour garder le maximum de souplesse.";
      return { action: { type: "revealInitial", player: me, index }, text, index };
    }

    case "draw": {
      const ctx = buildExpertCtx(state, me);
      const d = expertDraw(state, me);
      const top = state.discard[0];
      if (d.take && top && d.takeEval) {
        const reason = placeReason(grid, top.value, d.takeEval.index, ctx);
        // The shed insight explains *why* a strong card is worth grabbing;
        // when it applies it replaces the generic take-vs-draw comparison.
        const shed = reason.kind === "pair" ? shedNote(top.value, ctx) : "";
        const edge = d.takeEval.score - d.deckEV;
        const cmp = shed
          ? ""
          : edge > 3
            ? " Nettement mieux que tenter la pioche."
            : " Un peu plus sûr que de piocher à l'aveugle.";
        return {
          action: { type: "takeFromDiscard" },
          text: `Prenez le ${top.value} de la défausse : ${placeTail(reason, top.value, d.takeEval.index, ctx)}${shed}${cmp}`,
          index: null,
        };
      }
      const text = !top
        ? "Piochez : la défausse est vide."
        : d.takeEval && d.takeEval.score <= 0
          ? `Le ${top.value} de la défausse n'améliore pas votre grille : tentez la pioche.`
          : `Piochez : une carte inconnue promet en moyenne mieux que ce ${top!.value}.`;
      return { action: { type: "drawFromDeck" }, text, index: null };
    }

    case "decide": {
      if (!state.held) return null;
      const ctx = buildExpertCtx(state, me);
      const d = expertDecide(state, me);
      const v = state.held.value;
      if (d.keep) {
        if (d.denial) {
          return {
            action: { type: "keep" },
            text: `Gardez ce ${v} même s'il ne vous arrange pas : défaussé, il permettrait à l'ordinateur de compléter une colonne.`,
            index: null,
          };
        }
        const reason = placeReason(grid, v, d.place.index, ctx);
        const shed = reason.kind === "pair" ? shedNote(v, ctx) : "";
        return {
          action: { type: "keep" },
          text: `Gardez ce ${v} : ${placeTail(reason, v, d.place.index, ctx)}${shed}`,
          index: null,
        };
      }
      const pairValue = d.flip ? pairAround(grid, d.flip.index) : null;
      return {
        action: { type: "discardDrawn" },
        text:
          `Ce ${v} n'améliore rien : défaussez-le et retournez une carte.` +
          (pairValue !== null
            ? ` Avec un peu de chance, vous complétez vos ${pairValue}.`
            : ""),
        index: null,
      };
    }

    case "replace": {
      if (!state.held) return null;
      const ctx = buildExpertCtx(state, me);
      const v = state.held.value;
      const place = expertPlace(grid, v, ctx);
      if (place.index === -1) return null;
      const reason = placeReason(grid, v, place.index, ctx);
      const lead =
        reason.kind === "swap" || reason.kind === "dig"
          ? `En ${colName(place.index)} : `
          : "";
      const close = avoidCloseNote(grid, v, place.index, ctx);
      return {
        action: { type: "placeAt", index: place.index },
        text:
          lead +
          placeTail(reason, v, place.index, ctx) +
          // Only add the option-comparison when we are not already spending the
          // sentence on the more important closing warning.
          (close || runnerUpNote(grid, v, place.index, ctx)),
        index: place.index,
      };
    }

    case "flip": {
      const ctx = buildExpertCtx(state, me);
      const flip = expertFlip(grid, ctx);
      if (!flip) return null;
      const hidden = hiddenIndices(grid);
      const pairValue = pairAround(grid, flip.index);
      let text: string;
      if (pairValue !== null) {
        text = `Retournez en ${colName(flip.index)} : si c'est un ${pairValue}, vos trois ${pairValue} quittent la grille.`;
      } else if (hidden.length === 1) {
        const expFinal = round1(estScore(grid));
        text =
          expFinal < ctx.oppEst
            ? "Retournez votre dernière carte : vous fermez la manche probablement en tête."
            : "Il faut retourner votre dernière carte — la manche se termine, croisez les doigts.";
      } else {
        text = `Retournez en ${colName(flip.index)} : révéler tôt aide à planifier, sans changer votre total espéré.`;
      }
      if (raceBonus(ctx) > 1 && hidden.length > 1) {
        text += " Vous êtes largement devant : accélérez la fin de manche.";
      }
      return { action: { type: "flipAt", index: flip.index }, text, index: flip.index };
    }

    default:
      return null;
  }
};
