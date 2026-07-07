# Skyjo (solo)

Un jeu de **Skyjo en solo** (un joueur humain contre une IA) qui tourne
entièrement dans le navigateur. Application 100 % front-end : **aucun backend,
aucun service externe, aucun compte à créer**.

C'est une **PWA** (Progressive Web App) : installable sur mobile et ordinateur,
et **jouable hors-ligne** une fois chargée.

## Stockage des données

L'application n'a **pas de base de données**. L'historique des scores par manche
est conservé localement dans le navigateur via **`localStorage`** (clé
`skyjo_round_history`).

- Les scores survivent aux rechargements de page sur le même navigateur.
- Tout fonctionne hors-ligne, gratuitement.
- « Nouvelle partie » efface l'historique local ; « Continuer la partie »
  ajoute la manche courante au total.

> Note : une version précédente utilisait Supabase. Cette dépendance a été
> entièrement supprimée au profit du stockage local, mieux adapté à un jeu
> solo mono-appareil. Voir `src/lib/roundHistoryStore.ts`.

## Technologies

- Vite
- TypeScript
- React
- shadcn/ui
- Tailwind CSS
- TanStack Query (cache local de l'historique)
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

## Vérifier (lint / build)

```sh
npm run lint
npm run build
npm run preview   # sert le build de production localement
```

## PWA & icônes

Le service worker et le manifest sont générés automatiquement au build par
`vite-plugin-pwa`. Les icônes (`public/pwa-*.png`, `maskable-*.png`,
`apple-touch-icon.png`, `favicon-32x32.png`) sont produites par un script
autonome, sans dépendance externe :

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
**https://cam14111.github.io/skyjo-solo-play/**

> Le chemin de base `/skyjo-solo-play/` est configuré dans `vite.config.ts`
> (`base`). Si vous renommez le dépôt ou utilisez un domaine personnalisé,
> ajustez cette valeur.

### Autres hébergeurs statiques

Le build (`dist/`) est un site statique déployable partout (Netlify, Vercel,
…) : commande `npm run build`, dossier de publication `dist`. Aucune variable
d'environnement ni secret n'est nécessaire. (Pour un hébergement à la racine
du domaine, remettez `base` à `/`.)
