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
  console.log('🚀 TEST : CONTRÔLE DE LA PARTIE PAR LE CHEF DE GROUPE (LEADER)');
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

  // 2. Connexion du 1er joueur (Alice)
  const aliceSocket = await createConnectedSocket('http://localhost:3001');
  const aliceJoinPromise = new Promise((res) => aliceSocket.once('room_joined', res));
  aliceSocket.emit('join_room', { roomId, name: 'Alice' });
  const aliceJoinRes = await aliceJoinPromise;

  console.log(`✔ Alice connectée (ID: ${aliceJoinRes.player.id})`);
  console.log(`  - Vérification leader: room.leaderId = ${aliceJoinRes.room.leaderId} === Alice ? ${aliceJoinRes.room.leaderId === aliceJoinRes.player.id}`);
  if (aliceJoinRes.room.leaderId !== aliceJoinRes.player.id) {
    throw new Error('Le 1er joueur devrait être désigné comme Leader !');
  }

  // 3. Connexion du 2ème joueur (Bob)
  const bobSocket = await createConnectedSocket('http://localhost:3001');
  const bobJoinPromise = new Promise((res) => bobSocket.once('room_joined', res));
  bobSocket.emit('join_room', { roomId, name: 'Bob' });
  const bobJoinRes = await bobJoinPromise;

  console.log(`✔ Bob connecté (ID: ${bobJoinRes.player.id})`);
  console.log(`  - Vérification leader: Le leader reste Alice ? ${bobJoinRes.room.leaderId === aliceJoinRes.player.id}`);
  if (bobJoinRes.room.leaderId !== aliceJoinRes.player.id) {
    throw new Error('Le Leader ne doit pas changer à l\'arrivée d\'un nouveau joueur !');
  }

  // 4. Alice (Leader) lance la partie depuis son smartphone
  console.log('\n--- 1. Alice (Leader) lance la partie ---');
  const votingStatePromise = waitForRoomState(hostSocket, 'voting');
  aliceSocket.emit('start_game', { roomId });
  const votingRoom = await votingStatePromise;
  console.log(`✔ Partie lancée par Alice -> État de la room : "${votingRoom.state}"`);

  // 5. Votes et roulette
  console.log('\n--- 2. Votes et Mises ---');
  const rouletteStatePromise = waitForRoomState(hostSocket, 'playing_roulette');
  aliceSocket.emit('submit_vote', { roomId, vote: 'roulette' });
  bobSocket.emit('submit_vote', { roomId, vote: 'roulette' });
  await rouletteStatePromise;
  console.log('✔ Transition vers "playing_roulette"');

  const spinningStatePromise = waitForRoomState(hostSocket, 'roulette_spinning');
  aliceSocket.emit('submit_bet', { roomId, amount: 4, color: 'red' });
  bobSocket.emit('submit_bet', { roomId, amount: 5, color: 'black' });
  await spinningStatePromise;
  console.log('✔ Mises placées -> Transition vers "roulette_spinning"');

  const resultStatePromise = waitForRoomState(hostSocket, 'roulette_result');
  const resultRoom = await resultStatePromise;
  console.log(`✔ Tirage terminé -> État : "${resultRoom.state}" (Gagnant: ${resultRoom.currentResult.winningColor.toUpperCase()})`);

  // 6. Alice (Leader) passe à la distribution depuis son smartphone
  console.log('\n--- 3. Alice (Leader) passe à la distribution ---');
  const distributionStatePromise = waitForRoomState(hostSocket, 'distribution');
  aliceSocket.emit('start_distribution', { roomId });
  const distRoom = await distributionStatePromise;
  console.log(`✔ Distribution lancée par Alice -> État : "${distRoom.state}"`);

  // 7. Alice (Leader) termine le tour depuis son smartphone
  console.log('\n--- 4. Alice (Leader) termine le tour ---');
  const nextRoundStatePromise = waitForRoomState(hostSocket, 'voting');
  aliceSocket.emit('end_turn', { roomId });
  const nextRoom = await nextRoundStatePromise;
  console.log(`✔ Tour terminé par Alice -> Retour à l'état : "${nextRoom.state}"`);

  // 8. Test de Failover : Alice se déconnecte -> Bob devient le nouveau Leader
  console.log('\n--- 5. Test de réattribution du Leader (Failover) ---');
  const failoverPromise = new Promise((resolve) => {
    const handler = ({ room }) => {
      if (room && room.leaderId === bobJoinRes.player.id) {
        bobSocket.off('room_updated', handler);
        resolve(room);
      }
    };
    bobSocket.on('room_updated', handler);
  });

  aliceSocket.disconnect();
  const failoverRoom = await failoverPromise;
  console.log(`✔ Alice déconnectée -> Bob est devenu le nouveau Leader : room.leaderId = ${failoverRoom.leaderId} === Bob ? ${failoverRoom.leaderId === bobJoinRes.player.id}`);

  console.log('\n===============================================================');
  console.log('🎉 TOUS LES TESTS DE CONTRÔLE PAR LE LEADER SONT VALIDÉS À 100% !');
  console.log('===============================================================\n');

  hostSocket.close();
  bobSocket.close();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Erreur lors du test :', err);
  process.exit(1);
});
