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
  console.log('♠ TEST COMPLET DU MINI-JEU : LE BLACKJACK (CASINO)');
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

  // 3. Phase de Vote -> Blackjack
  console.log('\n--- 1. Phase de Vote : Choix du Blackjack ---');
  const votingStatePromise = waitForRoomState(hostSocket, 'voting');
  aliceSocket.emit('start_game', { roomId });
  await votingStatePromise;

  const bjBettingStatePromise = waitForRoomState(hostSocket, 'playing_blackjack');
  aliceSocket.emit('submit_vote', { roomId, vote: 'blackjack' });
  bobSocket.emit('submit_vote', { roomId, vote: 'blackjack' });
  const bjRoom = await bjBettingStatePromise;
  console.log(`✔ Vote validé -> État: "${bjRoom.state}"`);

  // 4. Phase 1 : Prise des Mises
  console.log('\n--- 2. Phase 1 : Prise des Mises ---');
  const bjPlayingPromise = waitForRoomState(hostSocket, 'blackjack_playing');
  aliceSocket.emit('submit_blackjack_bet', { roomId, amount: 4 });
  bobSocket.emit('submit_blackjack_bet', { roomId, amount: 5 });
  const dealtRoom = await bjPlayingPromise;
  console.log(`✔ Mises validées -> Cartes distribuées ! État: "${dealtRoom.state}"`);

  const aliceDealt = dealtRoom.players.find(p => p.name === 'Alice');
  const bobDealt = dealtRoom.players.find(p => p.name === 'Bob');
  console.log(`  - Cartes Alice: ${aliceDealt.hand.map(c => `${c.value}${c.suit}`).join(' ')} (Statut: ${aliceDealt.blackjackStatus})`);
  console.log(`  - Cartes Bob: ${bobDealt.hand.map(c => `${c.value}${c.suit}`).join(' ')} (Statut: ${bobDealt.blackjackStatus})`);
  console.log(`  - Carte Croupier visible: ${dealtRoom.dealerHand.map(c => `${c.value}${c.suit}`).join(' ')}`);

  // 5. Phase 2 : Jeu Asynchrone (Tirer / Rester)
  console.log('\n--- 3. Phase 2 : Actions des Joueurs (Tirer / Rester) ---');
  // Alice hits if currently playing
  if (aliceDealt.blackjackStatus === 'playing') {
    aliceSocket.emit('blackjack_hit', { roomId });
    await new Promise(r => setTimeout(r, 200));
  }
  // Then Alice stands
  aliceSocket.emit('blackjack_stand', { roomId });

  // Bob stands
  bobSocket.emit('blackjack_stand', { roomId });

  // 6. Phase 3 : Tour du Croupier & Résultat
  console.log('\n--- 4. Phase 3 : Tirage du Croupier & Résolution ---');
  const resultRoom = await waitForRoomState(hostSocket, 'blackjack_result');
  console.log(`✔ Fin du tour de Blackjack -> État: "${resultRoom.state}"`);
  console.log(`  - Main finale du Croupier: ${resultRoom.currentBlackjackResult.dealerHand.map(c => `${c.value}${c.suit}`).join(' ')} (Score: ${resultRoom.currentBlackjackResult.dealerScore}, Busté: ${resultRoom.currentBlackjackResult.dealerBusted})`);

  resultRoom.currentBlackjackResult.results.forEach(r => {
    console.log(`  - Joueur ${r.playerName}: Score=${r.score}, Statut=${r.status}, Net=${r.netGain} 💰, Gorgées=${r.sipsToDrink} 🍺, Nouveau Solde=${r.newBalance}`);
  });

  // 7. Navigation du Leader -> Distribution
  console.log('\n--- 5. Navigation : Transition vers la Distribution ---');
  const distStatePromise = waitForRoomState(hostSocket, 'distribution');
  aliceSocket.emit('start_distribution', { roomId });
  const distRoom = await distStatePromise;
  console.log(`✔ Transition vers distribution réussie -> État: "${distRoom.state}"`);

  console.log('\n===============================================================');
  console.log('🎉 TOUS LES TESTS DU BLACKJACK SONT VALIDÉS À 100% !');
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
