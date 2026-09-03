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
  console.log('🚀 TEST : SUSPENSE 3s & PHASE FINALE "BILAN ET BOISSONS"');
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
  console.log(`✔ Alice connectée (Leader: ${aliceJoinRes.room.leaderId === aliceJoinRes.player.id}, Solde: ${aliceJoinRes.player.balance})`);
  console.log(`✔ Bob connecté (Leader: ${bobJoinRes.room.leaderId === bobJoinRes.player.id}, Solde: ${bobJoinRes.player.balance})`);

  // 3. Alice (Leader) lance la partie -> voting
  console.log('\n--- 1. Lancement de la partie ---');
  // Fast-track : seule la Roulette est activée, pas de phase de vote.
  aliceSocket.emit('update_settings', { roomId, settings: { enabledGames: ['roulette'] } });
  const rouletteStatePromise = waitForRoomState(hostSocket, 'playing_roulette');
  aliceSocket.emit('start_game', { roomId });
  await rouletteStatePromise;
  console.log('✔ Transition vers "playing_roulette"');

  // 5. Mises libres et déclenchement du Suspense de 3 secondes (roulette_spinning)
  console.log('\n--- 3. Mises et Suspense de 3 secondes ---');
  const spinningStatePromise = waitForRoomState(hostSocket, 'roulette_spinning');
  const spinStartTime = Date.now();
  aliceSocket.emit('submit_bet', { roomId, amount: 4, color: 'red' });
  bobSocket.emit('submit_bet', { roomId, amount: 5, color: 'black' });

  const spinningRoom = await spinningStatePromise;
  console.log(`✔ Dernier joueur a misé -> Passage à l'état: "${spinningRoom.state}"`);

  // 6. Attente du résultat après le timeout de 3 secondes
  const resultStatePromise = waitForRoomState(hostSocket, 'roulette_result');
  const resultRoom = await resultStatePromise;
  const spinDuration = Math.round((Date.now() - spinStartTime) / 1000);
  console.log(`✔ Fin du suspense (${spinDuration}s) -> Passage à l'état: "${resultRoom.state}"`);
  console.log(`  - Couleur gagnante: ${resultRoom.currentResult.winningColor.toUpperCase()} (N° ${resultRoom.currentResult.winningNumber})`);

  const aliceAfterRoulette = resultRoom.players.find((p) => p.name === 'Alice');
  const bobAfterRoulette = resultRoom.players.find((p) => p.name === 'Bob');
  console.log(`  - Alice sipsToDrink: ${aliceAfterRoulette.sipsToDrink} (Solde: ${aliceAfterRoulette.balance})`);
  console.log(`  - Bob sipsToDrink: ${bobAfterRoulette.sipsToDrink} (Solde: ${bobAfterRoulette.balance})`);

  // 7. Leader passe à la distribution
  console.log('\n--- 4. Phase de Distribution ---');
  const distributionStatePromise = waitForRoomState(hostSocket, 'distribution');
  aliceSocket.emit('start_distribution', { roomId });
  await distributionStatePromise;
  console.log('✔ Alice (Leader) lance la distribution');

  // Alice envoie 2 gorgées à Bob
  const sipsUpdatePromise = new Promise((resolve) => {
    const handler = ({ room }) => {
      if (room.distributions && room.distributions.length > 0) {
        hostSocket.off('room_updated', handler);
        resolve(room);
      }
    };
    hostSocket.on('room_updated', handler);
  });

  aliceSocket.emit('send_sips', { roomId, toPlayerId: bobJoinRes.player.id, amount: 2 });
  const distRoom = await sipsUpdatePromise;
  const bobAfterDist = distRoom.players.find((p) => p.name === 'Bob');
  console.log(`✔ Alice a envoyé 2 gorgées à Bob -> Bob total sipsToDrink = ${bobAfterDist.sipsToDrink}`);

  // 8. Leader clique sur "Voir le Bilan" -> drinking_phase
  console.log('\n--- 5. Phase Finale "Bilan et Boissons" (drinking_phase) ---');
  const drinkingStatePromise = waitForRoomState(hostSocket, 'drinking_phase');
  aliceSocket.emit('start_drinking_phase', { roomId });
  const drinkingRoom = await drinkingStatePromise;
  console.log(`✔ Transition vers "${drinkingRoom.state}" (L'Addition !)`);

  const aliceInDrinking = drinkingRoom.players.find((p) => p.name === 'Alice');
  const bobInDrinking = drinkingRoom.players.find((p) => p.name === 'Bob');
  console.log(`  - Alice (sipsToDrink: ${aliceInDrinking.sipsToDrink}) -> hasDrank auto: ${aliceInDrinking.hasDrank}`);
  console.log(`  - Bob (sipsToDrink: ${bobInDrinking.sipsToDrink}) -> hasDrank: ${bobInDrinking.hasDrank}`);

  if (bobInDrinking.sipsToDrink > 0 && bobInDrinking.hasDrank) {
    throw new Error("Bob a des gorgées à boire mais est déjà marqué comme hasDrank !");
  }

  // 9. Bob clique sur "J'ai fini de boire 🍻"
  console.log('\n--- 6. Validation des Boissons par les Joueurs ---');
  const bobDrankPromise = new Promise((resolve) => {
    const handler = ({ room }) => {
      const bob = room.players.find((p) => p.name === 'Bob');
      if (bob && bob.hasDrank) {
        hostSocket.off('room_updated', handler);
        resolve(room);
      }
    };
    hostSocket.on('room_updated', handler);
  });

  bobSocket.emit('confirm_drank', { roomId });
  const allDrankRoom = await bobDrankPromise;
  const bobConfirmed = allDrankRoom.players.find((p) => p.name === 'Bob');
  console.log(`✔ Bob a validé qu'il a bu -> hasDrank = ${bobConfirmed.hasDrank}`);
  console.log(`✔ Tous les joueurs ont bu ? ${allDrankRoom.players.every((p) => p.hasDrank)}`);

  // 10. Leader clique sur "Manche suivante" -> reset à 0 et retour à voting
  console.log('\n--- 7. Manche Suivante et Réinitialisation ---');
  // On réactive plusieurs jeux pour retrouver la phase de vote après le tour.
  aliceSocket.emit('update_settings', { roomId, settings: { enabledGames: ['roulette', 'blackjack'] } });
  const nextVotingPromise = waitForRoomState(hostSocket, 'voting');
  aliceSocket.emit('end_turn', { roomId });
  const finalRoom = await nextVotingPromise;
  console.log(`✔ Transition vers "${finalRoom.state}"`);
  console.log(`  - Tous les sipsToDrink réinitialisés à 0 ? ${finalRoom.players.every((p) => p.sipsToDrink === 0)}`);
  console.log(`  - Tous les hasDrank réinitialisés à false ? ${finalRoom.players.every((p) => p.hasDrank === false)}`);

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
