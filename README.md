# Skyjo (solo)

Un jeu de **Skyjo en solo** (un joueur humain contre une IA) qui tourne
entièrement dans le navigateur. Application 100 % front-end : **aucun backend,
aucun service externe, aucun compte à créer**.

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

## Déploiement

Le projet se compile en un site **statique** dans `dist/`. Il peut être
hébergé gratuitement sur n'importe quel hébergeur de fichiers statiques :

- **Netlify** / **Vercel** : importer le dépôt, commande de build
  `npm run build`, dossier de publication `dist`.
- **GitHub Pages** : publier le contenu de `dist/`.

Aucune variable d'environnement ni secret n'est nécessaire.
