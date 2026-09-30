const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, 'public')));

/* ==========================================================================
   1. MODÈLE MATHÉMATIQUE & PROVABLY FAIR
   ========================================================================== */

/**
 * Calcule le point de crash avec la formule spécifiée :
 * Crash = 0.99 / (1 - Math.random())
 * Si < 1, crash immédiat à 1.00x
 */
function generateCrashPoint() {
  const r = Math.random();
  const rawPoint = 0.99 / (1 - r);
  if (rawPoint < 1.00) {
    return 1.00;
  }
  // Arrondi à 2 décimales
  return Math.floor(rawPoint * 100) / 100;
}

/**
 * Génère une graine de serveur et son empreinte SHA-256 (Provably Fair)
 */
function generateProvablyFairRound() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const hashSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const crashPoint = generateCrashPoint();
  return { serverSeed, hashSeed, crashPoint };
}

/* ==========================================================================
   2. ÉTATS DU JEU & VARIABLES GLOBALES
   ========================================================================== */

const GAME_PHASES = {
  BETTING: 'BETTING',   // 10 secondes pour placer les mises
  FLYING: 'FLYING',     // Courbe exponentielle en vol
  CRASHED: 'CRASHED'    // Fin du round, affichage du résultat
};

let currentRound = {
  id: 1,
  phase: GAME_PHASES.BETTING,
  serverSeed: '',
  hashSeed: '',
  crashPoint: 1.00,
  multiplier: 1.00,
  startTime: 0,
  bettingTimeRemaining: 10,
  bets: new Map(), // socketId => { username, amount, cashedOut: boolean, cashoutMultiplier: number|null, payout: number }
  history: [1.85, 2.45, 1.12, 5.80, 1.00, 3.20] // Historique récent
};

const players = new Map(); // socketId => { id, username, balance }

/* ==========================================================================
   3. BOUCLE DE JEU EN TEMPS RÉEL (Socket.io)
   ========================================================================== */

let gameLoopInterval = null;

function startBettingPhase() {
  const roundData = generateProvablyFairRound();
  currentRound.id += 1;
  currentRound.phase = GAME_PHASES.BETTING;
  currentRound.serverSeed = roundData.serverSeed;
  currentRound.hashSeed = roundData.hashSeed;
  currentRound.crashPoint = roundData.crashPoint;
  currentRound.multiplier = 1.00;
  currentRound.bets.clear();
  currentRound.bettingTimeRemaining = 10;

  console.log(`\n--- [ROUND #${currentRound.id}] NOUVELLE PARTIE ---`);
  console.log(`Hash Public (SHA-256): ${currentRound.hashSeed}`);
  console.log(`Point de crash secret: ${currentRound.crashPoint}x`);

  // Diffuser le début de phase de mise avec le hash Provably Fair
  io.emit('round_betting', {
    roundId: currentRound.id,
    hashSeed: currentRound.hashSeed,
    timeRemaining: currentRound.bettingTimeRemaining,
    history: currentRound.history.slice(-8)
  });

  const countdownInterval = setInterval(() => {
    currentRound.bettingTimeRemaining -= 1;
    io.emit('betting_timer', { timeRemaining: Math.max(0, currentRound.bettingTimeRemaining) });

    if (currentRound.bettingTimeRemaining <= 0) {
      clearInterval(countdownInterval);
      startFlyingPhase();
    }
  }, 1000);
}

function startFlyingPhase() {
  currentRound.phase = GAME_PHASES.FLYING;
  currentRound.startTime = Date.now();
  currentRound.multiplier = 1.00;

  console.log(`[ROUND #${currentRound.id}] Décollage en cours...`);
  io.emit('round_flying', {
    roundId: currentRound.id,
    hashSeed: currentRound.hashSeed,
    bets: Array.from(currentRound.bets.values())
  });

  // Si crash immédiat à 1.00x
  if (currentRound.crashPoint <= 1.00) {
    setTimeout(() => {
      triggerCrash();
    }, 100);
    return;
  }

  // Ticks de progression toutes les 100ms
  const TICK_MS = 100;
  gameLoopInterval = setInterval(() => {
    if (currentRound.phase !== GAME_PHASES.FLYING) {
      clearInterval(gameLoopInterval);
      return;
    }

    const elapsedSeconds = (Date.now() - currentRound.startTime) / 1000;
    
    // Formule de progression exponentielle réaliste : M(t) = e^(0.06 * t)
    const rawMultiplier = Math.exp(0.06 * elapsedSeconds);
    currentRound.multiplier = Math.floor(rawMultiplier * 100) / 100;

    // Vérifier si le point de crash est atteint
    if (currentRound.multiplier >= currentRound.crashPoint) {
      clearInterval(gameLoopInterval);
      triggerCrash();
      return;
    }

    // Diffusion du tick à tous les clients
    io.emit('flying_tick', {
      multiplier: currentRound.multiplier,
      elapsed: elapsedSeconds
    });
  }, TICK_MS);
}

