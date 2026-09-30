/* ==========================================================================
   AVIATOR CRASH - CLIENT JAVASCRIPT & CANVAS ENGINE
   ========================================================================== */

const socket = io();

// Éléments du DOM
const canvas = document.getElementById('crashCanvas');
const ctx = canvas.getContext('2d');

const countdownBox = document.getElementById('countdownBox');
const countdownTimer = document.getElementById('countdownTimer');
const countdownProgress = document.getElementById('countdownProgress');
const multiplierDisplay = document.getElementById('multiplierDisplay');
const multiplierValue = document.getElementById('multiplierValue');
const crashedBox = document.getElementById('crashedBox');
const crashedAtValue = document.getElementById('crashedAtValue');

const betAmountInput = document.getElementById('betAmount');
const mainActionButton = document.getElementById('mainActionButton');
const playerUsernameEl = document.getElementById('playerUsername');
const playerBalanceEl = document.getElementById('playerBalance');
const onlineCountEl = document.getElementById('onlineCount');
const historyBarEl = document.getElementById('historyBar');
const betsListEl = document.getElementById('betsList');
const activeBetsCountEl = document.getElementById('activeBetsCount');

const displayHashEl = document.getElementById('displayHash');
const pfHashInput = document.getElementById('pfHashInput');
const pfSeedInput = document.getElementById('pfSeedInput');
const pfVerifyResult = document.getElementById('pfVerifyResult');

// État local du client
let gameState = {
  phase: 'BETTING', // 'BETTING' | 'FLYING' | 'CRASHED'
  multiplier: 1.00,
  targetMultiplier: 1.00,
  elapsed: 0,
  crashPoint: null,
  hashSeed: '',
  serverSeed: null,
  myPlayer: null,
  myBet: null, // { amount, cashedOut, cashoutMultiplier, payout }
  bets: []
};

// Particules pour la traînée de propulsion de l'avion
let jetParticles = [];
let explosionParticles = [];

/* ==========================================================================
   1. MOTEUR AUDIO SYNTHÉTISÉ (Web Audio API - Zéro dépendance externe)
   ========================================================================== */

const AudioEngine = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
  },
  playBeep(freq = 440, duration = 0.08) {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },
  playCashout() {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.12, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.2);
    });
  },
  playCrash() {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }
};

/* ==========================================================================
   2. RENDU CANVAS DU GRAPHIQUE EXPONENTIEL (AVIATOR ENGINE)
   ========================================================================== */

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawGrid(w, h, maxMultiplier, maxTime) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  ctx.font = '10px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';

  // Lignes horizontales (Multiplicateurs)
  const ySteps = 5;
  for (let i = 1; i <= ySteps; i++) {
    const yVal = 1 + (maxMultiplier - 1) * (i / ySteps);
    const y = h - 40 - ((yVal - 1) / (maxMultiplier - 1)) * (h - 70);
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(`${yVal.toFixed(1)}x`, 12, y + 3);
  }

  // Lignes verticales (Secondes)
  const xSteps = 6;
  for (let i = 0; i <= xSteps; i++) {
    const sec = (maxTime * (i / xSteps)).toFixed(0);
    const x = 50 + (i / xSteps) * (w - 70);
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, h - 40);
    ctx.stroke();
    ctx.fillText(`${sec}s`, x - 8, h - 22);
  }

  // Axes principaux
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 10);
  ctx.lineTo(50, h - 40);
  ctx.lineTo(w, h - 40);
  ctx.stroke();

  ctx.restore();
}

