# 4 Columns

**4 Columns** est un jeu de cartes qui tourne entièrement dans le navigateur,
jouable en **solo** (un joueur humain contre une IA), à **deux joueurs sur le
même téléphone** (mode « chacun son tour » ou « face à face ») ou **en ligne
de 2 à 8 joueurs** (chacun sur son téléphone, synchronisés en temps réel via
Firebase — sans compte à créer).

C'est une **PWA** (Progressive Web App) : installable sur mobile et ordinateur,
et **jouable hors-ligne** une fois chargée (modes solo et local).

Le but : révéler et remplacer les cartes de sa grille de 4 colonnes pour
obtenir le plus petit total possible.

## Fonctionnalités

- **Moteur de jeu pur et testé** (`src/game/`) : toutes les règles (mise en
  place, pioche/défausse, remplacement, colonnes identiques — y compris celles
  complétées par la révélation de fin de manche —, dernier tour, doublement du
  score) vivent dans un réducteur pur, couvert par des tests unitaires.
- **Reprise de partie** : la partie en cours est sauvegardée localement à
  chaque coup et survit à un rechargement ou à la fermeture de la PWA par
  l'OS (« Reprendre la partie » sur l'écran d'accueil).
- **IA à 3 niveaux** (Facile / Normal / Expert) fondée sur un modèle de valeur
  espérée, avec conscience de fin de manche en mode Expert.
- **Mode 2 joueurs local** (deux humains sur un seul appareil), avec deux
  affichages permutables **en cours de partie** via un bouton sur le plateau :
  - *Passe le téléphone* : la grille du joueur actif passe en bas de l'écran,
    agrandie et jouable, et bascule automatiquement quand le tour change.
  - *Face à face* : chaque joueur garde un côté fixe de l'appareil, sa grille
    orientée vers lui (la moitié adverse est pivotée à 180°), et la pioche/
    défausse s'affiche dans le sens du joueur dont c'est le tour.
- **Interface mobile-first** : grille du joueur à portée du pouce, animations de
  distribution et de retournement 3D, surbrillance des cibles jouables,
  indicateur de « dernier tour ».
