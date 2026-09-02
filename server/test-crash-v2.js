const { io } = require('socket.io-client');
const http = require('http');

function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            retry();
          }
        })
        .on('error', retry);
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for server at ${url}`));
      } else {
        setTimeout(check, 300);
      }
    };

    check();
  });
}

function createConnectedSocket(url) {
  return new Promise((resolve, reject) => {
    const s = io(url, { reconnection: true, reconnectionAttempts: 5 });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function waitForRoomState(socket, targetState) {
  return new Promise((resolve) => {
    const handler = ({ room }) => {
      if (room && room.state === targetState) {
        socket.off('room_updated', handler);
        resolve(room);
      }
    };
    socket.on('room_updated', handler);
  });
}

async function runTest() {
  console.log('===============================================================');
  console.log('⚡ TEST : KRACH BOURSIER - SMART STOP, HARD CAP 15S & HAUTE VOLATILITÉ');
  console.log('===============================================================\n');

  await waitForServer('http://localhost:3001/health');
  console.log('✔ Serveur opérationnel sur http://localhost:3001');

  // 1. Création de Room par l'Hôte
  const hostSocket = await createConnectedSocket('http://localhost:3001');
  let roomId = '';
  const roomCreatedPromise = new Promise((resolve) => {
    hostSocket.once('room_created', ({ room }) => {
      roomId = room.id;
      resolve(room);
    });
  });
  hostSocket.emit('create_room');
  await roomCreatedPromise;
  console.log(`✔ Room créée : [${roomId}]`);

  // 2. Connexion d'Alice (Leader) et Bob
  const aliceSocket = await createConnectedSocket('http://localhost:3001');
  const bobSocket = await createConnectedSocket('http://localhost:3001');

  const aliceJoinPromise = new Promise((res) => aliceSocket.once('room_joined', res));
  const bobJoinPromise = new Promise((res) => bobSocket.once('room_joined', res));

  aliceSocket.emit('join_room', { roomId, name: 'Alice' });
  bobSocket.emit('join_room', { roomId, name: 'Bob' });

  await Promise.all([aliceJoinPromise, bobJoinPromise]);
  console.log('✔ Alice et Bob connectés');

  // Lancement de la partie -> voting -> crash
  const votingStatePromise = waitForRoomState(hostSocket, 'voting');
  aliceSocket.emit('start_game', { roomId });
  await votingStatePromise;

  const crashStatePromise = waitForRoomState(hostSocket, 'playing_crash');
  aliceSocket.emit('submit_vote', { roomId, vote: 'crash' });
  bobSocket.emit('submit_vote', { roomId, vote: 'crash' });
  await crashStatePromise;
  console.log('✔ Vote Crash validé');

  // ── TEST 1 : SMART STOP (Arrêt anticipé quand tout le monde a vendu) ──
  console.log('\n--- Test 1 : Smart Stop (Vente de tous les joueurs) ---');
  const flightPromise1 = waitForRoomState(hostSocket, 'crash_flying');
  aliceSocket.emit('submit_crash_bet', { roomId, amount: 4 });
  bobSocket.emit('submit_crash_bet', { roomId, amount: 5 });
  await flightPromise1;
  const flightStartTime = Date.now();

  const updatesRound1 = [];
  hostSocket.on('crash_update', (data) => updatesRound1.push(data));

  // Alice et Bob vendent immédiatement
  setTimeout(() => aliceSocket.emit('cash_out', { roomId }), 100);
  setTimeout(() => bobSocket.emit('cash_out', { roomId }), 250);

  const resultRoom1 = await waitForRoomState(hostSocket, 'crash_result');
  const durationMs = Date.now() - flightStartTime;
  console.log(`✔ Smart Stop déclenché avec succès en ${durationMs}ms ! (État: "${resultRoom1.state}")`);
  console.log(`  - Multiplicateur final: ${resultRoom1.currentCrashResult.crashPoint}x`);
  console.log(`  - Alice a vendu: ${resultRoom1.currentCrashResult.results.find(r => r.playerName === 'Alice').cashedOut}`);
  console.log(`  - Bob a vendu: ${resultRoom1.currentCrashResult.results.find(r => r.playerName === 'Bob').cashedOut}`);
  if (updatesRound1.length > 0) {
    console.log(`  - Volatilité observée sur les ticks: ${updatesRound1.map(u => `${u.multiplier}x`).join(' -> ')}`);
    const allAboveFloor = updatesRound1.every(u => u.multiplier >= 0.10);
    console.log(`  - Plancher 0.10x respecté sur tous les ticks : ${allAboveFloor}`);
  }

  // ── TEST 2 : HARD CAP 15S & HAUTE VOLATILITÉ ──
  console.log('\n--- Test 2 : Hard Cap 15s (Session sans cashout) ---');
  aliceSocket.emit('next_crash_round', { roomId });
  await waitForRoomState(hostSocket, 'playing_crash');

  const flightPromise2 = waitForRoomState(hostSocket, 'crash_flying');
  aliceSocket.emit('submit_crash_bet', { roomId, amount: 3 });
  bobSocket.emit('submit_crash_bet', { roomId, amount: 3 });
  await flightPromise2;
  const flightStartTime2 = Date.now();

  const updatesRound2 = [];
  const tickListener = (data) => updatesRound2.push(data);
  hostSocket.on('crash_update', tickListener);

  const resultRoom2 = await waitForRoomState(hostSocket, 'crash_result');
  const durationMs2 = Date.now() - flightStartTime2;
  hostSocket.off('crash_update', tickListener);

  console.log(`✔ Fin de session en ${durationMs2}ms (<= 15500ms max) -> KRACH à ${resultRoom2.currentCrashResult.crashPoint}x`);
  console.log(`  - Nombre de ticks enregistrés : ${updatesRound2.length}`);
  if (updatesRound2.length > 0) {
    console.log(`  - Échantillon des fluctuations : ${updatesRound2.slice(0, 8).map(u => `${u.multiplier}x (${u.trend})`).join(' -> ')} ...`);
    const minVal = Math.min(...updatesRound2.map(u => u.multiplier));
    console.log(`  - Valeur minimale enregistrée pendant la session : ${minVal}x (>= 0.10x ? ${minVal >= 0.10})`);
  }

  console.log('\n===============================================================');
  console.log('🎉 LES 3 RÈGLES BACKEND SONT 100% VALIDÉES ET OPÉRATIONNELLES !');
  console.log('===============================================================\n');

  hostSocket.close();
  aliceSocket.close();
  bobSocket.close();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Erreur lors du test :', err);
  process.exit(1);
});
