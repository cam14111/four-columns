// End-to-end test of the online duel mode against the Firebase emulators.
//
// Boots the Auth + Realtime Database emulators (with the real security rules)
// and the Vite dev server, then drives two Chromium pages — two "phones" —
// through real UI interactions: create, share code, join, play full rounds,
// refresh mid-game, disconnect, abandon, claim, error cases, and direct
// database attacks against the rules.
//
//   node scripts/e2e-online.mjs            # full suite (includes a ~70s claim wait)
//   node scripts/e2e-online.mjs --fast     # skip the slow claim-victory case
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
      phase: s.game?.phase ?? null,
      round: s.game?.round ?? null,
      currentPlayer: s.game?.currentPlayer ?? null,
      totals: s.game?.players.map((p) => p.totalScore) ?? null,
      roundScores: s.game?.players.map((p) => p.roundScores) ?? null,
      held: s.game?.held?.value ?? null,
      awaitingReveal: s.awaitingReveal,
      corrupted: s.corrupted,
      busy: s.busy,
      connected: s.connected,
      opponentOnline: s.opponentOnline,
      canClaimVictory: s.canClaimVictory,
      result: s.result,
      code: s.code,
      names: s.names,
      nextReady: s.nextReady,
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
  throw new Error(
    `timeout: ${label}\nlast snapshot: ${JSON.stringify(last, null, 2)}`
  );
};

