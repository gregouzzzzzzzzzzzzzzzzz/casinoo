const { io } = require('socket.io-client');
const http = require('http');

function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
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

async function runGameLoopTest() {
  console.log('=====================================================');
  console.log('🚀 TEST DE LA GAME LOOP COMPLÈTE (CASINO À BOIRE)');
  console.log('=====================================================\n');

  console.log('Attente de la disponibilité du serveur...');
  await waitForServer('http://localhost:3001/health');
  console.log('✔ Serveur opérationnel sur http://localhost:3001');

  // 1. Connexion de l'Hôte et Création de la Room
  const hostSocket = await createConnectedSocket('http://localhost:3001');
  console.log('✔ Socket Hôte connectée');

  let roomId = '';
  const roomCreatedPromise = new Promise((resolve) => {
    hostSocket.once('room_created', ({ room }) => {
      roomId = room.id;
      console.log(`✔ Room créée: [${room.id}] (État: ${room.state})`);
      resolve(room);
    });
  });
  hostSocket.emit('create_room');
  await roomCreatedPromise;

  // 2. Connexion des Joueurs Alice et Bob
  const aliceSocket = await createConnectedSocket('http://localhost:3001');
  const bobSocket = await createConnectedSocket('http://localhost:3001');
  console.log('✔ Sockets Joueurs (Alice & Bob) connectées');

  const aliceJoinPromise = new Promise((res) => aliceSocket.once('room_joined', res));
  const bobJoinPromise = new Promise((res) => bobSocket.once('room_joined', res));

  aliceSocket.emit('join_room', { roomId, name: 'Alice' });
  bobSocket.emit('join_room', { roomId, name: 'Bob' });

  const [aliceJoinRes, bobJoinRes] = await Promise.all([aliceJoinPromise, bobJoinPromise]);
  console.log(`✔ Alice a rejoint (Solde initial: ${aliceJoinRes.player.balance} jetons)`);
  console.log(`✔ Bob a rejoint (Solde initial: ${bobJoinRes.player.balance} jetons)`);

  // 3. Lancement de la partie par l'Hôte
  console.log('\n--- 1. Lancement de la partie ---');
  // Fast-track : seule la Roulette est activée, pas de phase de vote.
  aliceSocket.emit('update_settings', { roomId, settings: { enabledGames: ['roulette'] } });
  const rouletteStatePromise = waitForRoomState(hostSocket, 'playing_roulette');
  hostSocket.emit('start_game', { roomId });
  const rouletteRoom = await rouletteStatePromise;
  console.log(`✔ Fast-track (1 seul jeu activé) -> Transition vers l'état: ${rouletteRoom.state}`);

  // 5. Mini-Jeu Roulette (Prise des mises)
  console.log('\n--- 3. Mini-jeu Roulette (Prise des paris) ---');
  const resultStatePromise = waitForRoomState(hostSocket, 'roulette_result');

  // Alice mise 5 jetons sur Rouge (🔴)
  aliceSocket.emit('submit_bet', { roomId, amount: 5, color: 'red' });
  console.log('✔ Alice a misé 5 jetons sur 🔴 ROUGE');

  // Bob mise 5 jetons sur Noir (⚫)
  bobSocket.emit('submit_bet', { roomId, amount: 5, color: 'black' });
  console.log('✔ Bob a misé 5 jetons sur ⚫ NOIR');

  // 6. Résolution de la manche par le serveur
  console.log('\n--- 4. Résolution de la manche ---');
  const resultRoom = await resultStatePromise;
  const result = resultRoom.currentResult;
  console.log(`✔ Tirage effectué par le serveur !`);
  console.log(`  - Numéro tiré: ${result.winningNumber}`);
  console.log(`  - Couleur gagnante: ${result.winningColor.toUpperCase()}`);

  console.log('\n--- Tableau des Résultats de la manche ---');
  result.results.forEach((r) => {
    console.log(
      `  - ${r.playerName}: Choix=${r.chosenColor}, Mise=${r.betAmount}, ${r.won ? 'GAGNÉ 🎉' : 'PERDU 💀'}, Gain net=${r.netGain >= 0 ? '+' : ''}${r.netGain}, Nouveau solde=${r.newBalance} jetons`
    );
  });

  // Vérifications d'intégrité
  if (!result || !result.winningColor || result.results.length !== 2) {
    throw new Error('Résultats de manche invalides !');
  }

  // 7. Passage à la Manche Suivante par l'Hôte
  console.log('\n--- 5. Manche Suivante ---');
  const nextRoundPromise = waitForRoomState(hostSocket, 'playing_roulette');
  hostSocket.emit('end_turn', { roomId });
  const nextRoundRoom = await nextRoundPromise;
  console.log(`✔ 'Manche Suivante' (end_turn) -> État: ${nextRoundRoom.state} (Manche ${nextRoundRoom.currentRound})`);
  if (nextRoundRoom.currentRound !== 2) throw new Error('La manche aurait dû passer à 2 !');
  console.log(`  - Votes réinitialisés: ${Object.keys(nextRoundRoom.votes || {}).length === 0}`);
  console.log(`  - Mises réinitialisées: ${Object.keys(nextRoundRoom.bets || {}).length === 0}`);

  console.log('\n=====================================================');
  console.log('🎉 TOUS LES TESTS DE LA GAME LOOP SONT VALIDÉS À 100% !');
  console.log('=====================================================\n');

  hostSocket.close();
  aliceSocket.close();
  bobSocket.close();
  process.exit(0);
}

runGameLoopTest().catch((err) => {
  console.error('Erreur lors du test :', err);
  process.exit(1);
});
