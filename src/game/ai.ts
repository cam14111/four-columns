import { cardFrequency, DECK_MEAN } from "./deck";
import { columnIndices, isActive, visibleScore } from "./engine";
import {
  ALL_CARD_VALUES,
  Card,
  COLS,
  Difficulty,
  GameAction,
  GameState,
  Grid,
} from "./types";

// The AI is a *policy*: given a state whose current player is the AI, it
// returns the next single action to apply. The host applies actions one at a
// time (with animation delays), calling back in for the next one.
//
// Three clearly tiered policies share the helpers below:
//   easy   — a beginner: fixed rules of thumb, frequent mistakes, no memory.
//   normal — a solid casual player: expected-value play against the static
//            deck average, with a basic guard against closing at a bad time.
//   hard   — an expert: counts every publicly seen card to model the unseen
//            pool, values column-completion potential, weighs what its
//            discards hand to the opponent, and decides when closing the
//            round is worth the doubling risk.
//
// None of the policies ever reads the value of a face-down card: everything
// is derived from face-up cards, the discard pile (public history) and the
// held card, so the AI plays with exactly the information a human has.

export type Rng = () => number;

export interface AiOptions {
  /** Play this seat at a specific level regardless of the game's setting. */
  difficulty?: Difficulty;
  /** Injectable randomness so simulations and tests are reproducible. */
  rng?: Rng;
}

// ---------------------------------------------------------------------------
// Shared helpers (all levels)
// ---------------------------------------------------------------------------

export const hiddenIndices = (grid: Grid): number[] => {
  const out: number[] = [];
  grid.forEach((c, i) => {
    if (c && !c.faceUp) out.push(i);
  });
  return out;
};

const faceUpValues = (grid: Grid): number[] =>
  grid.filter((c): c is Card => c !== null && c.faceUp).map((c) => c.value);

/** Estimated final score of a grid, valuing face-down cards at `mu`. */
const estScore = (grid: Grid, mu: number = DECK_MEAN): number =>
  grid.reduce((sum, c) => {
    if (!c) return sum;
    return sum + (c.faceUp ? c.value : mu);
  }, 0);

/** Simulate placing `value` (face-up) at `index`, clearing the column if done. */
export const gridAfterPlace = (grid: Grid, value: number, index: number): Grid => {
  const next = grid.slice();
  next[index] = { id: "sim", value: value as Card["value"], faceUp: true };
  const idxs = columnIndices(index % COLS);
  const cards = idxs.map((i) => next[i]);
  if (
    cards.every((c) => c !== null && c.faceUp) &&
    cards.every((c) => c!.value === cards[0]!.value)
  ) {
    for (const i of idxs) next[i] = null;
  }
  return next;
};

interface Placement {
  index: number;
  gain: number; // reduction in estimated score (higher is better)
}

/** Best slot to place a card of known `value`, by estimated-score reduction. */
const bestPlacement = (
  grid: Grid,
  value: number,
  mu: number = DECK_MEAN
): Placement => {
  const before = estScore(grid, mu);
  let best: Placement = { index: -1, gain: -Infinity };
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === null) continue;
    const after = estScore(gridAfterPlace(grid, value, i), mu);
    const gain = before - after;
    if (gain > best.gain) best = { index: i, gain };
  }
  return best;
};

const firstNonNull = (grid: Grid): number => {
  for (let i = 0; i < grid.length; i++) if (grid[i] !== null) return i;
  return 0;
};

const randomOf = <T>(arr: T[], rng: Rng): T =>
  arr[Math.floor(rng() * arr.length)];

/**
 * Non-cheating closing check shared by normal/expert guards: with face-down
 * cards valued at the deck mean, would our final score beat every opponent's
 * estimate? (The old implementation summed real hidden values — peeking.)
 */
const closingLooksSafe = (state: GameState, me: number): boolean => {
  const myGrid = state.players[me].grid;
  const myEst = visibleScore(myGrid) + hiddenIndices(myGrid).length * DECK_MEAN;
  return state.players.every((p, i) => {
    if (i === me || !isActive(p)) return true;
    const est = visibleScore(p.grid) + hiddenIndices(p.grid).length * DECK_MEAN;
    return myEst < est;
  });
};

