# 🎲 Casino à Boire - Architecture Multijoueur Temps Réel

Projet multijoueur temps réel (architecture type Kahoot) avec un backend Node.js / Express / Socket.io et un frontend React / Vite / TypeScript.

---

## 📁 Structure du Projet

```
casino-a-boire/
├── package.json               # Scripts monorepo (lancement serveur/client)
├── shared/
│   └── types.ts               # Types TypeScript partagés (Player, Room, etc.)
├── server/
│   ├── package.json           # Dépendances backend
│   ├── tsconfig.json          # Configuration TypeScript
│   └── src/
│       ├── types.ts           # Types serveur
│       ├── roomManager.ts     # Gestionnaire des Rooms & Players en mémoire
│       └── index.ts           # Serveur Express & Socket.io (port 3001)
└── client/
    ├── package.json           # Dépendances frontend (React, Vite, Router, Lucide)
    ├── tsconfig.json          # Configuration TypeScript
    ├── vite.config.ts         # Configuration Vite (port 5173, host: true)
    ├── index.html             # Point d'entrée HTML
    └── src/
        ├── socket.ts          # Client Socket.io configuré
        ├── types.ts           # Types client
        ├── App.tsx            # Routeur (/host et /)
        ├── main.tsx           # Point d'entrée React
        ├── pages/
        │   ├── HostScreen.tsx # Écran Hôte (/host) : création room & liste temps réel
        │   └── PhoneScreen.tsx# Écran Joueur (/) : manette mobile pour rejoindre
        └── index.css          # Styles néon / casino sombre
```

---

## 🚀 Démarrage Rapide

### 1. Démarrer le Backend (Port 3001)
```bash
cd server
npm run dev
```

### 2. Démarrer le Frontend (Port 5173)
```bash
cd client
npm run dev
```

Ou depuis la racine :
```bash
npm run dev:server   # Dans un terminal
npm run dev:client   # Dans un second terminal
```

---

## 🌐 Routes de l'Application

- **`/host`** : **Écran principal (Hôte / Grand écran)**
  - Crée automatiquement une Room et affiche son code unique à 4 lettres (ex: `ABCD`).
  - Affiche en direct la liste des joueurs dès qu'ils rejoignent la table.
  - Confettis & animations à l'arrivée de chaque joueur.

- **`/`** : **Écran Joueur (Mobile / Manette)**
  - Formulaire de connexion : **Pseudo** + **Code de la Table**.
  - Valide la saisie et connecte le joueur à la Room.
  - Affiche l'écran d'attente personnalisé avec le solde de départ (15 jetons) et le statut.

---

## 📦 Modèles de Données TypeScript

### `Player`
```typescript
export interface Player {
  id: string;          // Socket ID unique
  name: string;        // Pseudo choisi par le joueur
  balance: number;     // Solde de jetons (par défaut: 15)
  inventory: string[]; // Objets/cartes possédés (par défaut: [])
  status: 'active' | 'bankrupt'; // Statut (par défaut: 'active')
}
```

### `Room`
```typescript
export interface Room {
  id: string;          // Code à 4 lettres majuscules (ex: "ABCD")
  state: 'lobby' | 'playing' | 'shop'; // État de la partie
  players: Player[];   // Liste des joueurs connectés
}
```
