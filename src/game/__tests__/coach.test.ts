import { describe, expect, it } from "vitest";
import { aiChooseAction } from "../ai";
import { coachAdvice } from "../coach";
import { createGame, reduce } from "../engine";
import { Card, GameState } from "../types";

const card = (value: number, faceUp = true): Card => ({
  id: `c${value}_${Math.random()}`,
  value: value as Card["value"],
  faceUp,
});

const gridFrom = (values: number[]): Card[] => values.map((v) => card(v, true));

// A hand-crafted position where the human (seat 0) is to act.
const humanPosition = (
  humanGrid: Card[],
  aiGrid: Card[],
  overrides: Partial<GameState> = {}
): GameState => {
  const base = createGame({ seed: 99, difficulty: "hard" });
  return {
    ...base,
    players: [
      { ...base.players[0], grid: humanGrid },
      { ...base.players[1], grid: aiGrid },
    ],
    currentPlayer: 0,
    phase: "draw",
    ...overrides,
  };
};

describe("coach — guards", () => {
  const anyGrid = () => gridFrom([5, 6, 7, 8, 4, 3, 2, 1, 0, 1, 2, 3]);

  it("is silent outside solo mode", () => {
    const s = { ...humanPosition(anyGrid(), anyGrid()), mode: "duo" as const };
    expect(coachAdvice(s)).toBeNull();
  });

  it("is silent on the AI's turn", () => {
    const s = { ...humanPosition(anyGrid(), anyGrid()), currentPlayer: 1 };
    expect(coachAdvice(s)).toBeNull();
  });

  it("is silent when there is no decision to make", () => {
    const s = { ...humanPosition(anyGrid(), anyGrid()), phase: "roundOver" as const };
    expect(coachAdvice(s)).toBeNull();
  });
});