// ---------------------------------------------------------------------------
// Easy — a beginner playing by feel
// ---------------------------------------------------------------------------

const EASY_MISTAKE = 0.35;

const easyAction = (
  state: GameState,
  me: number,
  rng: Rng
): GameAction | null => {
  const grid = state.players[me].grid;

  switch (state.phase) {
    case "setup": {
      const hidden = hiddenIndices(grid);
      if (hidden.length === 0) return null;
      return { type: "revealInitial", player: me, index: randomOf(hidden, rng) };
    }

    case "draw": {
      // Only grabs discards that look obviously good, and not even always.
      const top = state.discard[0];
      const tempting =
        top && (top.value <= 3 || bestPlacement(grid, top.value).gain > 4);
      if (tempting && rng() >= EASY_MISTAKE) return { type: "takeFromDiscard" };
      return { type: "drawFromDeck" };
    }

    case "decide": {
      const held = state.held!;
      const canFlip = hiddenIndices(grid).length > 0;
      if (held.value <= 5 || !canFlip) return { type: "keep" };
      return { type: "discardDrawn" };
    }

    case "replace": {
      const held = state.held!;
      // Usually the obvious swap, but sometimes a slot picked on a whim.
      if (rng() < EASY_MISTAKE) {
        const slots = grid
          .map((c, i) => (c ? i : -1))
          .filter((i) => i !== -1);
        return { type: "placeAt", index: randomOf(slots, rng) };
      }
      const place = bestPlacement(grid, held.value);
      return {
        type: "placeAt",
        index: place.index !== -1 ? place.index : firstNonNull(grid),
      };
    }

    case "flip": {
      const hidden = hiddenIndices(grid);
      if (hidden.length === 0) return null;
      return { type: "flipAt", index: randomOf(hidden, rng) };
    }

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Normal — solid expected-value play against the static deck average
// ---------------------------------------------------------------------------

const NORMAL_MISTAKE = 0.08;

/** Expected gain from drawing an unknown deck card (rough, but effective). */
const expectedDeckGain = (grid: Grid): number => {
  const ups = faceUpValues(grid);
  const worst = ups.length ? Math.max(...ups) : DECK_MEAN;
  // You'll usually replace your worst face-up card with a roughly average card.
  return Math.max(0, worst - DECK_MEAN);
};

/**
 * Normal's flip choice: any hidden card, but not in a column that already
 * holds a matching face-up pair (don't waste the completion on a blind flip —
 * a deliberately human-but-imperfect heuristic; expert does the opposite).
 */
const chooseFlipNormal = (grid: Grid): number => {
  const hidden = hiddenIndices(grid);
  if (hidden.length === 0) return -1;
  const scored = hidden.map((i) => {
    const others = columnIndices(i % COLS)
      .filter((j) => j !== i)
      .map((j) => grid[j])
      .filter((c): c is Card => c !== null && c.faceUp);
    const pairPenalty =
      others.length === 2 && others[0].value === others[1].value ? 1 : 0;
    return { i, pairPenalty };
  });
  scored.sort((a, b) => a.pairPenalty - b.pairPenalty || a.i - b.i);
  return scored[0].i;
};

const normalAction = (
  state: GameState,
  me: number,
  rng: Rng
): GameAction | null => {
  const grid = state.players[me].grid;

  switch (state.phase) {
    case "setup": {
      const hidden = hiddenIndices(grid);
      if (hidden.length === 0) return null;
      return { type: "revealInitial", player: me, index: randomOf(hidden, rng) };
    }

    case "draw": {
      const top = state.discard[0];
      const discardGain = top ? bestPlacement(grid, top.value).gain : -Infinity;
      if (
        top &&
        discardGain > 0 &&
        discardGain >= expectedDeckGain(grid) &&
        rng() >= NORMAL_MISTAKE
      ) {
        return { type: "takeFromDiscard" };
      }
      return { type: "drawFromDeck" };
    }

    case "decide": {
      const held = state.held!;
      const place = bestPlacement(grid, held.value);
      const hidden = hiddenIndices(grid);
      const canFlip = hidden.length > 0;

      // Don't dig our last card if closing now would likely be penalized.
      if (
        canFlip &&
        hidden.length === 1 &&
        place.gain <= 1 &&
        !closingLooksSafe(state, me)
      ) {
        return { type: "keep" };
      }
      if (place.gain > 0.5 || !canFlip) {
        if (rng() < NORMAL_MISTAKE && canFlip) return { type: "discardDrawn" };
        return { type: "keep" };
      }
      return { type: "discardDrawn" };
    }

    case "replace": {
      const held = state.held!;
      const hidden = hiddenIndices(grid);
      let place = bestPlacement(grid, held.value);
      // Same guard as "decide": placing over our only hidden card would also
      // close the round — fall back to the best face-up slot instead.
      if (
        place.index !== -1 &&
        hidden.length === 1 &&
        place.index === hidden[0] &&
        !closingLooksSafe(state, me)
      ) {
        let alt: Placement = { index: -1, gain: -Infinity };
        const before = estScore(grid);
        for (let i = 0; i < grid.length; i++) {
          if (grid[i] === null || i === hidden[0]) continue;
          const gain = before - estScore(gridAfterPlace(grid, held.value, i));
          if (gain > alt.gain) alt = { index: i, gain };
        }
        if (alt.index !== -1) place = alt;
      }
      return {
        type: "placeAt",
        index: place.index !== -1 ? place.index : firstNonNull(grid),
      };
    }

    case "flip": {
      const index = chooseFlipNormal(grid);
      if (index === -1) return null;
      return { type: "flipAt", index };
    }

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Expert — card counting, column potential, defense and closing judgement
// ---------------------------------------------------------------------------

/** Weight of "what does my discard hand to the opponent" in expert scoring. */
export const OPP_RISK_WEIGHT = 0.45;
/** Damping on column-completion potential (a pair is a chance, not a lock). */
const PAIR_WEIGHT = 0.8;
/** Safety margins (points) before choosing to close, per information level. */
export const CLOSE_MARGIN_KNOWN = 2; // final score exactly known when closing
const CLOSE_MARGIN_BLIND = 4; // closing by flipping an unknown card

/** Match-level view: how this round projects onto the whole game's totals. */
export interface GameOutlook {
  /** Our cumulative score before this round. */
  myTotal: number;
  /** The rival's (best-projected opponent's) cumulative score. */
  oppTotal: number;
  /** That rival's estimated score for the current round. */
  oppRoundEst: number;
  /** Score at which the game ends. */
  limit: number;
  /** 0..1 — how dangerously close *we* are to the limit. */
  pressureMe: number;
  /** 0..1 — how close the rival is to the limit (ending rounds helps us). */
  pressureOpp: number;
}

export interface ExpertCtx {
  /** Remaining unseen copies per card value (index = value + 2). */
  counts: number[];
  /** Total unseen cards. */
  total: number;
  /** Mean of the unseen pool — the expert's estimate for any hidden card. */
  mu: number;
  /** Draws we can still hope to see before someone closes the round. */
  horizon: number;
  /** An opponent closed the round: this is our last turn, pure minimization. */
  finalTurn: boolean;
  oppGrids: Grid[];
  /** Best (lowest) estimated opponent final score for this round. */
  oppEst: number;
  /** Expected usefulness to opponents of a random unseen card. */
  eOppUse: number;
  /** Our own estimated final score for this round. */
  myEst: number;
  /** Our face-down cards left (tempo: how far we are from closing). */
  myHidden: number;
  /** The whole-game projection driving endgame and risk-posture choices. */
  game: GameOutlook;
}

/**
 * Count every card the AI has legitimately seen: face-up grid cards, the whole
 * discard pile (each of those cards passed face-up on top at some point) and
 * the held card. What remains is exactly the pool a hidden card is drawn from
 * (the deck plus everyone's face-down cards).
 */
const buildExpertCtx = (state: GameState, me: number): ExpertCtx => {
  const counts: number[] = [];
  for (const v of ALL_CARD_VALUES) counts[v + 2] = cardFrequency(v);
  const see = (c: Card | null | undefined): void => {
    if (!c || !c.faceUp) return;
    const k = c.value + 2;
    if (counts[k] > 0) counts[k] -= 1;
  };
  for (const p of state.players) for (const c of p.grid) see(c);
  for (const c of state.discard) see(c);
  see(state.held);

  let total = 0;
  let sum = 0;
  for (const v of ALL_CARD_VALUES) {
    total += counts[v + 2];
    sum += v * counts[v + 2];
  }
  const mu = total > 0 ? sum / total : DECK_MEAN;

  const finalTurn = state.closedBy !== null;
  const opps = state.players.filter((p, i) => i !== me && isActive(p));
  const oppGrids = opps.map((p) => p.grid);

  const myHidden = hiddenIndices(state.players[me].grid).length;
  const myEst = visibleScore(state.players[me].grid) + myHidden * mu;

  // Per-opponent round estimate. Their edge on the mandatory final turn after
  // we close is not a constant: it scales with what they can actually fix —
  // their worst face-up card (a visible 12 is a big correction in waiting).
  let oppEst = Infinity;
  let minHidden = myHidden;
  let rival: { total: number; est: number } | null = null;
  for (const p of opps) {
    const h = hiddenIndices(p.grid).length;
    minHidden = Math.min(minHidden, h);
    const ups = p.grid.filter((c): c is Card => c !== null && c.faceUp);
    const worst = ups.length ? Math.max(...ups.map((c) => c.value)) : mu;
    const edge = Math.max(1, Math.min(3.5, 0.5 * (worst - mu)));
    const est = visibleScore(p.grid) + h * mu - edge;
    oppEst = Math.min(oppEst, est);
    // The rival is the opponent best placed to win the whole game.
    if (rival === null || p.totalScore + est < rival.total + rival.est) {
      rival = { total: p.totalScore, est };
    }
  }
  const horizon = finalTurn ? 0 : Math.max(1, Math.min(5, minHidden));

  const limit = state.scoreLimit;
  const myTotal = state.players[me].totalScore;
  const pressure = (t: number): number =>
    Math.max(0, Math.min(1, 1 - (limit - t) / 25));
  const game: GameOutlook = {
    myTotal,
    oppTotal: rival?.total ?? 0,
    oppRoundEst: rival?.est ?? 0,
    limit,
    pressureMe: pressure(myTotal),
    pressureOpp: pressure(rival?.total ?? 0),
  };

  const ctx: ExpertCtx = {
    counts,
    total,
    mu,
    horizon,
    finalTurn,
    oppGrids,
    oppEst,
    eOppUse: 0,
    myEst,
    myHidden,
    game,
  };
  if (!finalTurn && total > 0 && oppGrids.length > 0) {
    let e = 0;
    for (const v of ALL_CARD_VALUES) {
      const n = counts[v + 2];
      if (n > 0) e += (n / total) * oppUse(v, ctx);
    }
    ctx.eOppUse = e;
  }
  return ctx;
};

/** How much the best opponent could gain if `value` sat on the discard top. */
export const oppUse = (value: number, ctx: ExpertCtx): number => {
  let worst = 0;
  for (const g of ctx.oppGrids) {
    const gain = bestPlacement(g, value, ctx.mu).gain;
    if (gain > worst) worst = gain;
  }
  return worst;
};

/** True when an opponent shows a face-up copy of `value` (public info). */
export const opponentShows = (value: number, ctx: ExpertCtx): boolean =>
  ctx.oppGrids.some((g) =>
    g.some((c) => c !== null && c.faceUp && c.value === value)
  );

/**
 * True when an opponent has a face-up pair of `value` in one column — i.e. a
 * discarded `value` would genuinely let them complete and clear that column.
 */
export const opponentPairOf = (value: number, ctx: ExpertCtx): boolean =>
  ctx.oppGrids.some((g) => {
    for (let col = 0; col < COLS; col++) {
      const cards = columnIndices(col).map((i) => g[i]);
      if (cards.some((c) => c === null)) continue;
      const same = cards.filter(
        (c) => c !== null && c.faceUp && c.value === value
      ).length;
      if (same === 2) return true;
    }
    return false;
  });

/**
 * Known Skyjo wisdom: a high-value column is more completable than the raw draw
 * odds imply. Strong cards (5+) are discarded far more often than kept, and a
 * value an opponent is sitting on face-up is very likely to be shed to us on
 * their next turn. This returns the *extra* per-turn chance of the matching
 * card becoming takeable — purely from public information (the value's
 * magnitude and opponents' face-up cards), never from hidden cards.
 */
export const shedChance = (value: number, ctx: ExpertCtx): number => {
  if (value < 5) return 0; // low cards are kept, hardly ever discarded
  let c = ((value - 4) / 8) * 0.015; // small always-on nudge for high cards
  if (opponentShows(value, ctx)) c += 0.08; // the dominant, situational signal
  return Math.min(c, 0.095);
};

/**
 * Expert's grid evaluation: estimated score minus the expected payoff of
 * near-complete columns. A face-up pair of value v with a third slot to fill
 * removes 2v + (third slot) when completed; the chance of completion is the
 * chance of seeing another v within our remaining draws. Negative-value pairs
 * yield no bonus — clearing a column of -2s would *raise* the score.
 */
const potential = (grid: Grid, ctx: ExpertCtx): number => {
  let bonus = 0;
  if (ctx.horizon > 0 && ctx.total > 0) {
    for (let col = 0; col < COLS; col++) {
      const cards = columnIndices(col).map((i) => grid[i]);
      if (cards.some((c) => c === null)) continue; // cleared column
      const ups = cards.filter((c): c is Card => c!.faceUp);
      let pairValue: number | null = null;
      let third = ctx.mu; // hidden third slot valued at the pool mean
      if (ups.length === 2 && ups[0].value === ups[1].value) {
        pairValue = ups[0].value;
      } else if (ups.length === 3) {
        for (let a = 0; a < 3; a++) {
          const b = (a + 1) % 3;
          const c = (a + 2) % 3;
          if (ups[a].value === ups[b].value && ups[a].value !== ups[c].value) {
            pairValue = ups[a].value;
            third = ups[c].value;
            break;
          }
        }
      }
      if (pairValue === null) continue;
      const removal = 2 * pairValue + third;
      if (removal <= 0) continue;
      // Per-turn chance of the third card: drawing it from the pool, plus the
      // extra odds that a high value reaches the discard (see `shedChance`).
      // This makes the expert willing to start/keep a high column — especially
      // when an opponent is showing that value and is about to shed it.
      const pDraw = ctx.counts[pairValue + 2] / ctx.total;
      const shed = shedChance(pairValue, ctx);
      const pTurn = pDraw + shed - pDraw * shed;
      const pComplete = 1 - Math.pow(1 - pTurn, ctx.horizon);
      bonus += PAIR_WEIGHT * pComplete * removal;
    }
  }
  return estScore(grid, ctx.mu) - bonus;
};


/** Flat stake applied when a closing decision would decide the whole game. */
const GAME_STAKE = 9;

/**
 * Closing-value adjustment, in three layers:
 *
 * 1. Endgame: when this round's projected totals cross the score limit, the
 *    round score stops mattering — only the final standings do. Closing into
 *    a lost game gets a heavy malus even if the round itself looks safe
 *    (being at 95 and closing with +6 loses at 101). Closing into a won game
 *    gets a heavy bonus even through the doubling penalty (busting a rival
 *    sitting at 95 wins the game regardless of our doubled round).
 * 2. Match pressure: near the limit ourselves, the doubling risk is existential
 *    — widen the safety margin. A rival near the limit makes ending rounds
 *    quickly valuable — raise the lock-in cap.
 * 3. The usual round-level trade-off: small lock-in bonus for sealing a lead,
 *    expected doubling cost otherwise.
 */
/** Would closing at `ourFinal` end the whole game — and in whose favour? */
export const gameEndingClose = (
  ourFinal: number,
  ctx: ExpertCtx
): "win" | "lose" | null => {
  const g = ctx.game;
  const penalized = ourFinal > 0 && ourFinal >= g.oppRoundEst;
  const myEnd = g.myTotal + (penalized ? 2 * ourFinal : ourFinal);
  const oppEnd = g.oppTotal + g.oppRoundEst;
  if (myEnd < g.limit && oppEnd < g.limit) return null;
  return myEnd < oppEnd ? "win" : "lose";
};

export const closeAdjust = (
  ourFinal: number,
  ctx: ExpertCtx,
  margin: number
): number => {
  const g = ctx.game;
  const end = gameEndingClose(ourFinal, ctx);
  if (end !== null) {
    return end === "win"
      ? GAME_STAKE
      : -GAME_STAKE - Math.max(0, ourFinal) * 0.5;
  }

  const adjMargin = Math.max(0.5, margin + 2 * g.pressureMe - g.pressureOpp);
  const lockCap = 4 + 3 * g.pressureOpp;
  const lockBonus = Math.max(0, Math.min(lockCap, (ctx.oppEst - ourFinal) * 0.25));
  if (ourFinal <= 0) return lockBonus; // a non-positive close is never penalized
  const span = adjMargin + 4;
  const pLose = Math.max(0, Math.min(1, (ourFinal + adjMargin - ctx.oppEst) / span));
  return lockBonus - pLose * ourFinal;
};

/**
 * Tempo: when our round estimate is clearly better than the opponent's, every
 * extra turn is a chance for them to catch up — reward actions that reveal a
 * face-down card (flips, placements onto hidden slots) so the round closes
 * sooner. Strictly a bonus, never a penalty for revealing, so it can only
 * accelerate the round's end (a reveal-penalty was tried earlier and produced
 * never-ending rounds). Applies at 2-3 hidden cards; at 1, `closeAdjust`
 * already prices the actual closing.
 */
export const raceBonus = (ctx: ExpertCtx): number => {
  if (ctx.finalTurn || ctx.myHidden < 2 || ctx.myHidden > 3) return 0;
  const edge = ctx.oppEst - ctx.myEst;
  if (edge < 5) return 0;
  return Math.min(2.5, 0.15 * edge) * ((4 - ctx.myHidden) / 2);
};

export interface ExpertPlacement {
  index: number;
  score: number;
}

/**
 * Best slot for a known `value`, scored as: potential reduction, minus what
 * the replaced card offers the opponent on the discard, plus/minus the value
 * of closing the round when the slot is our last hidden card.
 */
/**
 * Every legal placement of `value`, scored exactly as `expertPlace` scores the
 * best one, sorted best-first. Exposed so the coach can name the runner-up and
 * quote the margin between the top options.
 */
export const scorePlacements = (
  grid: Grid,
  value: number,
  ctx: ExpertCtx
): ExpertPlacement[] => {
  const base = potential(grid, ctx);
  const hidden = hiddenIndices(grid);
  const out: ExpertPlacement[] = [];
  for (let i = 0; i < grid.length; i++) {
    const replaced = grid[i];
    if (replaced === null) continue;
    const after = gridAfterPlace(grid, value, i);
    let score = base - potential(after, ctx);
    if (!ctx.finalTurn) {
      // The replaced card lands face-up on the discard for the opponent.
      score -=
        OPP_RISK_WEIGHT *
        (replaced.faceUp ? oppUse(replaced.value, ctx) : ctx.eOppUse);
      if (!replaced.faceUp && hidden.length === 1) {
        // Placing over our only hidden card reveals the whole grid: we close,
        // and our final score is exactly known.
        const ourFinal = estScore(after, ctx.mu); // all face-up -> exact
        score += closeAdjust(ourFinal, ctx, CLOSE_MARGIN_KNOWN);
      } else if (!replaced.faceUp) {
        // Revealing progress: when we are ahead, hurry the round's end.
        score += raceBonus(ctx);
      }
    }
    out.push({ index: i, score });
  }
  // Stable sort keeps the lowest index first among equal scores — matching the
  // original "strictly greater" scan, so the chosen slot is unchanged.
  out.sort((a, b) => b.score - a.score);
  return out;
};

export const expertPlace = (
  grid: Grid,
  value: number,
  ctx: ExpertCtx
): ExpertPlacement =>
  scorePlacements(grid, value, ctx)[0] ?? { index: -1, score: -Infinity };

export interface ExpertFlip {
  index: number;
  ev: number;
}

/**
 * Best card to flip: a flip is score-neutral in expectation (the estimate mu
 * simply becomes a real value), so its worth is the chance of completing a
 * face-up pair — plus the closing stakes when it is our last hidden card.
 */
export const expertFlip = (grid: Grid, ctx: ExpertCtx): ExpertFlip | null => {
  const hidden = hiddenIndices(grid);
  if (hidden.length === 0) return null;
  const closes = hidden.length === 1 && !ctx.finalTurn;
  let best: ExpertFlip & { tie: number } = { index: -1, ev: -Infinity, tie: 0 };
  for (const i of hidden) {
    const others = columnIndices(i % COLS)
      .filter((j) => j !== i)
      .map((j) => grid[j])
      .filter((c): c is Card => c !== null && c.faceUp);
    let ev = 0;
    if (
      others.length === 2 &&
      others[0].value === others[1].value &&
      ctx.total > 0
    ) {
      const v = others[0].value;
      const removal = 2 * v + ctx.mu;
      if (removal > 0) {
        ev += (ctx.counts[v + 2] / ctx.total) * removal;
      }
    }
    if (closes) {
      // Blind close: our final score is visible + one unknown card.
      const expFinal = visibleScore(grid) + ctx.mu;
      ev += closeAdjust(expFinal, ctx, CLOSE_MARGIN_BLIND);
    } else {
      // Revealing progress: when we are ahead, hurry the round's end.
      ev += raceBonus(ctx);
    }
    // Tie-break: keep columns with several unknowns intact a little longer.
    const tie = hidden.filter((h) => h % COLS === i % COLS).length;
    if (ev > best.ev || (ev === best.ev && tie > best.tie)) {
      best = { index: i, ev, tie };
    }
  }
  return { index: best.index, ev: best.ev };
};

/** Expert's opening reveals: spread over distinct columns and rows. */
export const expertSetup = (grid: Grid): number => {
  const hidden = hiddenIndices(grid);
  let best = hidden[0];
  let bestScore = Infinity;
  for (const i of hidden) {
    const colUp = columnIndices(i % COLS).some((j) => grid[j]?.faceUp);
    const row = Math.floor(i / COLS);
    const rowUp = grid.some(
      (c, j) => c?.faceUp && Math.floor(j / COLS) === row
    );
    const score = (colUp ? 2 : 0) + (rowUp ? 1 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
};

/** Structured outcome of the expert's draw decision (shared with the coach). */
export interface ExpertDraw {
  /** True when the discard top should be taken. */
  take: boolean;
  /** Evaluation of taking the discard top (null when the discard is empty). */
  takeEval: ExpertPlacement | null;
  /** Expected score of gambling on the deck instead. */
  deckEV: number;
}

export const expertDraw = (state: GameState, me: number): ExpertDraw => {
  const grid = state.players[me].grid;
  const ctx = buildExpertCtx(state, me);
  const top = state.discard[0];
  const takeEval = top ? expertPlace(grid, top.value, ctx) : null;

  // Expected value of the deck: for every unseen value, the best of placing
  // it or discarding it to flip, weighted by its probability.
  const flip = expertFlip(grid, ctx);
  let deckEV = 0;
  if (ctx.total > 0) {
    for (const v of ALL_CARD_VALUES) {
      const n = ctx.counts[v + 2];
      if (n === 0) continue;
      const place = expertPlace(grid, v, ctx).score;
      const toss =
        flip === null
          ? -Infinity
          : flip.ev - (ctx.finalTurn ? 0 : OPP_RISK_WEIGHT * oppUse(v, ctx));
      deckEV += (n / ctx.total) * Math.max(place, toss);
    }
  }
  // Risk posture from the whole-game projection: with the better projected
  // total, protect it with the certain discard; trailing, chase variance
  // through the deck. Small and bounded — a nudge, not a doctrine.
  const g = ctx.game;
  const ahead = g.myTotal + ctx.myEst <= g.oppTotal + g.oppRoundEst;
  const bias = ahead ? -0.35 : 0.35;
  return {
    take: takeEval !== null && takeEval.score >= deckEV + bias,
    takeEval,
    deckEV,
  };
};

/** Structured outcome of the expert's keep/discard decision. */
export interface ExpertDecide {
  keep: boolean;
  place: ExpertPlacement;
  flip: ExpertFlip | null;
  /** Kept to stop an opponent *completing a column* (they show a matching pair). */
  denial: boolean;
  /** Kept mainly to avoid handing the opponent a useful card (no column). */
  softDeny: boolean;
}

export const expertDecide = (state: GameState, me: number): ExpertDecide => {
  const grid = state.players[me].grid;
  const ctx = buildExpertCtx(state, me);
  const held = state.held!;
  const place = expertPlace(grid, held.value, ctx);
  const flip = expertFlip(grid, ctx);
  if (flip === null || place.index === -1) {
    return { keep: flip === null, place, flip, denial: false, softDeny: false };
  }
  const risk = ctx.finalTurn ? 0 : OPP_RISK_WEIGHT * oppUse(held.value, ctx);
  const keep = place.score >= flip.ev - risk;
  // The opponent risk is what tipped us into keeping (our own board would
  // rather flip). Only then is a "defensive keep" the real story.
  const defensive = keep && flip.ev > place.score && !ctx.finalTurn;
  // Strong story — they show a face-up pair, so discarding truly lets them
  // complete a column. Claiming that without a real pair reads as a bug.
  const denial = defensive && opponentPairOf(held.value, ctx);
  // Softer story — no column, but the card would still help them a little.
  const softDeny = defensive && !denial && oppUse(held.value, ctx) >= 1;
  return { keep, place, flip, denial, softDeny };
};

const expertAction = (state: GameState, me: number): GameAction | null => {
  const grid = state.players[me].grid;

  switch (state.phase) {
    case "setup": {
      if (hiddenIndices(grid).length === 0) return null;
      return { type: "revealInitial", player: me, index: expertSetup(grid) };
    }

    case "draw": {
      const d = expertDraw(state, me);
      return d.take ? { type: "takeFromDiscard" } : { type: "drawFromDeck" };
    }

    case "decide": {
      const d = expertDecide(state, me);
      return d.keep ? { type: "keep" } : { type: "discardDrawn" };
    }

    case "replace": {
      const ctx = buildExpertCtx(state, me);
      const held = state.held!;
      const place = expertPlace(grid, held.value, ctx);
      return {
        type: "placeAt",
        index: place.index !== -1 ? place.index : firstNonNull(grid),
      };
    }

    case "flip": {
      const ctx = buildExpertCtx(state, me);
      const flip = expertFlip(grid, ctx);
      if (flip === null) return null;
      return { type: "flipAt", index: flip.index };
    }

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const aiChooseAction = (
  state: GameState,
  opts: AiOptions = {}
): GameAction | null => {
  const me = state.currentPlayer;
  const player = state.players[me];
  if (!player?.isAI) return null;

  const difficulty = opts.difficulty ?? state.difficulty;
  const rng = opts.rng ?? Math.random;

  switch (difficulty) {
    case "easy":
      return easyAction(state, me, rng);
    case "normal":
      return normalAction(state, me, rng);
    default:
      return expertAction(state, me);
  }
};

// Exposed for tests / potential hints.
export { bestPlacement, estScore, buildExpertCtx, closingLooksSafe };