- **Mode en ligne, 2 à 8 joueurs** : partie privée créée en un tap (l'hôte
  choisit le nombre de sièges), invitation par **code à 6 caractères ou lien
  de partage**, salon d'attente en direct, démarrage automatique quand tout le
  monde est là (ou **démarrage anticipé** par l'hôte dès 2 joueurs assis),
  synchronisation temps réel (Firebase Realtime Database + authentification
  anonyme), présence de chacun, reconnexion transparente après un
  rafraîchissement ou une coupure réseau, abandon (à 3+ joueurs **la table
  continue sans le partant**), **exclusion d'un joueur absent** validée côté
  base (60 s), victoire réclamée dans les duels, manches enchaînées quand tous
  les joueurs sont prêts et revanche en un tap. L'interface s'adapte : duel
  classique à 2, bande d'adversaires compacte et défilante à 3-8.
  La triche est bloquée **côté base de données** (règles de sécurité) : cartes
  cachées illisibles, jeu hors tour impossible, valeurs piochées vérifiées
  contre les secrets. Voir « Mode en ligne » ci-dessous.
- **Sons synthétisés** (Web Audio, aucun fichier audio) et **retour haptique**
  (vibrations) — désactivables.
- **Statistiques persistantes** (parties, victoires, séries, colonnes vidées,
  meilleurs scores) et **écran de règles** intégré.
- **Fin de partie festive** (confettis en canvas) et récapitulatif des manches.

## Architecture

- `src/game/` — moteur pur, sans dépendance à React :
  `types.ts`, `deck.ts`, `engine.ts` (réducteur `reduce(state, action)`),
  `ai.ts` (politique de l'IA), `settings.ts`, `stats.ts`.
- `src/hooks/useGame.ts` — pont React : pilote les tours de l'IA, joue les
  sons/vibrations et enregistre les statistiques.
- `src/online/` — mode en ligne 2-8 joueurs (chargé **paresseusement**, la PWA
  hors-ligne n'en dépend pas) :
  - `protocol.ts` — schéma du protocole (codes de partie, donne, actions,
    références de cartes) ;
  - `replay.ts` — projection **déterministe** : (donne + journal d'actions) →
    `GameState` via le moteur pur, tous les téléphones rejouent le même
    journal et sont identiques par construction (forfaits inclus, ordonnés
    dans le journal) ;
  - `client.ts` — client Realtime Database (créer/rejoindre/reprendre,
    présence, écritures d'actions avec divulgation contrôlée des secrets,
    auto-réparation après crash/refresh) ;
  - `firebase.ts`, `session.ts` — bootstrap SDK et session locale.
- `src/hooks/useOnlineDuel.ts` + `src/ui/OnlineMode.tsx` — pont React et
  écrans du mode en ligne (setup, lobby, plateau, fins de partie).
- `src/ui/` — composants d'affichage (écrans, plateau, cartes, superpositions).
- `database.rules.json` — règles de sécurité RTDB (voir « Mode en ligne »).
- Tests : `src/game/__tests__/` et `src/online/__tests__/` (Vitest), plus
  `scripts/e2e-online.mjs` (bout en bout à deux navigateurs sur émulateurs).

## Stockage des données

Les modes solo et local n'ont **pas de base de données**. Tout est conservé
localement via **`localStorage`** :

- `four-columns:settings` — nom, difficulté, limite de score, sons, vibrations.
- `four-columns:stats` — statistiques cumulées.
- `four-columns:game` — partie en cours (reprise après rechargement).
- `four-columns:online-session` — pointeur vers la partie en ligne en cours
  (code + siège), pour la reprise automatique.

Solo et local fonctionnent hors-ligne, gratuitement, sur un seul appareil.
Seul le mode **en ligne** échange des données, exclusivement avec votre
projet Firebase.

> Note : des versions précédentes utilisaient Supabase puis un historique local
> par manche ; ces mécanismes ont été remplacés par ce stockage minimal.

## Mode en ligne (2 à 8 joueurs, chacun son téléphone)

### Comment ça marche

- **Créer** : écran d'accueil → « En ligne » → choisir le **nombre de
  joueurs** (2 à 8) → « Créer une partie ». Un code à 6 caractères (et un lien
  `…/?join=CODE`) est généré à partager. Le salon affiche les sièges qui se
  remplissent ; la partie démarre automatiquement quand tout le monde est là,
  et l'hôte peut aussi **commencer plus tôt** avec les joueurs déjà assis.
- **Rejoindre** : via le lien, ou « En ligne » → saisir le code. Aucun compte :
  l'authentification est **anonyme** (l'identité persiste sur l'appareil, ce
  qui permet la reprise).
- **Fiabilité** : rafraîchissement, fermeture de l'app, coupure réseau →
  retour automatique dans la partie, à l'état exact. Présence de chacun
  affichée en direct. Dans un duel, si l'adversaire disparaît plus d'une
  minute, vous pouvez **réclamer la victoire** ; à 3 joueurs et plus, un
  joueur absent qui bloque la table peut être **exclu** (les règles vérifient
  60 s d'absence réelle) et la partie continue sans lui — comme après un
  abandon volontaire. Les manches s'enchaînent quand **tous** les joueurs
  encore en lice sont prêts ; revanche en un tap à la fin.
- **Interface** : à 2 joueurs, le duel classique (adversaire en miroir en
  haut) ; à 3 joueurs et plus, votre plateau reste en grand en bas et les
  adversaires occupent une bande compacte en haut — plateaux miniatures,
  score visible, joueur actif mis en avant et centré automatiquement, bande
  défilante quand ils sont nombreux.

### Architecture & sécurité

Tous les clients rejouent le **même journal d'actions** à travers le moteur
pur : états, scores et animations sont identiques par construction — les
départs (abandons, exclusions) sont eux-mêmes des actions du journal, donc
appliqués au même moment partout. Les
valeurs des cartes vivent dans un sous-arbre `secrets/` **illisible via
l'API** ; une valeur ne devient publique qu'incluse dans une action, et les
règles RTDB **vérifient qu'elle correspond au secret**. Les règles imposent
aussi : joueurs assis uniquement, sièges contigus et nombre de joueurs
verrouillé au démarrage, tour par tour (`state.turn`), journal en append-only
(`state.next`), phases cohérentes, pioche dans l'ordre (`state.cursorRef`),
interdiction de « regarder la pioche puis prendre la défausse », révélations
de fin de manche vérifiées **par siège**, exclusion/réclamation seulement
après 60 s d'absence réelle (ou sur intention de départ signée du partant).

Limites connues (contraintes du plan Spark, sans Cloud Functions) : le client
qui **mélange** une manche connaît transitoirement l'ordre du paquet (un
client modifié pourrait l'enregistrer), et le miroir d'état écrit par le
joueur au trait n'est que partiellement validé par les règles — le client
adverse détecte toute divergence en rejouant le journal et signale la partie
comme corrompue. Pour un duel privé entre amis, c'est un compromis honnête ;
la voie d'évolution « zéro confiance » passe par des Cloud Functions (plan
Blaze).

### Configuration Firebase (une seule fois)

Le projet attendu est `four-columns-duels` (modifiable via variables d'env).

1. **Console Firebase → Realtime Database → Créer une base de données**
   (région conseillée : `europe-west1`, mode verrouillé — les règles suivent).
2. **Déployer les règles de sécurité** : soit
   `npx firebase deploy --only database` (après `npx firebase login`), soit
   copier le contenu de `database.rules.json` dans l'onglet *Règles* de la
   console.
3. **Authentication → Sign-in method → Anonyme : activé** (déjà fait).
4. **Renseigner la config web** dans `src/online/firebase.ts` (remplacer les
   deux valeurs `REMPLACER_…` par `apiKey` et `appId` de votre app web « 4
   Columns » — console → Paramètres du projet → Vos applications). Ces valeurs
   sont **publiques par nature** (la sécurité vient des règles) et peuvent
   être committées ; alternativement, définissez `VITE_FIREBASE_API_KEY` et
   `VITE_FIREBASE_APP_ID` au build.
5. Si votre base n'est pas en `europe-west1`, ajustez `databaseURL`
   (`VITE_FIREBASE_DATABASE_URL`).

Tant que la config n'est pas renseignée, l'app fonctionne normalement et le
mode en ligne affiche un message « non configuré ».

Le mode tient confortablement dans le **plan gratuit Spark** : ~1 Ko par coup,
présence par connexions WebSocket (limite : 100 simultanées), aucun service
payant. Les parties terminées sont supprimées par le client au retour au menu.

### Tests de bout en bout (émulateurs)

```sh
node scripts/e2e-online.mjs          # suite complète (inclut deux scénarios
                                     # d'absence ≈ 80 s chacun)
node scripts/e2e-online.mjs --fast   # sans les scénarios lents
```

Le script démarre les **émulateurs Firebase** (Auth + Realtime Database, avec
les vraies règles) et un serveur Vite, puis pilote jusqu'à **six navigateurs**
à travers de vraies interactions : création, code invalide, partie déjà
commencée, attaques directes sur la base (2 joueurs et multi), manches
complètes à 2 puis à 4 joueurs synchronisées sur tous les appareils, poignée
de main « tous prêts », rafraîchissement en pleine partie,
déconnexion/reconnexion, fin de partie, revanche, abandons en cascade jusqu'au
dernier joueur en lice, démarrage anticipé (2 joueurs sur un salon de 3),
exclusion d'un absent, victoire réclamée. Prérequis : Java (émulateur RTDB) et
Chromium (Playwright).

## Cartes

Les cartes sont **dessinées nativement en CSS** (`src/ui/PlayingCard.tsx`,
couleurs dans `src/ui/theme.ts`) : aucune image externe, un rendu net à toutes
les tailles et un poids quasi nul pour le mode hors-ligne.

## Technologies

- Vite
- TypeScript
- React
- shadcn/ui
- Tailwind CSS
- Vitest (tests unitaires du moteur)
- vite-plugin-pwa / Workbox (service worker, mode hors-ligne, installation)

## Prérequis

- Node.js 18+ et npm

## Installation

```sh
npm install
```

## Lancer en développement

```sh
npm run dev
```

L'application est servie sur l'URL affichée par Vite (par défaut
http://localhost:8080).

## Vérifier (tests / lint / build)

```sh
npm test          # tests unitaires du moteur de jeu (Vitest)
npm run lint
npm run build
npm run preview   # sert le build de production localement
```

## PWA & icônes

Le service worker et le manifest sont générés automatiquement au build par
`vite-plugin-pwa`. Les icônes et l'image de partage (`public/pwa-*.png`,
`maskable-*.png`, `apple-touch-icon.png`, `favicon-32x32.png`, `og-image.png`)
sont produites par un script autonome, sans dépendance externe :

```sh
npm run generate:icons   # à relancer seulement si vous changez le design
```

## Déploiement — GitHub Pages (automatique)

Le dépôt contient un workflow GitHub Actions
(`.github/workflows/deploy.yml`) qui **build et publie automatiquement** sur
GitHub Pages à chaque push sur `main`.

Configuration **à faire une seule fois** dans le dépôt GitHub :

1. **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.
2. Pousser sur `main` (ou lancer le workflow manuellement via l'onglet
   *Actions → Deploy to GitHub Pages → Run workflow*).

L'application sera servie sur :
**https://cam14111.github.io/four-columns/**
(adaptez `four-columns` au nom réel du dépôt).

> Le build utilise un **chemin de base relatif** (`base: "./"` dans
> `vite.config.ts`) : le site fonctionne sous n'importe quel sous-chemin, quel
> que soit le nom du dépôt. **Renommer le dépôt ne nécessite aucune
> modification du code.**

### Autres hébergeurs statiques

Le build (`dist/`) est un site statique déployable partout (Netlify, Vercel,
…) : commande `npm run build`, dossier de publication `dist`. Aucune variable
d'environnement ni secret n'est nécessaire. (Pour un hébergement à la racine
du domaine, remettez `base` à `/`.)

## Avis / marques

4 Columns est un **projet indépendant et non commercial**, développé à titre
personnel. Il **n'est affilié à, ni approuvé ou sponsorisé par aucun éditeur de
jeux**. Les mécaniques de jeu de cartes ne sont pas protégeables en tant que
telles ; cette application n'utilise **aucun nom de marque, logo ou visuel de
tiers** — le nom, les icônes et les cartes sont originaux. Toute ressemblance
avec un jeu du commerce se limite aux règles, qui relèvent du domaine des idées.