function renderPlane(x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Corps de l'avion / fusée rouge stylisée
  ctx.shadowColor = '#ff3344';
  ctx.shadowBlur = 15;

  // Carlingue
  ctx.fillStyle = '#ff2b3d';
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-14, -8);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-14, 8);
  ctx.closePath();
  ctx.fill();

  // Aile supérieure
  ctx.fillStyle = '#ff6b78';
  ctx.beginPath();
  ctx.moveTo(-2, -2);
  ctx.lineTo(-8, -14);
  ctx.lineTo(-12, -14);
  ctx.lineTo(-7, -2);
  ctx.closePath();
  ctx.fill();

  // Aile inférieure
  ctx.beginPath();
  ctx.moveTo(-2, 2);
  ctx.lineTo(-8, 14);
  ctx.lineTo(-12, 14);
  ctx.lineTo(-7, 2);
  ctx.closePath();
  ctx.fill();

  // Hublot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(4, -1, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function updateAndDrawParticles(currentX, currentY, isFlying) {
  // Ajouter des particules de réacteur en vol
  if (isFlying && Math.random() < 0.6) {
    jetParticles.push({
      x: currentX - 10,
      y: currentY,
      vx: -(Math.random() * 2 + 1.5),
      vy: (Math.random() - 0.5) * 1.5,
      alpha: 1,
      size: Math.random() * 4 + 2,
      color: Math.random() > 0.4 ? '#ff3b30' : '#ff9500'
    });
  }

  // Dessiner et mettre à jour les particules du réacteur
  for (let i = jetParticles.length - 1; i >= 0; i--) {
    const p = jetParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.03;
    p.size *= 0.96;

    if (p.alpha <= 0) {
      jetParticles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Dessiner et mettre à jour l'explosion de crash
  for (let i = explosionParticles.length - 1; i >= 0; i--) {
    const p = explosionParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08; // gravité
    p.alpha -= 0.02;

    if (p.alpha <= 0) {
      explosionParticles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function triggerExplosion(x, y) {
  explosionParticles = [];
  for (let i = 0; i < 40; i++) {
    const speed = Math.random() * 6 + 2;
    const angle = Math.random() * Math.PI * 2;
    explosionParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      size: Math.random() * 6 + 3,
      color: ['#ff3b30', '#ff9500', '#ffd60a', '#ffffff'][Math.floor(Math.random() * 4)]
    });
  }
}

function renderCanvas() {
  const w = canvas.width / window.devicePixelRatio;
  const h = canvas.height / window.devicePixelRatio;

  ctx.save();
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, w, h);

  // Échelle dynamique des axes
  const currentM = gameState.multiplier;
  const maxMultiplier = Math.max(2.0, currentM * 1.25);
  const maxTime = Math.max(10, (gameState.elapsed || 0) * 1.25);

  drawGrid(w, h, maxMultiplier, maxTime);

  const originX = 50;
  const originY = h - 40;
  const usableW = w - 70;
  const usableH = h - 70;

  if (gameState.phase === 'FLYING' || gameState.phase === 'CRASHED') {
    // Calcul de la courbe exponentielle jusqu'à la position actuelle
    const pointsCount = 60;
    const points = [];
    const elapsed = Math.max(0.1, gameState.elapsed);

    for (let i = 0; i <= pointsCount; i++) {
      const t = (i / pointsCount) * elapsed;
      const m = Math.exp(0.06 * t);
      const x = originX + (t / maxTime) * usableW;
      const y = originY - ((m - 1) / (maxMultiplier - 1)) * usableH;
      points.push({ x, y });
    }

    if (points.length > 1) {
      // 1. Remplissage dégradé sous la courbe
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      const lastPoint = points[points.length - 1];
      ctx.lineTo(lastPoint.x, originY);
      ctx.lineTo(originX, originY);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, lastPoint.y, 0, originY);
      gradient.addColorStop(0, 'rgba(255, 43, 61, 0.45)');
      gradient.addColorStop(0.5, 'rgba(255, 43, 61, 0.15)');
      gradient.addColorStop(1, 'rgba(255, 43, 61, 0.0)');
      ctx.fillStyle = gradient;
      ctx.fill();

      // 2. Trait lumineux de la courbe
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = '#ff2b3d';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = 'rgba(255, 43, 61, 0.7)';
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 3. Dessiner l'avion à la pointe de la courbe
      const prevPoint = points[points.length - 2] || points[0];
      const angle = Math.atan2(lastPoint.y - prevPoint.y, lastPoint.x - prevPoint.x);

      if (gameState.phase === 'FLYING') {
        renderPlane(lastPoint.x, lastPoint.y, angle);
      }
      updateAndDrawParticles(lastPoint.x, lastPoint.y, gameState.phase === 'FLYING');
    }
  }

  ctx.restore();
  requestAnimationFrame(renderCanvas);
}
requestAnimationFrame(renderCanvas);