describe("coach — explanations", () => {
  it("urges taking a discard that completes a column, and says why", () => {
    // Human column 0 holds two face-up 9s, third slot hidden; a 9 on top.
    const humanGrid = gridFrom([9, 3, 4, 5, 9, 6, 2, 1, 8, 0, 7, 8]);
    humanGrid[8] = card(8, false);
    humanGrid[3] = card(5, false);
    const aiGrid = gridFrom([5, 6, 7, 8, 4, 3, 2, 1, 0, 1, 2, 3]);

    const s = humanPosition(humanGrid, aiGrid, { discard: [card(9)] });
    const advice = coachAdvice(s);
    expect(advice?.action).toEqual({ type: "takeFromDiscard" });
    expect(advice?.text).toContain("défausse");
    expect(advice?.text).toContain("colonne 1");
    // The advice weighs the alternative (drawing) rather than just decreeing.
    expect(advice?.text).toContain("pioch");
  });

  it("points at the completing slot when placing, with the points saved", () => {
    const humanGrid = gridFrom([9, 3, 4, 5, 9, 6, 2, 1, 8, 0, 7, 8]);
    humanGrid[8] = card(8, false);
    humanGrid[3] = card(5, false);
    const aiGrid = gridFrom([5, 6, 7, 8, 4, 3, 2, 1, 0, 1, 2, 3]);

    const s = humanPosition(humanGrid, aiGrid, {
      phase: "replace",
      held: card(9),
      heldSource: "discard",
    });
    const advice = coachAdvice(s);
    expect(advice?.action).toEqual({ type: "placeAt", index: 8 });
    expect(advice?.index).toBe(8);
    expect(advice?.text).toContain("27");
    // Having compared every slot, the coach flags this one as clearly best.
    expect(advice?.text).toContain("meilleur emplacement");
  });

  it("explains keeping a card that would arm the opponent", () => {
    // The AI shows two 7s; tossing our drawn 7 would hand it the completion.
    const humanGrid = gridFrom([0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1]);
    humanGrid[10] = card(0, false);
    humanGrid[11] = card(1, false);
    const aiGrid = gridFrom([7, 5, 6, 8, 7, 4, 3, 2, 12, 1, 0, 9]);

    const s = humanPosition(humanGrid, aiGrid, {
      phase: "decide",
      held: card(7),
      heldSource: "deck",
    });
    const advice = coachAdvice(s);
    expect(advice?.action).toEqual({ type: "keep" });
    expect(advice?.text).toContain("ordinateur");
  });

  it("warns against closing the round from behind", () => {
    const humanGrid = gridFrom([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 0]);
    humanGrid[11] = card(0, false); // last hidden card, terrible board
    const aiGrid = gridFrom([0, 1, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5]);
    for (let i = 4; i < 12; i++) aiGrid[i] = card(5, false);

    const s = humanPosition(humanGrid, aiGrid, {
      phase: "replace",
      held: card(0),
      heldSource: "deck",
    });
    const advice = coachAdvice(s);
    expect(advice?.action.type).toBe("placeAt");
    expect((advice?.action as { index: number }).index).not.toBe(11);
    expect(advice?.text).toContain("dernière carte cachée");
  });

  it("celebrates a safe closing move", () => {
    const humanGrid = gridFrom([0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 2]);
    humanGrid[11] = card(2, false); // last hidden card, near-perfect board
    const aiGrid = gridFrom([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    for (let i = 8; i < 12; i++) aiGrid[i] = card(5, false);

    const s = humanPosition(humanGrid, aiGrid, {
      phase: "replace",
      held: card(2),
      heldSource: "deck",
    });
    const advice = coachAdvice(s);
    expect(advice?.action).toEqual({ type: "placeAt", index: 11 });
    expect(advice?.text.toLowerCase()).toContain("ferme");
  });

  it("starts a high column when the opponent is showing that value", () => {
    // Early game: our column 0 shows a lone 12 over two hidden slots, and a 12
    // sits on the discard. When the opponent is showing 12s (they will likely
    // shed one soon), grabbing the strong card to build the column is worth
    // it — the classic web-strategy tip the coach now applies.
    const humanGrid = gridFrom([12, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    for (let i = 2; i < 12; i++) humanGrid[i] = card(humanGrid[i].value, false);
    const shownTwelves = gridFrom([12, 5, 6, 0, 12, 0, 0, 0, 0, 0, 0, 0]);
    for (let i = 5; i < 12; i++)
      shownTwelves[i] = card(shownTwelves[i].value, false);

    const withShow = humanPosition(humanGrid, shownTwelves, {
      discard: [card(12)],
    });
    const adviceShow = coachAdvice(withShow);
    expect(adviceShow?.action).toEqual({ type: "takeFromDiscard" });
    expect(adviceShow?.text.toLowerCase()).toContain("colonne");
    // ...and the explanation teaches the read on the opponent's discards.
    expect(adviceShow?.text.toLowerCase()).toContain("défausser");

    // Same board, but the opponent shows no 12: the shed signal is gone, so
    // the coach no longer grabs the high card — it draws instead.
    const noTwelve = gridFrom([4, 5, 6, 0, 3, 0, 0, 0, 0, 0, 0, 0]);
    for (let i = 5; i < 12; i++) noTwelve[i] = card(noTwelve[i].value, false);
    const withoutShow = humanPosition(humanGrid, noTwelve, {
      discard: [card(12)],
    });
    expect(coachAdvice(withoutShow)?.action).toEqual({ type: "drawFromDeck" });
  });

  it("gives the same (expert) advice whatever the difficulty setting", () => {
    const humanGrid = gridFrom([9, 3, 4, 5, 9, 6, 2, 1, 8, 0, 7, 8]);
    humanGrid[8] = card(8, false);
    humanGrid[3] = card(5, false);
    const aiGrid = gridFrom([5, 6, 7, 8, 4, 3, 2, 1, 0, 1, 2, 3]);
    const base = humanPosition(humanGrid, aiGrid, { discard: [card(9)] });

    const easy = coachAdvice({ ...base, difficulty: "easy" });
    const hard = coachAdvice({ ...base, difficulty: "hard" });
    expect(easy).toEqual(hard);
  });
});

describe("coach — agrees with the expert policy over a whole game", () => {
  it("recommends exactly the move the expert AI would play", () => {
    // Drive one full round with expert AIs on both seats; before every seat-0
    // decision, ask the coach (on a humanised copy of the state) and check it
    // recommends the very action the expert plays. Advice text is never empty.
    let s = createGame({ seed: 4242, difficulty: "hard" });
    s = { ...s, players: s.players.map((p) => ({ ...p, isAI: true })) };
    let guard = 0;
    let checked = 0;
    while (s.phase !== "roundOver" && s.phase !== "gameOver" && guard < 600) {
      guard++;
      const a = aiChooseAction(s);
      expect(a).not.toBeNull();
      if (s.currentPlayer === 0) {
        const humanised: GameState = {
          ...s,
          players: s.players.map((p, i) =>
            i === 0 ? { ...p, isAI: false } : p
          ),
        };
        const advice = coachAdvice(humanised);
        expect(advice).not.toBeNull();
        expect(advice!.action).toEqual(a);
        expect(advice!.text.length).toBeGreaterThan(0);
        checked++;
      }
      s = reduce(s, a!);
    }
    expect(checked).toBeGreaterThan(10);
  });
});