/** Performs one legal UI interaction when it's this page's turn. */
const actOnce = async (page, opts = {}) => {
  const { autoRounds = false, keepMax = 5 } = opts;
  const s = await snapOf(page);
  if (!s || s.busy) return false;
  // End-of-round panel: press "Manche suivante" once (ready handshake).
  if (autoRounds && s.phase === "roundOver" && !s.nextReady?.me && !s.result) {
    try {
      await page
        .getByRole("button", { name: "Manche suivante" })
        .click({ timeout: 2500 });
      return true;
    } catch {
      return false; // panel not shown yet (reveal delay)
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

/** Plays both pages until the predicate matches (or a step budget runs out). */
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
  console.log("▶ environment ready");

  // Use the pre-provisioned Chromium if the pinned playwright build isn't
  // downloaded (e.g. sandboxed environments with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).
  const executablePath = process.env.E2E_CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium.launch(
    (await import("node:fs")).existsSync(executablePath)
      ? { executablePath }
      : {}
  );
  const ctxA = await browser.newContext(); // "phone" A (host)
  const ctxB = await browser.newContext(); // "phone" B (guest)
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  for (const [name, page] of [["A", pageA], ["B", pageB]]) {
    page.on("pageerror", (e) => console.error(`  [${name}] pageerror:`, e));
    page.on("console", (m) => {
      const text = m.text();
      if (m.type() === "warning" && text.includes("FIREBASE")) {
        console.error(`  [${name}] ${text.slice(0, 200)}`);
      }
    });
  }

  // ---- 1. Create a game -----------------------------------------------------
  console.log("▶ 1. création de la partie (A)");
  await pageA.goto(BASE);
  await pageA.getByRole("button", { name: "En ligne" }).click();
  await pageA.getByPlaceholder("Vous").fill("Alice");
  await pageA.getByRole("button", { name: "Jouer en ligne" }).click();
  await pageA.getByRole("button", { name: "Créer une partie" }).click();
  await pageA.waitForSelector("text=Partie créée !", { timeout: 30_000 });
  const lobbyA = await waitSnap(pageA, (s) => s.status === "lobby", "A lobby");
  const code = lobbyA.code;
  check(/^[A-Z0-9]{6}$/.test(code), `code de partie généré (${code})`);

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

  // Name is remembered, so the deep link joins automatically.
  await pageB.goto(`${BASE}?join=${code}`);
  await waitSnap(pageB, (s) => s.status === "playing", "B in game");
  const sA = await waitSnap(pageA, (s) => s.status === "playing", "A in game");
  check(sA.names[0] === "Alice" && sA.names[1] === "Bob", "sièges et noms corrects");

  // ---- 3. A third player cannot join ----------------------------------------
  console.log("▶ 3. partie pleine (C)");
  const ctxC = await browser.newContext();
  const pageC = await ctxC.newPage();
  await pageC.goto(`${BASE}?join=${code}`);
  await pageC.getByPlaceholder("Votre nom").fill("Carol");
  await pageC.getByRole("button", { name: "Rejoindre" }).click();
  await pageC.waitForSelector("text=Cette partie a déjà deux joueurs", {
    timeout: 20_000,
  });
  check(true, "3e joueur refusé");
  await ctxC.close();

  // ---- 4. Direct database attacks against the rules -------------------------
  console.log("▶ 4. attaques directes sur la base (règles)");
  await rulesAttacks(code, pageA, pageB);

  // ---- 5. Play a full round --------------------------------------------------
  console.log("▶ 5. première manche complète");
  const pages = [pageA, pageB];
  const roundOverA = await playUntil(
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

  // ---- 6. Next round via the double-ready handshake --------------------------
  console.log("▶ 6. manche suivante (double prêt)");
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
  await waitSnap(pageA, (s) => s.opponentOnline === false, "A voit B hors ligne", 30_000);
  await pageA.waitForSelector("text=est déconnecté", { timeout: 10_000 });
  check(true, "bannière de déconnexion affichée");
  const pageB2 = await ctxB.newPage();
  await pageB2.goto(BASE);
  // The app lands straight back in the duel thanks to the stored session.
  await waitSnap(pageB2, (s) => s.status === "playing", "B revenu dans le duel", 45_000);
  await waitSnap(pageA, (s) => s.opponentOnline === true, "A revoit B en ligne");
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
    Math.max(...endA.totals) >= 100,
    "la limite de score a bien conclu la partie"
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

  // ---- 12. Claim victory (slow: requires 60s+ absence) -------------------------
  if (!FAST) {
    console.log("▶ 12. victoire réclamée après absence (≈80s)");
    // Fresh game between A and B.
    await pageA.getByRole("button", { name: "Menu principal" }).click();
    await pageA.getByRole("button", { name: "Jouer en ligne" }).click();
    await pageA.getByRole("button", { name: "Créer une partie" }).click();
    const lobby2 = await waitSnap(pageA, (s) => s.status === "lobby", "A lobby 2");
    await pageB2.getByRole("button", { name: "Menu principal" }).click();
    await pageB2.goto(`${BASE}?join=${lobby2.code}`); // auto-join (name known)
    await waitSnap(pageA, (s) => s.status === "playing", "partie 2 lancée");
    await pageB2.close();
    await waitSnap(pageA, (s) => !s.opponentOnline, "B parti");
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
    console.log("▶ 12. (sauté en mode --fast)");
  }

  await browser.close();
  console.log(
    failures === 0
      ? "\n✅ e2e OK — tous les scénarios passent"
      : `\n❌ e2e: ${failures} échec(s)`
  );
  process.exitCode = failures === 0 ? 0 : 1;
};

// ---------------------------------------------------------------------------
// Direct attacks with the Firebase SDK (no UI): verify the rules hold.
// ---------------------------------------------------------------------------

const rulesAttacks = async (code, hostPage, guestPage) => {
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
    "attacker"
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
  await signInAnonymously(auth);

  const denied = async (promise) => {
    try {
      await promise;
      return false;
    } catch (e) {
      return String(e).includes("Permission denied") || String(e).includes("permission_denied");
    }
  };

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
        seat: 0,
        type: "draw",
        ref: "p/1",
        value: 5,
      })
    ),
    "étranger : écriture d'une action refusée"
  );
  check(
    await denied(set(ref(db, `games/${code}/state/turn`), 1)),
    "étranger : falsification de l'état refusée"
  );
  check(
    await denied(
      set(ref(db, `games/${code}/result`), { winner: 1, reason: "abandon", by: 0 })
    ),
    "étranger : écriture du résultat refusée"
  );

  // A *seated* player cannot read the opponent's face-down cards, peek the
  // pile, lie about a drawn value, or act out of turn — with direct SDK
  // access under their real credentials (window.__4cfb is a dev-only handle).
  const memberProbe = (page, expr) =>
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
              seat: 0,
              type: "draw",
              ref: "p/1",
              value: 99,
            })
          );
        case "outOfTurn":
          // The guest (seat 1) acts while it is seat 0's turn.
          return denied(
            set(ref(db, `games/${code}/rounds/r1/actions/a0000`), {
              seat: 1,
              type: "reveal",
              index: 0,
              ref: "g1/0",
              value: 0,
            })
          );
        default:
          return "unknown";
      }
    }, { code, expr });

  check(
    (await memberProbe(hostPage, "oppCard")) === true,
    "joueur assis : carte adverse illisible"
  );
  check(
    (await memberProbe(hostPage, "myCard")) === true,
    "joueur assis : sa propre carte cachée illisible (sans peek légal)"
  );
  check(
    (await memberProbe(hostPage, "pileAhead")) === true,
    "joueur assis : pioche non consultable à l'avance"
  );
  check(
    (await memberProbe(hostPage, "forgeValue")) === true,
    "joueur assis : action avec valeur falsifiée refusée"
  );
  check(
    (await memberProbe(guestPage, "outOfTurn")) === true,
    "joueur assis : action hors de son tour refusée"
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

main().catch((e) => {
  console.error("\n❌ e2e failed:", e);
  cleanup();
  process.exit(1);
});