/* ==========================================================================
   3. GESTION DE L'INTERFACE UTILISATEUR & DU BOUTON D'ACTION
   ========================================================================== */

function updateActionButton() {
  const btn = mainActionButton;
  const primText = btn.querySelector('.btn-primary-text');
  const subText = btn.querySelector('.btn-sub-text');

  btn.className = 'btn-action';

  if (gameState.phase === 'BETTING') {
    if (gameState.myBet) {
      btn.classList.add('btn-waiting');
      btn.disabled = true;
      primText.textContent = `MISE VALIDÉE (${gameState.myBet.amount} €)`;
      subText.textContent = 'En attente du décollage...';
    } else {
      const amount = parseFloat(betAmountInput.value) || 10;
      btn.classList.add('btn-bet');
      btn.disabled = false;
      primText.textContent = 'PLACER LA MISE';
      subText.textContent = `Miser ${amount.toFixed(2)} €`;
    }
  } else if (gameState.phase === 'FLYING') {
    if (gameState.myBet && !gameState.myBet.cashedOut) {
      const currentGain = (gameState.myBet.amount * gameState.multiplier).toFixed(2);
      btn.classList.add('btn-cashout');
      btn.disabled = false;
      primText.textContent = `ENCAISSER (${currentGain} €)`;
      subText.textContent = `@ ${gameState.multiplier.toFixed(2)}x`;
    } else if (gameState.myBet && gameState.myBet.cashedOut) {
      btn.classList.add('btn-cashed-out');
      btn.disabled = true;
      primText.textContent = `ENCAISSÉ (+${gameState.myBet.payout.toFixed(2)} €)`;
      subText.textContent = `@ ${gameState.myBet.cashoutMultiplier.toFixed(2)}x`;
    } else {
      btn.classList.add('btn-waiting');
      btn.disabled = true;
      primText.textContent = 'VOL EN COURS';
      subText.textContent = 'Prochaine partie dans quelques secondes';
    }
  } else if (gameState.phase === 'CRASHED') {
    btn.classList.add('btn-waiting');
    btn.disabled = true;
    if (gameState.myBet && gameState.myBet.cashedOut) {
      primText.textContent = `GAGNÉ +${gameState.myBet.payout.toFixed(2)} €`;
      subText.textContent = 'Bravo ! Préparez la prochaine mise';
    } else if (gameState.myBet && !gameState.myBet.cashedOut) {
      primText.textContent = 'ÉCRASÉ (PERDU)';
      subText.textContent = 'L\'avion a crashé avant votre retrait';
    } else {
      primText.textContent = 'PARTIE TERMINÉE';
      subText.textContent = 'Prochain décollage imminent';
    }
  }
}

function updateHistoryBar(history) {
  historyBarEl.innerHTML = '';
  history.forEach((mult) => {
    const pill = document.createElement('div');
    pill.className = `history-pill ${mult >= 2.0 ? 'green' : mult >= 1.2 ? 'blue' : 'red'}`;
    pill.textContent = `${mult.toFixed(2)}x`;
    historyBarEl.appendChild(pill);
  });
}

function updateBetsList(bets) {
  activeBetsCountEl.textContent = `${bets.length} pari${bets.length > 1 ? 's' : ''}`;
  if (!bets || bets.length === 0) {
    betsListEl.innerHTML = '<div class="empty-state">En attente de mises...</div>';
    return;
  }

  betsListEl.innerHTML = '';
  bets.forEach((b) => {
    const row = document.createElement('div');
    row.className = `bet-row ${b.cashedOut ? 'cashed-out' : ''}`;

    let statusHtml = '<span class="bet-status in-flight">En vol...</span>';
    if (b.cashedOut) {
      statusHtml = `<span class="bet-status win">${b.cashoutMultiplier.toFixed(2)}x (+${b.payout.toFixed(2)}€)</span>`;
    } else if (gameState.phase === 'CRASHED') {
      statusHtml = '<span class="bet-status lost">Crash 💥</span>';
    }

    row.innerHTML = `
      <span class="bet-player">${b.username}</span>
      <span class="bet-amount">${b.amount.toFixed(2)} €</span>
      ${statusHtml}
    `;
    betsListEl.appendChild(row);
  });
}

