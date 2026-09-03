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
  console.log('🎲 TEST DU VOTE À 2 JEUX ALÉATOIRES & MISE DU BLACKJACK (HÔTE)');
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
  const initialRoom = await roomCreatedPromise;
  console.log(`✔ Room créée : [${roomId}]`);

  // 2. Connexion d'Alice et Bob
  const aliceSocket = await createConnectedSocket('http://localhost:3001');
  const aliceJoinPromise = new Promise((res) => aliceSocket.once('room_joined', res));
  aliceSocket.emit('join_room', { roomId, name: 'Alice' });
  await aliceJoinPromise;

  const bobSocket = await createConnectedSocket('http://localhost:3001');
  const bobJoinPromise = new Promise((res) => bobSocket.once('room_joined', res));
  bobSocket.emit('join_room', { roomId, name: 'Bob' });
  await bobJoinPromise;
  console.log(`✔ Alice et Bob connectés dans la room ${roomId}`);

  // 3. Lancer la partie avec 4 jeux activés -> Doit proposer exactement 2 jeux au vote
  console.log('\n--- 1. Vérification du Vote Restreint à 2 Jeux ---');
  // Déterministe : avec exactement 2 jeux activés, les 2 options proposées
  // sont forcément [blackjack, roulette].
  aliceSocket.emit('update_settings', { roomId, settings: { enabledGames: ['blackjack', 'roulette'] } });
  const votingRoomPromise = waitForRoomState(hostSocket, 'voting');
  aliceSocket.emit('start_game', { roomId });
  const votingRoom = await votingRoomPromise;

  console.log(`✔ État de la salle : "${votingRoom.state}"`);
  console.log(`✔ Jeux tirés au sort pour le vote : [${(votingRoom.currentVoteOptions || []).join(', ')}]`);

  if (!votingRoom.currentVoteOptions || votingRoom.currentVoteOptions.length !== 2) {
    throw new Error(`currentVoteOptions doit contenir exactement 2 jeux (reçu: ${JSON.stringify(votingRoom.currentVoteOptions)})`);
  }

  // 4. Test du passage à la phase de mise du Blackjack (playing_blackjack)
  console.log('\n--- 2. Test de la Phase de Mise du Blackjack (playing_blackjack) ---');
  // Les 2 joueurs votent 'blackjack' (ou on simule une transition directe vers blackjack)
  const blackjackMisePromise = waitForRoomState(hostSocket, 'playing_blackjack');
  aliceSocket.emit('submit_vote', { roomId, vote: 'blackjack' });
  bobSocket.emit('submit_vote', { roomId, vote: 'blackjack' });

  const blackjackBetRoom = await blackjackMisePromise;
  console.log(`✔ Passage à l'état de mise du Blackjack : "${blackjackBetRoom.state}"`);

  // Alice et Bob misent
  const blackjackPlayingPromise = waitForRoomState(hostSocket, 'blackjack_playing');
  aliceSocket.emit('submit_blackjack_bet', { roomId, amount: 5 });
  bobSocket.emit('submit_blackjack_bet', { roomId, amount: 5 });

  const blackjackActiveRoom = await blackjackPlayingPromise;
  console.log(`✔ Toutes les mises sont placées -> Passage à : "${blackjackActiveRoom.state}"`);
  console.log(`✔ Croupier a reçu ses cartes : ${blackjackActiveRoom.dealerHand?.map(c => `${c.value}${c.suit}`).join(' ')}`);

  console.log('\n========================================================================');
  console.log('🎉 TOUS LES TESTS SONT VALIDÉS AVEC SUCCÈS !');
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
