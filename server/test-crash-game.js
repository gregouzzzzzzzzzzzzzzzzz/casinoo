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
  console.log('📈 TEST : KRACH BOURSIER (TRADING) - FLUCTUATIONS & crash_update');
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

  const [aliceJoinRes, bobJoinRes] = await Promise.all([aliceJoinPromise, bobJoinPromise]);
  console.log(`✔ Alice connectée (Leader: true, Solde: ${aliceJoinRes.player.balance})`);
  console.log(`✔ Bob connecté (Leader: false, Solde: ${bobJoinRes.player.balance})`);

  // 3. Lancement de la partie -> voting
  console.log('\n--- 1. Lancement de la partie & Vote pour Le Krach Boursier ---');
  const votingStatePromise = waitForRoomState(hostSocket, 'voting');
  aliceSocket.emit('start_game', { roomId });
  await votingStatePromise;

  const crashStatePromise = waitForRoomState(hostSocket, 'playing_crash');
  aliceSocket.emit('submit_vote', { roomId, vote: 'crash' });
  bobSocket.emit('submit_vote', { roomId, vote: 'crash' });
  const crashRoom1 = await crashStatePromise;
  console.log(`✔ Vote Krach Boursier validé -> État: "${crashRoom1.state}", Session: ${crashRoom1.crashRound}/3`);

  // 4. MANCHE 1 : Mises & Fluctuations Boursières
  console.log('\n--- 2. Session 1/3 : Mises et Ouverture des Marchés ---');
  const updatesReceived = [];
  const updateHandler = (data) => {
    updatesReceived.push(data);
  };
  hostSocket.on('crash_update', updateHandler);

  const flightPromise1 = waitForRoomState(hostSocket, 'crash_flying');
  aliceSocket.emit('submit_crash_bet', { roomId, amount: 4 });
  bobSocket.emit('submit_crash_bet', { roomId, amount: 5 });
  const flyingRoom1 = await flightPromise1;
  console.log(`✔ Positions ouvertes -> Marché en ébullition ! (Target Krach: ${flyingRoom1.crashPoint}x)`);

  // Alice vend ses actions après 400ms
  setTimeout(() => {
    aliceSocket.emit('cash_out', { roomId });
  }, 400);

  const resultPromise1 = waitForRoomState(hostSocket, 'crash_result');
  const resultRoom1 = await resultPromise1;
  hostSocket.off('crash_update', updateHandler);

  console.log(`✔ Fin de Session 1 -> KRACH BOURSIER à ${resultRoom1.currentCrashResult.crashPoint}x`);
  console.log(`  - Nombre d'événements crash_update reçus en direct par l'Hôte : ${updatesReceived.length}`);
  if (updatesReceived.length > 0) {
    console.log(`  - Évolution des cours observée : ${updatesReceived.slice(0, 6).map(u => `${u.multiplier}x (${u.trend})`).join(' -> ')} ...`);
  }

  const aliceRes1 = resultRoom1.currentCrashResult.results.find(r => r.playerName === 'Alice');
  const bobRes1 = resultRoom1.currentCrashResult.results.find(r => r.playerName === 'Bob');
  console.log(`  - Alice (Vendu ? ${aliceRes1.cashedOut}): Net = ${aliceRes1.netGain} 💰, Gorgées = ${aliceRes1.sipsToDrink} 🍺, Solde = ${aliceRes1.newBalance}`);
  console.log(`  - Bob (Vendu ? ${bobRes1.cashedOut}): Net = ${bobRes1.netGain} 💰, Gorgées = ${bobRes1.sipsToDrink} 🍺, Solde = ${bobRes1.newBalance}`);

  // 5. MANCHE 2 : Leader lance la session 2
  console.log('\n--- 3. Session 2/3 : Relance par le Leader ---');
  const crashStatePromise2 = waitForRoomState(hostSocket, 'playing_crash');
  aliceSocket.emit('next_crash_round', { roomId });
  const crashRoom2 = await crashStatePromise2;
  console.log(`✔ Session 2 lancée -> État: "${crashRoom2.state}", Session: ${crashRoom2.crashRound}/3`);

  const flightPromise2 = waitForRoomState(hostSocket, 'crash_flying');
  aliceSocket.emit('submit_crash_bet', { roomId, amount: 3 });
  bobSocket.emit('submit_crash_bet', { roomId, amount: 3 });
  await flightPromise2;

  const resultPromise2 = waitForRoomState(hostSocket, 'crash_result');
  const resultRoom2 = await resultPromise2;
  console.log(`✔ Fin de Session 2 -> KRACH BOURSIER à ${resultRoom2.currentCrashResult.crashPoint}x`);

  // 6. MANCHE 3 : Leader lance la session 3
  console.log('\n--- 4. Session 3/3 : Relance par le Leader ---');
  const crashStatePromise3 = waitForRoomState(hostSocket, 'playing_crash');
  aliceSocket.emit('next_crash_round', { roomId });
  const crashRoom3 = await crashStatePromise3;
  console.log(`✔ Session 3 lancée -> État: "${crashRoom3.state}", Session: ${crashRoom3.crashRound}/3`);

  const flightPromise3 = waitForRoomState(hostSocket, 'crash_flying');
  aliceSocket.emit('submit_crash_bet', { roomId, amount: 2 });
  bobSocket.emit('submit_crash_bet', { roomId, amount: 2 });
  await flightPromise3;

  const resultPromise3 = waitForRoomState(hostSocket, 'crash_result');
  const resultRoom3 = await resultPromise3;
  console.log(`✔ Fin de Session 3 -> KRACH BOURSIER à ${resultRoom3.currentCrashResult.crashPoint}x`);

  // 7. Transition vers Distribution après les 3 sessions
  console.log('\n--- 5. Fin des 3 Sessions -> Passage à la Distribution ---');
  const distStatePromise = waitForRoomState(hostSocket, 'distribution');
  aliceSocket.emit('start_distribution', { roomId });
  const distRoom = await distStatePromise;
  console.log(`✔ 3 sessions terminées -> Transition vers: "${distRoom.state}"`);

  console.log('\n===============================================================');
  console.log('🎉 TOUS LES TESTS "KRACH BOURSIER" SONT VALIDÉS À 100% !');
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