// Vérification Provably Fair côté client
async function verifyProvablyFair(serverSeed, expectedHash) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(serverSeed);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const calculatedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (calculatedHash === expectedHash) {
      pfVerifyResult.className = 'pf-verify-text valid';
      pfVerifyResult.textContent = '✅ Graine vérifiée : Le hash SHA-256 correspond parfaitement au seed révélé ! (Partie 100% équitable)';
    } else {
      pfVerifyResult.className = 'pf-verify-text';
      pfVerifyResult.style.color = 'var(--accent-red)';
      pfVerifyResult.textContent = '❌ Erreur de vérification du hash !';
    }
  } catch (e) {
    console.error('Erreur vérification SHA-256', e);
  }
}

/* ==========================================================================
   4. GESTION DES CLICS & INTERACTIONS
   ========================================================================== */

mainActionButton.addEventListener('click', () => {
  AudioEngine.init();

  if (gameState.phase === 'BETTING') {
    const amount = parseFloat(betAmountInput.value);
    if (!amount || amount <= 0) return alert('Veuillez entrer un montant valide');
    if (gameState.myPlayer && amount > gameState.myPlayer.balance) {
      return alert('Solde insuffisant pour cette mise');
    }

    socket.emit('place_bet', { amount });
  } else if (gameState.phase === 'FLYING') {
    if (gameState.myBet && !gameState.myBet.cashedOut) {
      socket.emit('cashout');
    }
  }
});

// Boutons rapides de mise (+10, +50, /2, x2, MAX)
document.querySelectorAll('.btn-quick').forEach((btn) => {
  btn.addEventListener('click', () => {
    let current = parseFloat(betAmountInput.value) || 0;
    const addVal = btn.dataset.val;
    const action = btn.dataset.action;

    if (addVal) {
      current += parseFloat(addVal);
    } else if (action === 'half') {
      current = Math.max(1, Math.floor(current / 2));
    } else if (action === 'double') {
      current = current * 2;
    } else if (action === 'max' && gameState.myPlayer) {
      current = Math.floor(gameState.myPlayer.balance);
    }

    betAmountInput.value = Math.max(1, Math.round(current));
    updateActionButton();
  });
});

betAmountInput.addEventListener('input', updateActionButton);

/* ==========================================================================
   5. ÉCOUTEURS D'ÉVÉNEMENTS SOCKET.IO
   ========================================================================== */

// Initialisation au chargement
socket.on('init_state', (data) => {
  gameState.myPlayer = data.player;
  playerUsernameEl.textContent = data.player.username;
  playerBalanceEl.textContent = `${data.player.balance.toFixed(2)} €`;

  gameState.phase = data.phase;
  gameState.multiplier = data.multiplier;
  gameState.hashSeed = data.hashSeed;
  displayHashEl.textContent = data.hashSeed;
  pfHashInput.value = data.hashSeed;

  updateHistoryBar(data.history || []);
  updateBetsList(data.bets || []);

  if (data.phase === 'BETTING') {
    countdownBox.classList.remove('hidden');
    multiplierDisplay.classList.add('hidden');
    crashedBox.classList.add('hidden');
    countdownTimer.textContent = `${data.timeRemaining}s`;
  } else if (data.phase === 'FLYING') {
    countdownBox.classList.add('hidden');
    multiplierDisplay.classList.remove('hidden');
    crashedBox.classList.add('hidden');
    multiplierValue.textContent = `${data.multiplier.toFixed(2)}x`;
  }

  updateActionButton();
});

socket.on('players_count', (data) => {
  onlineCountEl.textContent = data.count;
});

