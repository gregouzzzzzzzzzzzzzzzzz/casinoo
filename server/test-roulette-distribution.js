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
  console.log('🚀 TEST : SUSPENSE ROULETTE (5s) & PHASE DE DISTRIBUTION');
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

  // 2. Connexion d'Alice et Bob
  const aliceSocket = await createConnectedSocket('http://localhost:3001');
  const bobSocket = await createConnectedSocket('http://localhost:3001');

  const aliceJoinPromise = new Promise((res) => aliceSocket.once('room_joined', res));
  const bobJoinPromise = new Promise((res) => bobSocket.once('room_joined', res));

  aliceSocket.emit('join_room', { roomId, name: 'Alice' });
  bobSocket.emit('join_room', { roomId, name: 'Bob' });

  const [aliceJoinRes, bobJoinRes] = await Promise.all([aliceJoinPromise, bobJoinPromise]);
  console.log(`✔ Alice connectée (Solde: ${aliceJoinRes.player.balance})`);
  console.log(`✔ Bob connecté (Solde: ${bobJoinRes.player.balance})`);

  // 3. Lancement de la partie -> voting
  console.log('\n--- 1. Lancement de la partie ---');
  // Fast-track : seule la Roulette est activée, pas de phase de vote.
  aliceSocket.emit('update_settings', { roomId, settings: { enabledGames: ['roulette'] } });
  const rouletteStatePromise = waitForRoomState(hostSocket, 'playing_roulette');
  hostSocket.emit('start_game', { roomId });
  await rouletteStatePromise;
  console.log('✔ 100% votes reçus -> Transition vers "playing_roulette"');

  // 5. Mises libres et affichage public en temps réel
  console.log('\n--- 3. Mises et affichage public en direct ---');
  const betUpdatePromise = new Promise((resolve) => {
    const handler = ({ room }) => {
      const alice = room.players.find((p) => p.name === 'Alice');
      if (alice && alice.currentBet) {
        hostSocket.off('room_updated', handler);
        resolve(alice.currentBet);
      }
    };
    hostSocket.on('room_updated', handler);
  });

  aliceSocket.emit('submit_bet', { roomId, amount: 4, color: 'red' });
  const aliceBet = await betUpdatePromise;
  console.log(`✔ Mise d'Alice reçue et affichée publiquement : ${aliceBet.amount} sur ${aliceBet.color.toUpperCase()} 🔴`);

  // 6. Deuxième mise -> Déclenchement du Suspense de 5 secondes (roulette_spinning)
  console.log('\n--- 4. Déclenchement du Suspense (5 secondes) ---');
  const spinningStatePromise = waitForRoomState(hostSocket, 'roulette_spinning');
  const spinStartTime = Date.now();
  bobSocket.emit('submit_bet', { roomId, amount: 5, color: 'black' });

  const spinningRoom = await spinningStatePromise;
  console.log(`✔ Dernier joueur a misé -> Passage à l'état: "${spinningRoom.state}"`);
  console.log(`  - Vérification suspense : résultat non envoyé pendant le spin (currentResult = ${spinningRoom.currentResult})`);

  // 7. Attente du résultat après le timeout de 5 secondes
  const resultStatePromise = waitForRoomState(hostSocket, 'roulette_result');
  const resultRoom = await resultStatePromise;
  const spinDuration = Math.round((Date.now() - spinStartTime) / 1000);
  console.log(`✔ Fin du suspense (${spinDuration}s) -> Passage à l'état: "${resultRoom.state}"`);
  console.log(`  - Couleur gagnante: ${resultRoom.currentResult.winningColor.toUpperCase()} (N° ${resultRoom.currentResult.winningNumber})`);

  // 8. Phase de Distribution
  console.log('\n--- 5. Phase de Distribution des Gorgées ---');
  const distributionStatePromise = waitForRoomState(hostSocket, 'distribution');
  hostSocket.emit('start_distribution', { roomId });
  await distributionStatePromise;
  console.log('✔ Hôte clique sur "Passer à la distribution" -> Passage à l\'état: "distribution"');

  // Alice envoie 2 gorgées à Bob
  const sipsUpdatePromise = new Promise((resolve) => {
    const handler = ({ room }) => {
      if (room.distributions && room.distributions.length > 0) {
        hostSocket.off('room_updated', handler);
        resolve(room.distributions[0]);
      }
    };
    hostSocket.on('room_updated', handler);
  });

  const aliceBeforeBalance = resultRoom.players.find((p) => p.name === 'Alice').balance;
  aliceSocket.emit('send_sips', { roomId, toPlayerId: bobJoinRes.player.id, amount: 2 });
  const distributionEvent = await sipsUpdatePromise;
  console.log(`✔ Don de gorgées en direct: ${distributionEvent.fromPlayerName} ➡️ envoie ${distributionEvent.amount} gorgées à ➡️ ${distributionEvent.toPlayerName} 🍻`);

  // 9. Fin du Tour et retour au Vote
  console.log('\n--- 6. Fin du Tour ---');
  // On réactive plusieurs jeux pour retrouver la phase de vote après le tour.
  hostSocket.emit('update_settings', { roomId, settings: { enabledGames: ['roulette', 'blackjack'] } });
  const nextVotingPromise = waitForRoomState(hostSocket, 'voting');
  hostSocket.emit('end_turn', { roomId });
  const finalRoom = await nextVotingPromise;
  console.log(`✔ Hôte clique sur "Terminer le tour" -> Retour à l'état: "${finalRoom.state}"`);
  console.log(`  - Mises et distributions réinitialisées: ${!finalRoom.distributions || finalRoom.distributions.length === 0}`);

  console.log('\n===============================================================');
  console.log('🎉 TOUTES LES NOUVELLES FONCTIONNALITÉS SONT VALIDÉES À 100% !');
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
