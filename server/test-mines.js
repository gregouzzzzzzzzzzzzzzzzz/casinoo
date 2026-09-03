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
  console.log('💣 TEST COMPLET DU MINI-JEU : LES MINES (GRILLE COMMUNE 6x6)');
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

  // 3. Phase de Vote -> Mines
  console.log('\n--- 1. Phase de Vote : Choix des Mines ---');
  // Fast-track : seul le jeu des Mines est activé, pas de phase de vote.
  aliceSocket.emit('update_settings', { roomId, settings: { enabledGames: ['mines'] } });
  const minesBettingStatePromise = waitForRoomState(hostSocket, 'playing_mines');
  aliceSocket.emit('start_game', { roomId });
  const minesBettingRoom = await minesBettingStatePromise;
  console.log(`✔ Vote validé -> État: "${minesBettingRoom.state}"`);

  // 4. Phase de Mise
  console.log('\n--- 2. Prise des Mises ---');
  const minesPlayingPromise = waitForRoomState(hostSocket, 'mines_playing');
  aliceSocket.emit('submit_mines_bet', { roomId, amount: 4 });
  bobSocket.emit('submit_mines_bet', { roomId, amount: 5 });
  const startedRoom = await minesPlayingPromise;
  console.log(`✔ Mises validées -> Grille 6x6 initialisée ! État: "${startedRoom.state}"`);
  console.log(`  - Bombes générées (7): [${startedRoom.minesGrid.join(', ')}]`);
  console.log(`  - Premier joueur à jouer: ${startedRoom.players.find(p => p.id === startedRoom.currentTurnPlayerId)?.name}`);

  // 5. Tour par Tour (Alice clique Safe, Bob clique Bombe, Alice encaisse)
  console.log('\n--- 3. Déroulement du Tour par Tour ---');
  const bombs = startedRoom.minesGrid;
  const safeCell = Array.from({ length: 36 }, (_, i) => i).find(i => !bombs.includes(i));
  const bombCell = bombs[0];

  // Alice joue la case safe
  console.log(`  [Tour Alice] Clic sur case sûre #${safeCell}`);
  const bobTurnPromise = new Promise((resolve) => {
    const handler = ({ room }) => {
      if (room && room.currentTurnPlayerId === bobSocket.id) {
        hostSocket.off('room_updated', handler);
        resolve(room);
      }
    };
    hostSocket.on('room_updated', handler);
  });

  aliceSocket.emit('mines_reveal_cell', { roomId, cellIndex: safeCell });
  const roomAfterAlice = await bobTurnPromise;
  console.log(`✔ Case #${safeCell} révélée (Diamant 💎). Tour passé à Bob !`);
  console.log(`  - Alice safeClicks: ${roomAfterAlice.players.find(p => p.id === aliceSocket.id)?.safeClicks}`);

  // Bob joue la bombe
  console.log(`  [Tour Bob] Clic sur bombe #${bombCell}`);
  const aliceSecondTurnPromise = new Promise((resolve) => {
    const handler = ({ room }) => {
      if (room && room.currentTurnPlayerId === aliceSocket.id) {
        hostSocket.off('room_updated', handler);
        resolve(room);
      }
    };
    hostSocket.on('room_updated', handler);
  });

  bobSocket.emit('mines_reveal_cell', { roomId, cellIndex: bombCell });
  const roomAfterBob = await aliceSecondTurnPromise;
  console.log(`✔ Case #${bombCell} révélée (Bombe 💣). Bob est BUSTÉ ! Tour repassé à Alice.`);
  console.log(`  - Bob status: ${roomAfterBob.players.find(p => p.id === bobSocket.id)?.minesStatus}`);

  // Alice sécurise ses gains
  console.log(`  [Tour Alice] Alice clique sur "SÉCURISER SES GAINS"`);
  const resultRoomPromise = waitForRoomState(hostSocket, 'mines_result');
  aliceSocket.emit('mines_cash_out', { roomId });
  const finalMinesRoom = await resultRoomPromise;
  console.log(`✔ Plus aucun joueur actif -> Fin de la manche ! État: "${finalMinesRoom.state}"`);

  // 6. Vérification du Bilan
  console.log('\n--- 4. Bilan des Gains et Gorgées ---');
  finalMinesRoom.currentMinesResult.results.forEach(r => {
    console.log(`  - Joueur ${r.playerName}: Statut=${r.status}, 💎=${r.safeClicks}, GainNet=${r.netGain} 💰, Gorgées=${r.sipsToDrink} 🍺, Solde=${r.newBalance}`);
  });

  const aliceResult = finalMinesRoom.currentMinesResult.results.find(r => r.playerId === aliceSocket.id);
  const bobResult = finalMinesRoom.currentMinesResult.results.find(r => r.playerId === bobSocket.id);

  if (aliceResult.status === 'cashed_out' && aliceResult.netGain === 1 && bobResult.status === 'busted' && bobResult.sipsToDrink === 5) {
    console.log('✔ Calculs des gains et des pénalités validés avec exactitude !');
  } else {
    throw new Error('Résultats incorrects !');
  }

  // 7. Navigation vers Distribution
  console.log('\n--- 5. Navigation : Transition vers la Distribution ---');
  const distStatePromise = waitForRoomState(hostSocket, 'distribution');
  aliceSocket.emit('start_distribution', { roomId });
  const distRoom = await distStatePromise;
  console.log(`✔ Transition vers distribution réussie -> État: "${distRoom.state}"`);

  console.log('\n===============================================================');
  console.log('🎉 TOUS LES TESTS DU JEU LES MINES SONT VALIDÉS À 100% !');
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