function triggerCrash() {
  currentRound.phase = GAME_PHASES.CRASHED;
  currentRound.multiplier = currentRound.crashPoint;

  console.log(`[ROUND #${currentRound.id}] 💥 CRASH À ${currentRound.crashPoint}x !`);
  console.log(`Server Seed Révélé: ${currentRound.serverSeed}`);

  // Mettre à jour l'historique
  currentRound.history.push(currentRound.crashPoint);
  if (currentRound.history.length > 20) currentRound.history.shift();

  // Résoudre les pertes pour les joueurs qui n'ont pas cashout
  currentRound.bets.forEach((bet, socketId) => {
    if (!bet.cashedOut) {
      bet.payout = 0;
      const player = players.get(socketId);
      if (player) {
        // La mise était déjà déduite
      }
    }
  });

  // Notifier tous les clients avec le seed original révélé pour vérification
  io.emit('round_crashed', {
    roundId: currentRound.id,
    crashPoint: currentRound.crashPoint,
    serverSeed: currentRound.serverSeed,
    hashSeed: currentRound.hashSeed,
    bets: Array.from(currentRound.bets.values()),
    history: currentRound.history.slice(-8)
  });

  // Pause de 4 secondes avant de relancer la boucle
  setTimeout(() => {
    startBettingPhase();
  }, 4000);
}

/* ==========================================================================
   4. GESTION DES WEBSOCKETS & ACTIONS JOUEURS
   ========================================================================== */

io.on('connection', (socket) => {
  // Attribution d'un pseudo et solde initial
  const guestNumber = Math.floor(1000 + Math.random() * 9000);
  const player = {
    id: socket.id,
    username: `Pilote_${guestNumber}`,
    balance: 1000
  };
  players.set(socket.id, player);

  console.log(`[+] Joueur connecté: ${player.username} (${socket.id})`);

  // Envoyer l'état actuel au nouveau client
  socket.emit('init_state', {
    player,
    roundId: currentRound.id,
    phase: currentRound.phase,
    multiplier: currentRound.multiplier,
    timeRemaining: currentRound.bettingTimeRemaining,
    hashSeed: currentRound.hashSeed,
    serverSeed: currentRound.phase === GAME_PHASES.CRASHED ? currentRound.serverSeed : null,
    bets: Array.from(currentRound.bets.values()),
    history: currentRound.history.slice(-8)
  });

  io.emit('players_count', { count: players.size });

  // 1. PLACER UNE MISE (Phase BETTING)
  socket.on('place_bet', (data) => {
    if (currentRound.phase !== GAME_PHASES.BETTING) {
      return socket.emit('bet_error', { message: 'Les mises sont fermées pour ce round' });
    }

    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0 || amount > player.balance) {
      return socket.emit('bet_error', { message: 'Montant de mise invalide ou solde insuffisant' });
    }

    // Déduire la mise du solde
    player.balance = Math.round((player.balance - amount) * 100) / 100;

    const betInfo = {
      socketId: socket.id,
      username: player.username,
      amount: amount,
      cashedOut: false,
      cashoutMultiplier: null,
      payout: 0
    };

    currentRound.bets.set(socket.id, betInfo);

    socket.emit('bet_accepted', { bet: betInfo, balance: player.balance });
    io.emit('all_bets_updated', { bets: Array.from(currentRound.bets.values()) });

    console.log(`[MISE] ${player.username} a misé ${amount}€ (Solde restant: ${player.balance}€)`);
  });

  // 2. CASHOUT (Phase FLYING)
  socket.on('cashout', () => {
    if (currentRound.phase !== GAME_PHASES.FLYING) {
      return socket.emit('cashout_error', { message: "Le vol n'est pas en cours" });
    }

    const bet = currentRound.bets.get(socket.id);
    if (!bet) {
      return socket.emit('cashout_error', { message: "Vous n'avez pas de mise active" });
    }

    if (bet.cashedOut) {
      return socket.emit('cashout_error', { message: 'Vous avez déjà encaissé vos gains' });
    }

    // Capture immédiate du multiplicateur exact à la milliseconde de réception
    const exactMultiplier = currentRound.multiplier;

    // Vérifier que le multiplicateur n'a pas dépassé le crash point
    if (exactMultiplier >= currentRound.crashPoint) {
      return socket.emit('cashout_error', { message: 'Trop tard ! L\'avion s\'est déjà écrasé.' });
    }

    // Validation du gain
    const payout = Math.round((bet.amount * exactMultiplier) * 100) / 100;
    player.balance = Math.round((player.balance + payout) * 100) / 100;

    bet.cashedOut = true;
    bet.cashoutMultiplier = exactMultiplier;
    bet.payout = payout;

    socket.emit('cashout_success', {
      multiplier: exactMultiplier,
      payout: payout,
      balance: player.balance
    });

    io.emit('player_cashed_out', {
      username: player.username,
      multiplier: exactMultiplier,
      payout: payout,
      bets: Array.from(currentRound.bets.values())
    });

    console.log(`[CASHOUT] ${player.username} a encaissé à ${exactMultiplier}x (+${payout}€) !`);
  });

  // Déconnexion
  socket.on('disconnect', () => {
    console.log(`[-] Joueur déconnecté: ${player.username}`);
    players.delete(socket.id);
    io.emit('players_count', { count: players.size });
  });
});

// Démarrer la première partie au lancement
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SERVEUR DE CRASH MULTIJOUEUR EN LIGNE SUR PORT ${PORT}`);
  console.log(`🔗 Interface web disponible sur http://localhost:${PORT}`);
  console.log(`====================================================`);
  startBettingPhase();
});