// Début de phase de mise (10 secondes)
socket.on('round_betting', (data) => {
  gameState.phase = 'BETTING';
  gameState.multiplier = 1.00;
  gameState.elapsed = 0;
  gameState.myBet = null;
  gameState.hashSeed = data.hashSeed;
  gameState.serverSeed = null;

  displayHashEl.textContent = data.hashSeed;
  pfHashInput.value = data.hashSeed;
  pfSeedInput.value = '';
  pfVerifyResult.textContent = '';

  countdownBox.classList.remove('hidden');
  multiplierDisplay.classList.add('hidden');
  crashedBox.classList.add('hidden');
  countdownTimer.textContent = `${data.timeRemaining}s`;
  countdownProgress.style.width = '100%';

  updateHistoryBar(data.history || []);
  updateBetsList([]);
  updateActionButton();
});

// Décompte de la phase de mise
socket.on('betting_timer', (data) => {
  countdownTimer.textContent = `${data.timeRemaining.toFixed(1)}s`;
  countdownProgress.style.width = `${(data.timeRemaining / 10) * 100}%`;
  if (data.timeRemaining <= 3 && data.timeRemaining > 0) {
    AudioEngine.playBeep(600, 0.05);
  }
});

// Décollage / Vol en cours
socket.on('round_flying', (data) => {
  gameState.phase = 'FLYING';
  gameState.multiplier = 1.00;
  gameState.elapsed = 0;

  countdownBox.classList.add('hidden');
  multiplierDisplay.classList.remove('hidden');
  crashedBox.classList.add('hidden');
  multiplierValue.textContent = '1.00x';

  updateBetsList(data.bets || []);
  updateActionButton();
  AudioEngine.playBeep(880, 0.15);
});

// Ticks de vol reçus toutes les 100ms
socket.on('flying_tick', (data) => {
  if (gameState.phase !== 'FLYING') return;

  gameState.multiplier = data.multiplier;
  gameState.elapsed = data.elapsed;
  multiplierValue.textContent = `${data.multiplier.toFixed(2)}x`;

  updateActionButton();
});

// Confirmation de mise acceptée
socket.on('bet_accepted', (data) => {
  gameState.myBet = data.bet;
  if (gameState.myPlayer) {
    gameState.myPlayer.balance = data.balance;
    playerBalanceEl.textContent = `${data.balance.toFixed(2)} €`;
  }
  updateActionButton();
  AudioEngine.playBeep(520, 0.08);
});

socket.on('all_bets_updated', (data) => {
  updateBetsList(data.bets || []);
});

// Cashout réussi
socket.on('cashout_success', (data) => {
  if (gameState.myBet) {
    gameState.myBet.cashedOut = true;
    gameState.myBet.cashoutMultiplier = data.multiplier;
    gameState.myBet.payout = data.payout;
  }
  if (gameState.myPlayer) {
    gameState.myPlayer.balance = data.balance;
    playerBalanceEl.textContent = `${data.balance.toFixed(2)} €`;
  }
  updateActionButton();
  AudioEngine.playCashout();
});

socket.on('player_cashed_out', (data) => {
  updateBetsList(data.bets || []);
});

// Crash de l'avion
socket.on('round_crashed', (data) => {
  gameState.phase = 'CRASHED';
  gameState.multiplier = data.crashPoint;
  gameState.serverSeed = data.serverSeed;

  multiplierDisplay.classList.add('hidden');
  crashedBox.classList.remove('hidden');
  crashedAtValue.textContent = `@ ${data.crashPoint.toFixed(2)}x`;

  pfSeedInput.value = data.serverSeed;
  verifyProvablyFair(data.serverSeed, data.hashSeed);

  // Déclencher explosion visuelle au centre
  const rect = canvas.getBoundingClientRect();
  triggerExplosion(rect.width * 0.7, rect.height * 0.4);

  AudioEngine.playCrash();
  updateHistoryBar(data.history || []);
  updateBetsList(data.bets || []);
  updateActionButton();
});

socket.on('bet_error', (data) => {
  alert(data.message);
});

socket.on('cashout_error', (data) => {
  console.warn(data.message);
});
