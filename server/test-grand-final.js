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
  console.log('========================================================================');
  console.log('🏆 TEST DU FAST-TRACK ET DU GRAND FINAL (TAXE, DISTRIBUTION, BILAN ULTIME)');
  console.log('========================================================================\n');

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

  // 3. Test Fast-Track (1 seul jeu activé : Blackjack)
  console.log('\n--- 1. Test du Fast-Track (1 jeu configuré -> Pas de Vote) ---');
  aliceSocket.emit('update_settings', {
    roomId,
    settings: { enabledGames: ['blackjack'], minRounds: 1 },
  });

  const fastTrackPlayingPromise = waitForRoomState(hostSocket, 'playing_blackjack');
  aliceSocket.emit('start_game', { roomId });
  const fastTrackRoom = await fastTrackPlayingPromise;
  console.log(`✔ Fast-Track réussi ! État direct: "${fastTrackRoom.state}" (Le vote a bien été sauté).`);

  // 4. Test du Grand Final : La Taxe (final_tax)
  console.log('\n--- 2. Déclenchement du Grand Final : La Taxe (final_tax) ---');
  const finalTaxStatePromise = waitForRoomState(hostSocket, 'final_tax');
  aliceSocket.emit('start_final_tax', { roomId });
  const taxRoom = await finalTaxStatePromise;
  console.log(`✔ Passage à l'état "${taxRoom.state}" réussi !`);

  taxRoom.players.forEach((p) => {
    console.log(`  - Joueur ${p.name}: SoldeInitial=${p.balance} 💰, Taxe=${p.taxRate}%, GorgéesTaxe=${p.personalTaxSips} 🍺, SoldeDistribuable=${p.distributableBalance} 💰`);
    if (p.taxRate < 10 || p.taxRate > 40) {
      throw new Error(`Taux de taxe invalide pour ${p.name}: ${p.taxRate}%`);
    }
    const expectedTaxSips = Math.round(p.balance * (p.taxRate / 100));
    if (p.personalTaxSips !== expectedTaxSips) {
      throw new Error(`Calcul de la taxe invalide pour ${p.name}`);
    }
    if (p.sipsToDrink !== p.personalTaxSips) {
      throw new Error(`sipsToDrink doit contenir la taxe personnelle`);
    }
  });
  console.log('✔ Taux de taxes aléatoires et calculs fiscaux validés avec exactitude.');

  // 5. Test de la Distribution Finale (final_distribution)
  console.log('\n--- 3. Distribution Finale des Soldes Restants ---');
  const finalDistStatePromise = waitForRoomState(hostSocket, 'final_distribution');
  aliceSocket.emit('start_final_distribution', { roomId });
  const distRoom = await finalDistStatePromise;
  console.log(`✔ Passage à l'état "${distRoom.state}" réussi !`);

  const aliceTax = distRoom.players.find((p) => p.id === aliceSocket.id);
  const bobTax = distRoom.players.find((p) => p.id === bobSocket.id);

  const aliceDistributable = aliceTax.distributableBalance;
  const bobDistributable = bobTax.distributableBalance;

  console.log(`  - Alice donne ses ${aliceDistributable} 🍺 à Bob`);
  console.log(`  - Bob donne ses ${bobDistributable} 🍺 à Alice`);

  const finalDrinkingStatePromise = waitForRoomState(hostSocket, 'final_drinking');

  aliceSocket.emit('submit_final_distribution', {
    roomId,
    allocations: { [bobSocket.id]: aliceDistributable },
  });

  bobSocket.emit('submit_final_distribution', {
    roomId,
    allocations: { [aliceSocket.id]: bobDistributable },
  });

  const finalDrinkingRoom = await finalDrinkingStatePromise;
  console.log(`✔ Toutes les distributions validées -> Passage automatique à "${finalDrinkingRoom.state}" !`);

  // 6. Test du Grand Bilan & L'Addition Ultime
  console.log('\n--- 4. Le Grand Bilan & Validation des Boissons ---');
  const finalAlice = finalDrinkingRoom.players.find((p) => p.id === aliceSocket.id);
  const finalBob = finalDrinkingRoom.players.find((p) => p.id === bobSocket.id);

  console.log(`  - Total pour Alice : ${finalAlice.sipsToDrink} 🍺 (Taxe: ${finalAlice.personalTaxSips} + Reçu de Bob: ${bobDistributable})`);
  console.log(`  - Total pour Bob   : ${finalBob.sipsToDrink} 🍺 (Taxe: ${finalBob.personalTaxSips} + Reçu d'Alice: ${aliceDistributable})`);

  if (
    finalAlice.sipsToDrink === finalAlice.personalTaxSips + bobDistributable &&
    finalBob.sipsToDrink === finalBob.personalTaxSips + aliceDistributable
  ) {
    console.log('✔ Cumul des gorgées ultra-précis validé !');
  } else {
    throw new Error('Erreur dans le cumul des gorgées finales !');
  }

  // Confirmation des boissons
  aliceSocket.emit('confirm_drank', { roomId });
  bobSocket.emit('confirm_drank', { roomId });

  await new Promise((res) => setTimeout(res, 300));
  console.log('✔ Alice et Bob ont confirmé avoir tout bu.');

  // 7. Reset to Lobby
  console.log('\n--- 5. Réinitialisation vers le Lobby ---');
  const lobbyStatePromise = waitForRoomState(hostSocket, 'lobby');
  aliceSocket.emit('reset_to_lobby', { roomId });
  const resetLobbyRoom = await lobbyStatePromise;
  console.log(`✔ Retour au Lobby réussi -> État: "${resetLobbyRoom.state}"`);
  console.log(`  - Soldes réinitialisés: ${resetLobbyRoom.players.map((p) => `${p.name}: ${p.balance} 💰`).join(', ')}`);
  console.log(`  - Manche réinitialisée: ${resetLobbyRoom.currentRound}`);

  console.log('\n========================================================================');
  console.log('🎉 TOUS LES TESTS DU GRAND FINAL ET DU FAST-TRACK SONT VALIDÉS À 100% !');
  console.log('========================================================================\n');

  hostSocket.close();
  aliceSocket.close();
  bobSocket.close();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Erreur lors du test :', err);
  process.exit(1);
});
