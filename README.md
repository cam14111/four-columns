# 4 Columns

**4 Columns** est un jeu de cartes qui tourne entièrement dans le navigateur,
jouable en **solo** (un joueur humain contre une IA) ou à **deux joueurs sur le
même téléphone** (mode « chacun son tour »). Application 100 % front-end :
**aucun backend, aucun service externe, aucun compte à créer**.

C'est une **PWA** (Progressive Web App) : installable sur mobile et ordinateur,
et **jouable hors-ligne** une fois chargée.

Le but : révéler et remplacer les cartes de sa grille de 4 colonnes pour
obtenir le plus petit total possible.

## Fonctionnalités

- **Moteur de jeu pur et testé** (`src/game/`) : toutes les règles (mise en
  place, pioche/défausse, remplacement, colonnes identiques, dernier tour,
  doublement du score) vivent dans un réducteur pur, couvert par des tests
  unitaires.
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
- `src/ui/` — composants d'affichage (écrans, plateau, cartes, superpositions).
- Tests : `src/game/__tests__/` (Vitest).

## Stockage des données

L'application n'a **pas de base de données**. Tout est conservé localement via
**`localStorage`** :

- `four-columns:settings` — nom, difficulté, sons, vibrations.
- `four-columns:stats` — statistiques cumulées.

Tout fonctionne hors-ligne, gratuitement, sur un seul appareil. Aucune donnée
n'est envoyée à un serveur.

> Note : des versions précédentes utilisaient Supabase puis un historique local
> par manche ; ces mécanismes ont été remplacés par ce stockage minimal.

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
