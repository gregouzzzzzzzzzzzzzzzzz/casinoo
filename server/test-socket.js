const { io } = require('socket.io-client');

function createConnectedSocket(url) {
  return new Promise((resolve, reject) => {
    const s = io(url, { reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

async function runTest() {
  console.log('--- Démarrage du test de communication temps réel ---');

  // 1. Host socket connects
  const hostSocket = await createConnectedSocket('http://localhost:3001');
  console.log('✔ Socket Hôte connectée');

  // 2. Host creates a room
  let createdRoomId = '';
  const roomCreatedPromise = new Promise((resolve) => {
    hostSocket.once('room_created', ({ room }) => {
      createdRoomId = room.id;
      console.log(`✔ Room créée par l'hôte avec le code : [${room.id}]`);
      console.log(`  - État de la room: ${room.state}`);
      console.log(`  - Nombre de joueurs: ${room.players.length}`);
      resolve(room);
    });
  });
  hostSocket.emit('create_room');
  await roomCreatedPromise;

  // 3. Player 1 (Alice) connects & joins
  const player1Socket = await createConnectedSocket('http://localhost:3001');
  console.log('✔ Socket Joueur 1 (Alice) connectée');

  const p1JoinedPromise = new Promise((resolve) => {
    player1Socket.once('room_joined', (res) => {
      console.log(`✔ Réponse Joueur 1: success=${res.success}, player=${res.player?.name}, balance=${res.player?.balance} jetons`);
      resolve(res);
    });
  });

  const hostUpdate1Promise = new Promise((resolve) => {
    hostSocket.once('room_updated', ({ room }) => {
      console.log(`✔ Hôte notifié en direct : ${room.players.length} joueur(s) dans la room [${room.players.map(p => p.name).join(', ')}]`);
      resolve(room);
    });
  });

  player1Socket.emit('join_room', { roomId: createdRoomId, name: 'Alice' });
  await Promise.all([p1JoinedPromise, hostUpdate1Promise]);

  // 4. Player 2 (Bob) connects & joins
  const player2Socket = await createConnectedSocket('http://localhost:3001');
  console.log('✔ Socket Joueur 2 (Bob) connectée');

  const p2JoinedPromise = new Promise((resolve) => {
    player2Socket.once('room_joined', (res) => {
      console.log(`✔ Réponse Joueur 2: success=${res.success}, player=${res.player?.name}, balance=${res.player?.balance} jetons`);
      resolve(res);
    });
  });

  const hostUpdate2Promise = new Promise((resolve) => {
    hostSocket.once('room_updated', ({ room }) => {
      console.log(`✔ Hôte notifié en direct : ${room.players.length} joueurs dans la room [${room.players.map(p => p.name).join(', ')}]`);
      resolve(room);
    });
  });

  player2Socket.emit('join_room', { roomId: createdRoomId, name: 'Bob' });
  await Promise.all([p2JoinedPromise, hostUpdate2Promise]);

  console.log('\n======================================================');
  console.log('🎉 VALIDATION COMPLÈTE : Tous les événements Socket.io fonctionnent !');
  console.log('======================================================\n');

  hostSocket.close();
  player1Socket.close();
  player2Socket.close();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Erreur lors du test :', err);
  process.exit(1);
});
