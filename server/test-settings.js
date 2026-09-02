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
  console.log('⚙️ TEST COMPLET DES PARAMÈTRES DU LOBBY, LIMITES & MULTIPLICATEUR');
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
  console.log(`  - Paramètres par défaut: Solde=${initialRoom.settings?.startingBalance} 💰, Min=${initialRoom.settings?.minRounds}, Max=${initialRoom.settings?.maxRounds}, MaxJoueurs=${initialRoom.settings?.maxPlayers}, Bombes=${initialRoom.settings?.minesBombCount} 💣, Multiplicateur=x${initialRoom.settings?.sipMultiplier}`);

  if (
    initialRoom.settings?.startingBalance !== 20 ||
    initialRoom.settings?.minRounds !== 3 ||
    initialRoom.settings?.maxRounds !== 10 ||
    initialRoom.settings?.maxPlayers !== 8 ||
    initialRoom.settings?.minesBombCount !== 7 ||
    initialRoom.settings?.sipMultiplier !== 1
  ) {
    throw new Error('Valeurs par défaut incorrectes');
  }

  // 2. Connexion d'Alice (Leader)
  const aliceSocket = await createConnectedSocket('http://localhost:3001');
  const aliceJoinPromise = new Promise((res) => aliceSocket.once('room_joined', res));
  aliceSocket.emit('join_room', { roomId, name: 'Alice' });
  const aliceRes = await aliceJoinPromise;
  console.log(`✔ Alice connectée (Solde initial = ${aliceRes.player.balance} 💰)`);

  // 3. Test de la limite maxPlayers = 2
  console.log('\n--- 1. Test de la Limite Max Joueurs (maxPlayers = 2) ---');
  aliceSocket.emit('update_settings', {
    roomId,
    settings: { maxPlayers: 2 },
  });

  const bobSocket = await createConnectedSocket('http://localhost:3001');
  const bobJoinPromise = new Promise((res) => bobSocket.once('room_joined', res));
  bobSocket.emit('join_room', { roomId, name: 'Bob' });
  const bobRes = await bobJoinPromise;
  console.log(`✔ Bob connecté (2/2 joueurs)`);

  const charlieSocket = await createConnectedSocket('http://localhost:3001');
  const charlieJoinPromise = new Promise((res) => charlieSocket.once('room_joined', res));
  charlieSocket.emit('join_room', { roomId, name: 'Charlie' });
  const charlieRes = await charlieJoinPromise;

  if (!charlieRes.success && charlieRes.error && charlieRes.error.includes('complète')) {
    console.log(`✔ Rejet réussi du 3ème joueur : "${charlieRes.error}"`);
  } else {
    throw new Error('La limite maxPlayers n\'a pas bloqué le 3ème joueur');
  }

  // 4. Test de mise à jour des paramètres en direct (StartingBalance, Bombes, SipMultiplier, MaxRounds)
  console.log('\n--- 2. Modification des Paramètres en Temps Réel ---');
  const settingsUpdatePromise = new Promise((resolve) => {
    const handler = ({ room }) => {
      if (room.settings?.startingBalance === 30 && room.settings?.sipMultiplier === 2) {
        hostSocket.off('room_updated', handler);
        resolve(room);
      }
    };
    hostSocket.on('room_updated', handler);
  });

  aliceSocket.emit('update_settings', {
    roomId,
    settings: {
      startingBalance: 30,
      minesBombCount: 4,
      sipMultiplier: 2,
      maxRounds: 2,
      enabledGames: ['mines'],
    },
  });

  const updatedRoom = await settingsUpdatePromise;
  console.log(`✔ Paramètres mis à jour en direct :`);
  console.log(`  - Nouveau solde lobby des joueurs: ${updatedRoom.players.map(p => `${p.name}: ${p.balance} 💰`).join(', ')}`);
  console.log(`  - Bombes Mines: ${updatedRoom.settings?.minesBombCount} 💣`);
  console.log(`  - Multiplicateur de gorgées: ×${updatedRoom.settings?.sipMultiplier} 🍺`);
  console.log(`  - Max Manches: ${updatedRoom.settings?.maxRounds} 🏁`);

  // 5. Test du mini-jeu Les Mines avec bombes dynamiques (4 bombes) et multiplicateur de gorgées (x2)
  console.log('\n--- 3. Test en Jeu : 4 Bombes & Multiplicateur x2 ---');
  const minesPlayingPromise = waitForRoomState(hostSocket, 'mines_playing');
  aliceSocket.emit('start_game', { roomId });
  const minesRoom = await waitForRoomState(hostSocket, 'playing_mines');
  console.log(`✔ Fast-Track direct aux Mines -> "${minesRoom.state}"`);

  aliceSocket.emit('submit_mines_bet', { roomId, amount: 5 });
  bobSocket.emit('submit_mines_bet', { roomId, amount: 5 });

  const activeMinesRoom = await minesPlayingPromise;
  console.log(`✔ Grille 6x6 initialisée avec ${activeMinesRoom.minesGrid.length} bombes : [${activeMinesRoom.minesGrid.join(', ')}]`);
  if (activeMinesRoom.minesGrid.length !== 4) {
    throw new Error('Le nombre de bombes dans la grille ne correspond pas aux réglages');
  }

  // Alice joue safe, Bob saute sur une bombe
  const bombs = activeMinesRoom.minesGrid;
  const safeCell = Array.from({ length: 36 }, (_, i) => i).find((i) => !bombs.includes(i));
  const bombCell = bombs[0];

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
  await bobTurnPromise;

  const resultMinesPromise = waitForRoomState(hostSocket, 'mines_result');
  bobSocket.emit('mines_reveal_cell', { roomId, cellIndex: bombCell });
  aliceSocket.emit('mines_cash_out', { roomId });
  const resultRoom = await resultMinesPromise;

  const bobMinesRes = resultRoom.currentMinesResult.results.find((r) => r.playerId === bobSocket.id);
  console.log(`✔ Résultat Bob (Busté sur mise de 5 💰): Gorgées = ${bobMinesRes.sipsToDrink} 🍺`);

  if (bobMinesRes.sipsToDrink === 10) {
    console.log(`✔ Multiplicateur x2 appliqué avec succès : 5 mise * 2 = 10 gorgées !`);
  } else {
    throw new Error(`Le multiplicateur x2 n'a pas été appliqué aux gorgées (obtenu: ${bobMinesRes.sipsToDrink})`);
  }

  // 6. Test de la fin de partie forcée quand currentRound >= maxRounds (2)
  console.log('\n--- 4. Test de la Fin de Partie Forcée (Atteinte de maxRounds = 2) ---');
  aliceSocket.emit('start_distribution', { roomId });
  await waitForRoomState(hostSocket, 'distribution');

  aliceSocket.emit('start_drinking_phase', { roomId });
  await waitForRoomState(hostSocket, 'drinking_phase');

  aliceSocket.emit('confirm_drank', { roomId });
  bobSocket.emit('confirm_drank', { roomId });

  const finalTaxStatePromise = waitForRoomState(hostSocket, 'final_tax');
  console.log('  [Leader] Clic sur "Manche suivante" -> Manche 2/2 atteinte...');
  aliceSocket.emit('end_turn', { roomId });

  const grandFinalRoom = await finalTaxStatePromise;
  console.log(`✔ Fin de partie FORCÉE automatique -> État: "${grandFinalRoom.state}" (Le Grand Final s'est déclenché d'office !)`);

  console.log('\n========================================================================');
  console.log('🎉 TOUS LES TESTS DES PARAMÈTRES, LIMITES & DUPLICATEURS SONT VALIDÉS !');
  console.log('========================================================================\n');

  hostSocket.close();
  aliceSocket.close();
  bobSocket.close();
  charlieSocket.close();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Erreur lors du test :', err);
  process.exit(1);
});
