// End-to-end test of the online mode (2-8 players) against Firebase emulators.
//
// Boots the Auth + Realtime Database emulators (with the real security rules)
// and the Vite dev server, then drives real Chromium pages — real "phones" —
// through real UI interactions: create, share code, join, auto-start, play
// full rounds, refresh mid-game, disconnect, abandon, forfeit, exclusion,
// claim, error cases, and direct database attacks against the rules.
//
//   node scripts/e2e-online.mjs            # full suite (includes ~80s absence waits)
//   node scripts/e2e-online.mjs --fast     # skip the slow absence-based cases
//
// Requires: Java (for the database emulator), Chromium via playwright.

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import process from "node:process";
import { chromium } from "playwright";

const FAST = process.argv.includes("--fast");
const VITE_PORT = 8123;
const BASE = `http://127.0.0.1:${VITE_PORT}/`;
const children = [];

const start = (cmd, args, env = {}, { noProxy = false } = {}) => {
  const base = { ...process.env };
  if (noProxy) {
    // firebase-tools routes even 127.0.0.1 requests through HTTPS_PROXY
    // (it ignores NO_PROXY), which breaks pushing rules to the local
    // emulator. The emulator needs no outbound network — strip the proxy.
    for (const k of Object.keys(base)) {
      if (/^(https?_proxy|(HTTPS?|ALL)_PROXY)$/i.test(k)) delete base[k];
    }
  }
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // own process group so cleanup kills the whole tree
    env: { ...base, ...env },
  });
  child.stdout.on("data", (d) => {
    if (process.env.E2E_VERBOSE) process.stdout.write(d);
  });
  child.stderr.on("data", (d) => {
    if (process.env.E2E_VERBOSE) process.stderr.write(d);
  });
  children.push(child);
  return child;
};

const waitForHttp = async (url, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`timeout waiting for ${url}`);
};

let failures = 0;
const check = (cond, label) => {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
};

const snapOf = (page) =>
  page.evaluate(() => {
    const h = window.__4c;
    if (!h?.snap) return null;
    const s = h.snap;
    return {
      status: s.status,
      mySeat: s.mySeat,
      myTurn: s.myTurn,
      started: s.started,
      maxPlayers: s.maxPlayers,
      playerCount: s.playerCount,
      canStartEarly: s.canStartEarly,
      phase: s.game?.phase ?? null,
      round: s.game?.round ?? null,
      currentPlayer: s.game?.currentPlayer ?? null,
      totals: s.game?.players.map((p) => p.totalScore) ?? null,
      roundScores: s.game?.players.map((p) => p.roundScores) ?? null,
      outs: s.game?.players.map((p) => p.out === true) ?? null,
      held: s.game?.held?.value ?? null,
      awaitingReveal: s.awaitingReveal,
      corrupted: s.corrupted,
      busy: s.busy,
      connected: s.connected,
      players: s.players.map((p) => ({
        seat: p.seat,
        name: p.name,
        online: p.online,
        out: p.out,
        ready: p.ready,
        canExclude: p.canExclude,
        isMe: p.isMe,
      })),
      canClaimVictory: s.canClaimVictory,
      result: s.result,
      code: s.code,
      names: s.players.map((p) => p.name),
      myNextReady: s.myNextReady,
      deck: s.game?.deck.length ?? null,
      grids: s.game?.players.map((p) =>
        p.grid.map((c) => (c === null ? null : c.faceUp ? c.value : "?"))
      ),
    };
  });

const waitSnap = async (page, pred, label, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await snapOf(page);
    if (last && pred(last)) return last;
    await sleep(120);
  }
  // A null snapshot usually means the page is no longer on the game screen —
  // dump where it actually is to make the failure actionable.
  const where = await page
    .evaluate(() => ({
      url: location.href,
      stage: window.__4c?.stage ?? null,
      body: document.body.innerText.slice(0, 300),
    }))
    .catch(() => null);
  throw new Error(
    `timeout: ${label}\nlast snapshot: ${JSON.stringify(last, null, 2)}\npage: ${JSON.stringify(where)}`
  );
};

/** Performs one legal UI interaction when it's this page's turn. */
const actOnce = async (page, opts = {}) => {
  const { autoRounds = false, keepMax = 5 } = opts;
  const s = await snapOf(page);
  if (!s || s.busy) return false;
  // End-of-round panel: press "Manche suivante" once (ready handshake).
  if (autoRounds && s.phase === "roundOver" && !s.myNextReady && !s.result) {
    const btn = page.getByRole("button", { name: "Manche suivante" });
    if ((await btn.count()) === 0) return false; // reveal delay — not shown yet
    try {
      await btn.click({ timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }
  if (!s.myTurn) return false;
  const clickFaceDown = async () => {
    const cards = page.locator('[role="button"][aria-label="Carte face cachée"]');
    if ((await cards.count()) === 0) return false;
    await cards.first().click();
    return true;
  };
  switch (s.phase) {
    case "setup":
    case "flip":
      return clickFaceDown();
    case "draw": {
      await page
        .locator('button[aria-label="Piocher dans la pioche"]:not([disabled])')
        .click();
      return true;
    }
    case "decide": {
      // Keep small cards, dump big ones — keeps round scores reasonable so a
      // game spans several rounds (keepMax=12 turns the bot greedy instead).
      const label =
        (s.held ?? 0) <= keepMax ? "Garder & remplacer" : "Défausser & retourner";
      await page.getByRole("button", { name: label }).click();
      return true;
    }
    case "replace": {
      // Prefer replacing a hidden card (also exercises the ref/value path).
      if (await clickFaceDown()) return true;
      const any = page.locator('[role="button"][aria-label^="Carte"]');
      await any.first().click();
      return true;
    }
    default:
      return false;
  }
};

/** Plays every page until the predicate matches (or a step budget runs out). */
const playUntil = async (pages, pred, label, maxSteps = 400, opts = {}) => {
  for (let i = 0; i < maxSteps; i++) {
    const s = await snapOf(pages[0]);
    if (s && pred(s)) return s;
    let acted = false;
    for (const page of pages) {
      if (await actOnce(page, opts)) {
        acted = true;
        break;
      }
    }
    await sleep(acted ? 150 : 200);
  }
  const dumps = [];
  for (const page of pages) dumps.push(await snapOf(page));
  throw new Error(
    `step budget exhausted: ${label}\n` +
      dumps.map((d, i) => `page${i}: ${JSON.stringify(d)}`).join("\n")
  );
};

/** Create a game from the Home screen (name already stored). */
const createGame = async (page, players) => {
  await page.getByRole("button", { name: "Jouer en ligne" }).click();
  await page.getByRole("button", { name: `${players} joueurs` }).click();
  await page.getByRole("button", { name: "Créer une partie" }).click();
  return waitSnap(page, (s) => s.status === "lobby", "lobby après création");
};

/** From a terminal overlay (or Home) back to the Home screen. */
const backHome = async (page) => {
  // The end-of-game panel slides in ~1s after the result lands — wait for
  // the button to become clickable instead of sampling instantly.
  try {
    await page
      .getByRole("button", { name: "Menu principal" })
      .first()
      .click({ timeout: 8000 });
  } catch {
    /* already on Home */
  }
  await page.waitForSelector("text=Mode de jeu", { timeout: 15_000 });
};

const screenshots = async () =>
  (await import("node:fs/promises")).mkdir("e2e-artifacts", {
    recursive: true,
  });

// ---------------------------------------------------------------------------

const main = async () => {
  console.log("▶ starting emulators + vite…");
  start(
    "npx",
    [
      "firebase",
      "emulators:start",
      "--only",
      "auth,database",
      "--project",
      "four-columns-duels",
    ],
    {},
    { noProxy: true }
  );
  start(
    "npx",
    [
      "vite",
      "--port",
      String(VITE_PORT),
      "--strictPort",
      // The project config binds "::" which needs IPv6; force IPv4 so the
      // suite also runs in IPv4-only sandboxes/CI.
      "--host",
      "127.0.0.1",
    ],
    { VITE_FIREBASE_EMULATORS: "1" }
  );
  await waitForHttp("http://127.0.0.1:9099");
  await waitForHttp(
    "http://127.0.0.1:9000/.json?ns=four-columns-duels-default-rtdb"
  );
  await waitForHttp(BASE);
  await screenshots();
  console.log("▶ environment ready");

  // Use the pre-provisioned Chromium if the pinned playwright build isn't
  // downloaded (e.g. sandboxed environments with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).
  const executablePath = process.env.E2E_CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium.launch(
    (await import("node:fs")).existsSync(executablePath)
      ? { executablePath }
      : {}
  );
  // Real phone-sized viewports — the app is mobile-first and the visual
  // artifacts should show what players actually see.
  const phone = { viewport: { width: 390, height: 844 } };
  const ctxA = await browser.newContext(phone); // "phone" A (host)
  const ctxB = await browser.newContext(phone); // "phone" B (guest)
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const wirePage = (name, page) => {
    page.on("pageerror", (e) => console.error(`  [${name}] pageerror:`, e));
    page.on("console", (m) => {
      const text = m.text();
      if (m.type() === "warning" && text.includes("FIREBASE")) {
        console.error(`  [${name}] ${text.slice(0, 200)}`);
      }
    });
  };
  wirePage("A", pageA);
  wirePage("B", pageB);

  // ---- 1. Create a 2-player game ---------------------------------------------
  console.log("▶ 1. création d'une partie à 2 (A)");
  await pageA.goto(BASE);
  await pageA.getByRole("button", { name: "En ligne" }).click();
  await pageA.getByPlaceholder("Vous").fill("Alice");
  // Score limit 150: leaves room for several rounds even when the closer's
  // penalty doubles a big score (a 100-limit game can end at round 1).
  await pageA.getByRole("button", { name: "Réglages" }).click();
  await pageA.getByRole("button", { name: "150" }).click();
  await pageA.getByRole("button", { name: "Fermer" }).click();
  await pageA.getByRole("button", { name: "Jouer en ligne" }).click();
  await pageA.getByRole("button", { name: "2 joueurs" }).click();
  await pageA.getByRole("button", { name: "Créer une partie" }).click();
  await pageA.waitForSelector("text=Partie créée !", { timeout: 30_000 });
  const lobbyA = await waitSnap(pageA, (s) => s.status === "lobby", "A lobby");
  const code = lobbyA.code;
  check(/^[A-Z0-9]{6}$/.test(code), `code de partie généré (${code})`);
  check(lobbyA.maxPlayers === 2, "salon à 2 sièges");

  // ---- 2. Invalid code, then join by deep link ------------------------------
  console.log("▶ 2. code invalide puis join par lien (B)");
  await pageB.goto(`${BASE}?join=ZZZZZZ`);
  await pageB.getByPlaceholder("Votre nom").fill("Bob");
  await pageB.getByRole("button", { name: "Rejoindre" }).click();
  await pageB.waitForSelector("text=Code invalide ou partie introuvable", {
    timeout: 20_000,
  });
  check(true, "code invalide → message d'erreur");
  await pageB.getByRole("button", { name: "Réessayer" }).click();

  // Name is remembered, so the deep link joins automatically. The lobby is
  // full at that point, so the game auto-starts on every device.
  await pageB.goto(`${BASE}?join=${code}`);
  await waitSnap(pageB, (s) => s.status === "playing", "B in game");
  const sA = await waitSnap(pageA, (s) => s.status === "playing", "A in game");
  check(sA.names[0] === "Alice" && sA.names[1] === "Bob", "sièges et noms corrects");
  check(sA.playerCount === 2 && sA.started === true, "démarrage automatique à salon plein");

  // ---- 3. A third player cannot join ----------------------------------------
  console.log("▶ 3. partie déjà commencée (C)");
  const ctxC = await browser.newContext();
  const pageC = await ctxC.newPage();
  await pageC.goto(`${BASE}?join=${code}`);
  await pageC.getByPlaceholder("Votre nom").fill("Carol");
  await pageC.getByRole("button", { name: "Rejoindre" }).click();
  await pageC.waitForSelector("text=Cette partie a déjà commencé", {
    timeout: 20_000,
  });
  check(true, "3e joueur refusé (partie commencée)");
  await ctxC.close();

  // ---- 4. Direct database attacks against the rules -------------------------
  console.log("▶ 4. attaques directes sur la base (règles)");
  await rulesAttacks(code, pageA, pageB);

  // ---- 5. Play a full round --------------------------------------------------
  console.log("▶ 5. première manche complète");
  const pages = [pageA, pageB];
  let roundOverA;
  for (let attempt = 0; ; attempt++) {
    roundOverA = await playUntil(
      pages,
      (s) => s.roundScores?.[0]?.length >= 1,
      "manche 1 terminée"
    );
    check(roundOverA.roundScores[0].length === 1, "scores de manche enregistrés");
    const roundOverB = await waitSnap(
      pageB,
      (s) => s.roundScores?.[0]?.length >= 1,
      "B voit la fin de manche"
    );
    check(
      JSON.stringify(roundOverA.totals) === JSON.stringify(roundOverB.totals),
      `totaux identiques des deux côtés (${JSON.stringify(roundOverA.totals)})`
    );
    check(
      JSON.stringify(roundOverA.grids) === JSON.stringify(roundOverB.grids),
      "grilles identiques des deux côtés"
    );
    if (roundOverA.phase !== "gameOver") break;
    // Rare: the doubled closer score blew past the limit at round 1 — start
    // a rematch so the next-round handshake can still be exercised.
    if (attempt >= 3) throw new Error("manche 1 termine toujours la partie");
    console.log("  (manche 1 a conclu la partie — revanche pour continuer)");
    await pageA
      .getByRole("button", { name: "Proposer une revanche" })
      .click({ timeout: 15_000 });
    await waitSnap(pageA, (s) => s.status === "lobby", "A lobby revanche");
    await pageB
      .getByRole("button", { name: "Rejoindre la revanche" })
      .click({ timeout: 15_000 });
    await waitSnap(pageA, (s) => s.status === "playing", "revanche lancée");
    await waitSnap(pageB, (s) => s.status === "playing", "revanche lancée B");
  }

  // ---- 6. Next round via the everyone-ready handshake ------------------------
  console.log("▶ 6. manche suivante (tous prêts)");
  // Visual artifact: the end-of-round panel (boards recap + score table).
  await pageA.waitForSelector("text=Fin de la manche", { timeout: 15_000 });
  await pageA.screenshot({ path: "e2e-artifacts/round-over.png" });
  await pageA.getByRole("button", { name: "Manche suivante" }).click();
  await pageA.waitForSelector("text=En attente de Bob", { timeout: 15_000 });
  check(true, "A attend le prêt de B");
  await pageB.getByRole("button", { name: "Manche suivante" }).click();
  await waitSnap(pageA, (s) => s.round === 2 && s.phase === "setup", "A manche 2");
  await waitSnap(pageB, (s) => s.round === 2 && s.phase === "setup", "B manche 2");
  check(true, "les deux appareils passent en manche 2");

  // ---- 7. Refresh mid-game ----------------------------------------------------
  console.log("▶ 7. rafraîchissement en pleine partie (A)");
  // Advance a few moves into round 2 first.
  await playUntil(pages, (s) => s.phase === "draw" || s.phase === "decide", "in round 2", 40);
  const before = await snapOf(pageA);
  await pageA.reload();
  const after = await waitSnap(
    pageA,
    (s) => s.status === "playing" && s.round === before.round,
    "A restauré après refresh",
    45_000
  );
  check(
    JSON.stringify(after.grids) === JSON.stringify(before.grids) &&
      after.currentPlayer === before.currentPlayer,
    "état identique après refresh (grilles, tour)"
  );
  const bSide = await snapOf(pageB);
  check(
    JSON.stringify(after.grids) === JSON.stringify(bSide.grids),
    "toujours synchronisé avec B"
  );

  // ---- 8. Disconnect / reconnect ---------------------------------------------
  console.log("▶ 8. déconnexion de B, bannière côté A, retour de B");
  await pageB.close();
  await waitSnap(
    pageA,
    (s) => s.players[1]?.online === false,
    "A voit B hors ligne",
    30_000
  );
  await pageA.waitForSelector("text=est déconnecté", { timeout: 10_000 });
  check(true, "bannière de déconnexion affichée");
  const pageB2 = await ctxB.newPage();
  wirePage("B2", pageB2);
  await pageB2.goto(BASE);
  // The app lands straight back in the game thanks to the stored session.
  await waitSnap(pageB2, (s) => s.status === "playing", "B revenu dans la partie", 45_000);
  await waitSnap(pageA, (s) => s.players[1]?.online === true, "A revoit B en ligne");
  check(true, "reconnexion transparente (session locale + uid anonyme)");

  // ---- 9. Play (greedy) until the score limit ends the game -------------------
  console.log("▶ 9. jusqu'à la fin de partie (manches + révélations)");
  const pages2 = [pageA, pageB2];
  const endA = await playUntil(
    pages2,
    (s) => s.phase === "gameOver",
    "fin de partie par score",
    2000,
    { autoRounds: true, keepMax: 12 }
  );
  const endB = await waitSnap(pageB2, (s) => s.phase === "gameOver", "B fin de partie");
  check(
    JSON.stringify(endA.totals) === JSON.stringify(endB.totals),
    `totaux finaux identiques (${JSON.stringify(endA.totals)}, ${endA.roundScores[0].length} manches)`
  );
  check(
    endA.grids.flat().every((v) => v !== "?"),
    "toutes les cartes révélées en fin de partie"
  );
  check(
    Math.max(...endA.totals) >= 150,
    "la limite de score (150) a bien conclu la partie"
  );
  const winnerSeat = endA.totals[0] <= endA.totals[1] ? 0 : 1;
  const winnerPage = winnerSeat === 0 ? pageA : pageB2;
  await winnerPage.waitForSelector("text=Vous gagnez !", { timeout: 15_000 });
  check(true, "le vainqueur voit sa victoire");

  // ---- 10. Rematch --------------------------------------------------------------
  console.log("▶ 10. revanche");
  await pageA.getByRole("button", { name: "Proposer une revanche" }).click();
  await waitSnap(pageA, (s) => s.status === "lobby", "A dans le lobby de revanche");
  await pageB2.getByRole("button", { name: "Rejoindre la revanche" }).click();
  await waitSnap(pageA, (s) => s.status === "playing" && s.round === 1, "revanche lancée (A)");
  const rematchB = await waitSnap(
    pageB2,
    (s) => s.status === "playing" && s.round === 1,
    "revanche lancée (B)"
  );
  check(
    rematchB.totals[0] === 0 && rematchB.totals[1] === 0,
    "revanche : partie neuve, scores remis à zéro"
  );

  // ---- 11. Abandon ----------------------------------------------------------------
  console.log("▶ 11. abandon (B)");
  await pageB2.getByRole("button", { name: "Menu" }).click();
  await pageB2.getByRole("button", { name: "Abandonner la partie" }).click();
  await pageB2.getByRole("button", { name: "Confirmer l'abandon" }).click();
  await waitSnap(pageA, (s) => s.result?.reason === "abandon", "A reçoit l'abandon");
  await pageA.waitForSelector("text=Bob a abandonné la partie", { timeout: 15_000 });
  check(true, "A voit la victoire par abandon");
  await pageB2.waitForSelector("text=Vous avez abandonné la partie", {
    timeout: 15_000,
  });
  check(true, "B voit sa défaite par abandon");

  // ---- 12. Four players: lobby, auto-start, sync, forfeits --------------------
  console.log("▶ 12. partie à 4 joueurs");
  await backHome(pageA);
  const lobby4 = await createGame(pageA, 4);
  const code4 = lobby4.code;
  check(lobby4.maxPlayers === 4 && lobby4.players.length === 1, "salon 1/4 ouvert");

  await backHome(pageB2);
  await pageB2.goto(`${BASE}?join=${code4}`); // auto-join (name known)
  await waitSnap(pageA, (s) => s.players.length === 2, "B assis (2/4)");
  const early = await waitSnap(pageA, (s) => s.canStartEarly === true, "hôte peut démarrer à 2");
  check(early.status === "lobby", "salon toujours en attente à 2/4");
  await pageA.waitForSelector("text=Commencer à 2 joueurs", { timeout: 10_000 });
  check(true, "bouton de démarrage anticipé visible (hôte)");
  await pageA.screenshot({ path: "e2e-artifacts/lobby-4p.png" });

  const ctxD = await browser.newContext(phone);
  const ctxE = await browser.newContext(phone);
  const pageD = await ctxD.newPage();
  const pageE = await ctxE.newPage();
  wirePage("D", pageD);
  wirePage("E", pageE);
  for (const [page, name] of [
    [pageD, "Dave"],
    [pageE, "Eve"],
  ]) {
    await page.goto(`${BASE}?join=${code4}`);
    await page.getByPlaceholder("Votre nom").fill(name);
    await page.getByRole("button", { name: "Rejoindre" }).click();
  }
  const pages4 = [pageA, pageB2, pageD, pageE];
  const started4 = [];
  for (const page of pages4) {
    started4.push(
      await waitSnap(page, (s) => s.status === "playing", "4/4 → démarrage auto", 45_000)
    );
  }
  check(
    started4.every((s) => s.playerCount === 4 && s.maxPlayers === 4),
    "démarrage automatique à 4/4"
  );
  check(
    JSON.stringify(started4[0].names) === JSON.stringify(["Alice", "Bob", "Dave", "Eve"]) &&
      new Set(started4.map((s) => s.mySeat)).size === 4,
    "quatre sièges distincts, noms corrects"
  );

  console.log("▶ 13. attaques sur les règles (multi)");
  await multiAttacks(code4, pageA);

  console.log("▶ 14. manche complète à 4, synchronisée");
  const r4 = await playUntil(
    pages4,
    (s) => s.roundScores?.[0]?.length >= 1,
    "manche 1 (4 joueurs) terminée",
    1600
  );
  const sides4 = [];
  for (const page of pages4) {
    sides4.push(
      await waitSnap(page, (s) => s.roundScores?.[0]?.length >= 1, "fin de manche partout")
    );
  }
  check(
    sides4.every(
      (s) =>
        JSON.stringify(s.totals) === JSON.stringify(r4.totals) &&
        JSON.stringify(s.grids) === JSON.stringify(r4.grids)
    ),
    `grilles et totaux identiques sur les 4 appareils (${JSON.stringify(r4.totals)})`
  );
  await pageA.screenshot({ path: "e2e-artifacts/round-over-4p.png" });

  if (r4.phase !== "gameOver") {
    console.log("▶ 15. manche suivante à 4 (tous prêts)");
    for (const page of pages4) {
      await page.getByRole("button", { name: "Manche suivante" }).click({ timeout: 15_000 });
    }
    for (const page of pages4) {
      await waitSnap(page, (s) => s.round === 2 && s.phase === "setup", "manche 2 partout");
    }
    check(true, "les 4 appareils passent en manche 2");
    // Board artifact: my board + the opponents strip.
    await playUntil(pages4, (s) => s.phase === "draw" || s.phase === "decide", "milieu de manche 2", 60);
    await pageA.screenshot({ path: "e2e-artifacts/board-4p.png" });
  } else {
    console.log("▶ 15. (fin de partie dès la manche 1 — poignée de main non testée à 4)");
  }

  console.log("▶ 16. abandon en cours de partie à 4 (Eve) — la table continue");
  await pageE.getByRole("button", { name: "Menu" }).click();
  await pageE.getByRole("button", { name: "Abandonner la partie" }).click();
  await pageE.getByRole("button", { name: "Confirmer l'abandon" }).click();
  const afterForfeit = await waitSnap(
    pageA,
    (s) => s.outs?.[3] === true,
    "A voit le forfait d'Eve",
    30_000
  );
  check(afterForfeit.status === "playing", "la partie continue à 3");
  check(afterForfeit.result === null, "pas de fin de partie sur un forfait à 4");
  await ctxE.close();

  // The turn rotation must now skip seat 3 — play a good stretch to verify.
  const pages3 = [pageA, pageB2, pageD];
  let sawTurns = 0;
  for (let i = 0; i < 60; i++) {
    const s = await snapOf(pageA);
    if (!s || s.phase === "gameOver") break;
    check(s.currentPlayer !== 3 || s.phase === "roundOver", "le tour ne revient jamais à Eve");
    if (s.currentPlayer === 3 && s.phase !== "roundOver") break;
    sawTurns++;
    let acted = false;
    for (const page of pages3) {
      if (await actOnce(page, { autoRounds: true })) {
        acted = true;
        break;
      }
    }
    if (i % 15 !== 0) {
      // keep the log terse: only assert every 15 steps
    }
    await sleep(acted ? 120 : 180);
  }
  check(sawTurns >= 40, "la partie à 3 (ex-4) avance normalement");

  console.log("▶ 17. départs en cascade → dernier joueur en lice");
  for (const [page, label] of [
    [pageD, "Dave"],
    [pageB2, "Bob"],
  ]) {
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Abandonner la partie" }).click();
    await page.getByRole("button", { name: "Confirmer l'abandon" }).click();
    console.log(`  (${label} quitte)`);
    await sleep(800);
  }
  await waitSnap(
    pageA,
    (s) => s.result?.reason === "forfeit" && s.result?.winner === 0,
    "victoire du dernier joueur en lice",
    60_000
  );
  await pageA.waitForSelector("text=Tous les autres joueurs ont quitté la partie", {
    timeout: 15_000,
  });
  check(true, "Alice gagne : tous les autres ont quitté");
  await ctxD.close();

  // ---- 18. Early start: 2 players on a 3-seat lobby ---------------------------
  console.log("▶ 18. démarrage anticipé (2 joueurs sur un salon de 3)");
  await backHome(pageA);
  const lobby3 = await createGame(pageA, 3);
  const code3 = lobby3.code;
  await backHome(pageB2);
  await pageB2.goto(`${BASE}?join=${code3}`);
  await waitSnap(pageA, (s) => s.canStartEarly === true, "2/3 assis");
  await pageA.getByRole("button", { name: /Commencer à 2 joueurs/ }).click();
  const early3 = await waitSnap(pageA, (s) => s.status === "playing", "démarrage anticipé");
  const early3b = await waitSnap(pageB2, (s) => s.status === "playing", "B suit");
  check(
    early3.playerCount === 2 && early3.maxPlayers === 3 && early3b.playerCount === 2,
    "partie à 2 joueurs sur une donne de 3 grilles"
  );
  // A few synchronised moves on the odd-sized deal.
  await playUntil([pageA, pageB2], (s) => s.phase === "decide" || s.phase === "flip" || s.phase === "replace", "quelques coups", 60);
  const e3a = await snapOf(pageA);
  const e3b = await snapOf(pageB2);
  check(
    JSON.stringify(e3a.grids) === JSON.stringify(e3b.grids) && e3a.deck === e3b.deck,
    "synchronisation OK avec des sièges vides"
  );
  await pageA.getByRole("button", { name: "Menu" }).click();
  await pageA.getByRole("button", { name: "Abandonner la partie" }).click();
  await pageA.getByRole("button", { name: "Confirmer l'abandon" }).click();
  await waitSnap(pageB2, (s) => s.result?.reason === "abandon", "abandon classique à 2");
  check(true, "à 2 joueurs, l'abandon reste une victoire immédiate de l'autre");

  // ---- 19. Exclude an absent player (slow: requires 60s+ absence) -------------
  if (!FAST) {
    console.log("▶ 19. exclusion d'un joueur absent (3 joueurs, ≈80s)");
    await backHome(pageA);
    const lobbyX = await createGame(pageA, 3);
    await backHome(pageB2);
    await pageB2.goto(`${BASE}?join=${lobbyX.code}`);
    const ctxF = await browser.newContext(phone);
    const pageF = await ctxF.newPage();
    await pageF.goto(`${BASE}?join=${lobbyX.code}`);
    await pageF.getByPlaceholder("Votre nom").fill("Fanny");
    await pageF.getByRole("button", { name: "Rejoindre" }).click();
    await waitSnap(pageA, (s) => s.status === "playing", "partie à 3 lancée", 45_000);
    // Fanny vanishes immediately; the others play on until her turn stalls
    // the table, then the exclusion becomes available (60s rules-side).
    await pageF.close();
    const claimSnap = await playUntil(
      [pageA, pageB2],
      (s) => s.players?.some((p) => p.canExclude === true),
      "exclusion proposée après absence",
      900
    );
    const fSeat = claimSnap.players.findIndex((p) => p.canExclude);
    check(fSeat >= 0 && claimSnap.players[fSeat].name === "Fanny",
      "exclusion proposée pour la joueuse absente");
    // The exclude affordance lives on the stalled banner (board) or the
    // round-over panel, depending on where the game is blocked.
    const excludeBtn = pageA
      .getByRole("button", { name: /Exclure|Continuer sans Fanny/ })
      .first();
    await excludeBtn.click({ timeout: 10_000 });
    await waitSnap(pageA, (s) => s.outs?.[fSeat] === true, "Fanny exclue", 30_000);
    const contSnap = await snapOf(pageA);
    check(contSnap.status === "playing", "la partie continue à 2 après exclusion");
    await playUntil([pageA, pageB2], (s) => s.phase === "draw" || s.phase === "decide", "reprise à 2", 60);
    check(true, "le tour circule entre les joueurs restants");
    await ctxF.close();
    // Wind the game down.
    await pageB2.getByRole("button", { name: "Menu" }).click();
    await pageB2.getByRole("button", { name: "Abandonner la partie" }).click();
    await pageB2.getByRole("button", { name: "Confirmer l'abandon" }).click();
    await waitSnap(pageA, (s) => s.result !== null, "partie close", 30_000);
  } else {
    console.log("▶ 19. (sauté en mode --fast)");
  }

  // ---- 20. Claim victory in a duel (slow: requires 60s+ absence) --------------
  if (!FAST) {
    console.log("▶ 20. victoire réclamée après absence (duel, ≈80s)");
    await backHome(pageA);
    await createGame(pageA, 2);
    const lobby2 = await snapOf(pageA);
    await backHome(pageB2);
    await pageB2.goto(`${BASE}?join=${lobby2.code}`); // auto-join (name known)
    await waitSnap(pageA, (s) => s.status === "playing", "duel 2 lancé");
    await pageB2.close();
    await waitSnap(pageA, (s) => s.players?.[1]?.online === false, "B parti");
    const claimable = await waitSnap(
      pageA,
      (s) => s.canClaimVictory,
      "bouton de réclamation disponible",
      120_000
    );
    check(claimable.canClaimVictory, "réclamation proposée après absence");
    await pageA.getByRole("button", { name: "Réclamer la victoire" }).click();
    await waitSnap(pageA, (s) => s.result?.reason === "claim", "victoire réclamée");
    await pageA.waitForSelector("text=votre adversaire a quitté", {
      timeout: 15_000,
    });
    check(true, "victoire réclamée validée par les règles (60s)");
  } else {
    console.log("▶ 20. (sauté en mode --fast)");
  }

  await browser.close();
  console.log(
    failures === 0
      ? "\n✅ e2e OK — tous les scénarios passent"
      : `\n❌ e2e: ${failures} échec(s)`
  );
  // Exit explicitly: the piped stdio of the emulator/vite children keeps the
  // event loop alive, so the process would otherwise hang after the verdict.
  cleanup();
  process.exit(failures === 0 ? 0 : 1);
};

// ---------------------------------------------------------------------------
// Direct attacks with the Firebase SDK (no UI): verify the rules hold.
// ---------------------------------------------------------------------------

const attackerApp = async () => {
  const { initializeApp } = await import("firebase/app");
  const { getAuth, connectAuthEmulator, signInAnonymously } = await import(
    "firebase/auth"
  );
  const { getDatabase, connectDatabaseEmulator, ref, get, set } = await import(
    "firebase/database"
  );
  const app = initializeApp(
    {
      apiKey: "fake",
      projectId: "four-columns-duels",
      databaseURL:
        "https://four-columns-duels-default-rtdb.europe-west1.firebasedatabase.app",
    },
    `attacker-${Math.random().toString(36).slice(2)}`
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
  await signInAnonymously(auth);
  return { db, ref, get, set };
};

const denied = async (promise) => {
  try {
    await promise;
    return false;
  } catch (e) {
    return (
      String(e).includes("Permission denied") ||
      String(e).includes("permission_denied")
    );
  }
};

/**
 * A *seated* player probing with direct SDK access under their real
 * credentials (window.__4cfb is a dev-only handle).
 */
const memberProbe = (page, code, expr) =>
  page.evaluate(async ({ code, expr }) => {
    const fb = window.__4cfb;
    if (!fb) return "no-handle";
    const denied = async (p) => {
      try {
        await p;
        return false;
      } catch (e) {
        return String(e).toLowerCase().includes("permission");
      }
    };
    const { db, ref, get, set } = fb;
    switch (expr) {
      case "oppCard":
        return denied(get(ref(db, `secrets/${code}/r1/g1/0`)));
      case "myCard":
        return denied(get(ref(db, `secrets/${code}/r1/g0/0`)));
      case "pileAhead":
        return denied(get(ref(db, `secrets/${code}/r1/p/50`)));
      case "forgeValue":
        // Turn holder writes a draw action with a spoofed value (and in the
        // wrong phase) — the rules must reject it.
        return denied(
          set(ref(db, `games/${code}/rounds/r1/actions/a0000`), {
            seat: "0",
            type: "draw",
            ref: "p/1",
            value: 99,
          })
        );
      case "outOfTurn":
        // The guest (seat 1) acts while it is seat 0's turn.
        return denied(
          set(ref(db, `games/${code}/rounds/r1/actions/a0000`), {
            seat: "1",
            type: "reveal",
            index: 0,
            ref: "g1/0",
            value: 0,
          })
        );
      case "forfeitOnline":
        // Flag a *connected* player as forfeited: rules demand their own
        // uid, a leave intent, or a verified 60s absence.
        return denied(set(ref(db, `games/${code}/forfeits/1`), true));
      case "restartTamper":
        // The start is pinned once; nobody can rewrite the player count.
        return denied(set(ref(db, `games/${code}/start/count`), 2));
      default:
        return "unknown";
    }
  }, { code, expr });

const rulesAttacks = async (code, hostPage, guestPage) => {
  const { db, ref, get, set } = await attackerApp();

  // A stranger (authenticated, knows the code) cannot read game or secrets.
  check(
    await denied(get(ref(db, `games/${code}/rounds/r1/actions`))),
    "étranger : lecture du journal refusée"
  );
  check(
    await denied(get(ref(db, `secrets/${code}/r1/g0/0`))),
    "étranger : lecture d'une carte secrète refusée"
  );
  check(
    await denied(get(ref(db, `secrets/${code}/r1/p/1`))),
    "étranger : lecture de la pioche refusée"
  );
  check(
    await denied(
      set(ref(db, `games/${code}/rounds/r1/actions/a0000`), {
        seat: "0",
        type: "draw",
        ref: "p/1",
        value: 5,
      })
    ),
    "étranger : écriture d'une action refusée"
  );
  check(
    await denied(set(ref(db, `games/${code}/state/turn`), "1")),
    "étranger : falsification de l'état refusée"
  );
  check(
    await denied(
      set(ref(db, `games/${code}/result`), {
        winner: 1,
        reason: "abandon",
        by: "0",
      })
    ),
    "étranger : écriture du résultat refusée"
  );

  check(
    (await memberProbe(hostPage, code, "oppCard")) === true,
    "joueur assis : carte adverse illisible"
  );
  check(
    (await memberProbe(hostPage, code, "myCard")) === true,
    "joueur assis : sa propre carte cachée illisible (sans peek légal)"
  );
  check(
    (await memberProbe(hostPage, code, "pileAhead")) === true,
    "joueur assis : pioche non consultable à l'avance"
  );
  check(
    (await memberProbe(hostPage, code, "forgeValue")) === true,
    "joueur assis : action avec valeur falsifiée refusée"
  );
  check(
    (await memberProbe(guestPage, code, "outOfTurn")) === true,
    "joueur assis : action hors de son tour refusée"
  );
};

const multiAttacks = async (code, hostPage) => {
  const { db, ref, get, set } = await attackerApp();

  check(
    await denied(set(ref(db, `games/${code}/seats/4`), { uid: "x", name: "X" })),
    "étranger : siège au-delà du démarrage refusé"
  );
  check(
    await denied(get(ref(db, `secrets/${code}/r1/g3/0`))),
    "étranger : carte du 4e joueur illisible"
  );
  check(
    (await memberProbe(hostPage, code, "forfeitOnline")) === true,
    "joueur assis : impossible d'exclure un joueur connecté"
  );
  check(
    (await memberProbe(hostPage, code, "restartTamper")) === true,
    "joueur assis : nombre de joueurs verrouillé après démarrage"
  );
  check(
    (await memberProbe(hostPage, code, "oppCard")) === true,
    "joueur assis : cartes des autres joueurs illisibles"
  );
};

const cleanup = () => {
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      try {
        c.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
  }
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

main().catch(async (e) => {
  console.error("\n❌ e2e failed:", e);
  // Post-mortem: dump the emulator's game trees (owner token bypasses rules)
  // so a corrupted/stalled log can be analysed without re-running.
  try {
    const res = await fetch(
      "http://127.0.0.1:9000/games.json?ns=four-columns-duels-default-rtdb&access_token=owner"
    );
    console.error("--- games dump ---");
    console.error(JSON.stringify(await res.json()));
    console.error("--- end dump ---");
  } catch {
    /* emulator already gone */
  }
  cleanup();
  process.exit(1);
});
