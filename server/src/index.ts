import express from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import { roomManager } from './roomManager';
import {
  JoinRoomPayload,
  JoinRoomResponse,
  SubmitVotePayload,
  SubmitBetPayload,
  SubmitCrashBetPayload,
  CashOutPayload,
  NextCrashRoundPayload,
  SubmitBlackjackBetPayload,
  BlackjackActionPayload,
  SubmitMinesBetPayload,
  MinesRevealCellPayload,
  MinesCashOutPayload,
  SubmitDerbyBetPayload,
  SendSipsPayload,
  SubmitFinalDistributionPayload,
  ConfirmDrankPayload,
  UpdateSettingsPayload,
} from './types';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

// Basic health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint to view active rooms
app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: roomManager.getAllRooms() });
});

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Track voting timeouts by roomId
const votingTimeouts = new Map<string, NodeJS.Timeout>();
// Track active crash flight intervals by roomId
const crashIntervals = new Map<string, NodeJS.Timeout>();
// Track active derby race intervals by roomId
const derbyIntervals = new Map<string, NodeJS.Timeout>();

function startDerbyRaceLoop(roomId: string) {
  if (derbyIntervals.has(roomId)) {
    clearInterval(derbyIntervals.get(roomId)!);
    derbyIntervals.delete(roomId);
  }

  const interval = setInterval(() => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.state !== 'derby_racing') {
      clearInterval(interval);
      derbyIntervals.delete(roomId);
      return;
    }

    const step = roomManager.stepDerbyRace(roomId);
    io.to(roomId).emit('room_updated', { room: roomManager.getRoom(roomId) });

    if (step.finished) {
      clearInterval(interval);
      derbyIntervals.delete(roomId);

      setTimeout(() => {
        const resolution = roomManager.resolveDerby(roomId);
        if (resolution) {
          io.to(roomId).emit('room_updated', { room: resolution.room });
        }
      }, 1000);
    }
  }, 200);

  derbyIntervals.set(roomId, interval);
}

function startVotingTimer(roomId: string) {
  if (votingTimeouts.has(roomId)) {
    clearTimeout(votingTimeouts.get(roomId)!);
    votingTimeouts.delete(roomId);
  }

  const timeout = setTimeout(() => {
    const room = roomManager.getRoom(roomId);
    if (room && room.state === 'voting') {
      const updatedRoom = roomManager.resolveVoteAndTransition(roomId);
      if (updatedRoom) {
        io.to(roomId).emit('room_updated', { room: updatedRoom });
      }
    }
    votingTimeouts.delete(roomId);
  }, 10000);

  votingTimeouts.set(roomId, timeout);
}

function startCrashFlightLoop(roomId: string) {
  if (crashIntervals.has(roomId)) {
    clearInterval(crashIntervals.get(roomId)!);
    crashIntervals.delete(roomId);
  }

  const crashPoint = roomManager.generateCrashPoint();
  const flyingRoom = roomManager.startCrashFlight(roomId, crashPoint);
  if (!flyingRoom) return;

  io.to(roomId).emit('room_updated', { room: flyingRoom });

  let currentMultiplier = 1.00;
  let prevMultiplier = 1.00;
  let tickCount = 0;
  const MAX_TICKS = 60; // 15 seconds max

  io.to(roomId).emit('crash_update', {
    multiplier: 1.00,
    prevMultiplier: 1.00,
    trend: 'same',
    crashRound: flyingRoom.crashRound || 1,
  });

  const interval = setInterval(() => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.state !== 'crash_flying') {
      clearInterval(interval);
      crashIntervals.delete(roomId);
      return;
    }

    tickCount++;

    if (roomManager.checkAllCrashCashedOut(roomId)) {
      clearInterval(interval);
      crashIntervals.delete(roomId);
      room.crashPoint = currentMultiplier;
      const resolution = roomManager.resolveCrash(roomId);
      if (resolution) {
        io.to(roomId).emit('crash_update', {
          multiplier: currentMultiplier,
          prevMultiplier,
          trend: 'same',
          crashRound: room.crashRound || 1,
        });
        io.to(roomId).emit('room_updated', { room: resolution.room });
      }
      return;
    }

    if (tickCount >= MAX_TICKS) {
      clearInterval(interval);
      crashIntervals.delete(roomId);
      room.crashPoint = currentMultiplier;
      const resolution = roomManager.resolveCrash(roomId);
      if (resolution) {
        io.to(roomId).emit('crash_update', {
          multiplier: currentMultiplier,
          prevMultiplier,
          trend: 'down',
          crashRound: room.crashRound || 1,
        });
        io.to(roomId).emit('room_updated', { room: resolution.room });
      }
      return;
    }

    prevMultiplier = currentMultiplier;
    const delta = (Math.random() * 0.8) - 0.3;
    let nextMultiplier = Math.round((currentMultiplier + delta) * 100) / 100;
    nextMultiplier = Math.max(0.10, nextMultiplier);

    if (nextMultiplier >= crashPoint) {
      clearInterval(interval);
      crashIntervals.delete(roomId);
      room.crashPoint = crashPoint;
      const resolution = roomManager.resolveCrash(roomId);
      if (resolution) {
        io.to(roomId).emit('crash_update', {
          multiplier: crashPoint,
          prevMultiplier: currentMultiplier,
          trend: 'down',
          crashRound: room.crashRound || 1,
        });
        io.to(roomId).emit('room_updated', { room: resolution.room });
      }
    } else {
      currentMultiplier = nextMultiplier;
      room.crashMultiplier = currentMultiplier;
      const trend = currentMultiplier >= prevMultiplier ? 'up' : 'down';
      io.to(roomId).emit('crash_update', {
        multiplier: currentMultiplier,
        prevMultiplier,
        trend,
        crashRound: room.crashRound || 1,
      });
    }
  }, 250);

  crashIntervals.set(roomId, interval);
}

function startDealerTurn(roomId: string) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  room.state = 'blackjack_dealer_turn';
  io.to(roomId).emit('room_updated', { room });

  function dealerStep() {
    const currentRoom = roomManager.getRoom(roomId);
    if (!currentRoom || currentRoom.state !== 'blackjack_dealer_turn') return;

    const step = roomManager.dealerDrawCard(roomId);
    if (step.room) {
      io.to(roomId).emit('room_updated', { room: step.room });
    }

    if (step.shouldContinue) {
      setTimeout(dealerStep, 800);
    } else {
      setTimeout(() => {
        const resolution = roomManager.resolveBlackjack(roomId);
        if (resolution) {
          io.to(roomId).emit('room_updated', { room: resolution.room });
        }
      }, 800);
    }
  }

  setTimeout(dealerStep, 800);
}

io.on('connection', (socket: Socket) => {
  socket.on('create_room', () => {
    const room = roomManager.createRoom(socket.id);
    socket.join(room.id);
    socket.emit('room_created', { room });
  });

  socket.on('join_room', (payload: JoinRoomPayload) => {
    const { roomId, name } = payload || {};
    const result = roomManager.addPlayer(roomId, socket.id, name);

    if (!result.success || !result.room || !result.player) {
      const response: JoinRoomResponse = {
        success: false,
        error: result.error || 'Impossible de rejoindre la room.',
      };
      socket.emit('room_joined', response);
      return;
    }

    socket.join(result.room.id);

    const response: JoinRoomResponse = {
      success: true,
      room: result.room,
      player: result.player,
    };
    socket.emit('room_joined', response);

    io.to(result.room.id).emit('room_updated', { room: result.room });
  });

  socket.on('update_settings', (payload: UpdateSettingsPayload) => {
    const { roomId, settings } = payload || {};
    const updatedRoom = roomManager.updateSettings(roomId, settings);
    if (updatedRoom) {
      io.to(roomId).emit('room_updated', { room: updatedRoom });
    }
  });

  socket.on('start_game', ({ roomId }: { roomId: string }) => {
    const result = roomManager.startGame(roomId);

    if (result.success && result.room) {
      io.to(roomId).emit('room_updated', { room: result.room });
      if (!result.fastTrack) {
        startVotingTimer(roomId);
      }
    } else {
      socket.emit('error_message', { message: result.error || 'Impossible de lancer la partie' });
    }
  });

  socket.on('submit_vote', (payload: SubmitVotePayload) => {
    const { roomId, vote } = payload || {};
    const result = roomManager.submitVote(roomId, socket.id, vote);

    if (!result.success || !result.room) {
      socket.emit('error_message', { message: result.error || 'Vote non pris en compte' });
      return;
    }

    io.to(roomId).emit('room_updated', { room: result.room });

    if (result.allVoted) {
      if (votingTimeouts.has(roomId)) {
        clearTimeout(votingTimeouts.get(roomId)!);
        votingTimeouts.delete(roomId);
      }
      const updatedRoom = roomManager.resolveVoteAndTransition(roomId);
      if (updatedRoom) {
        io.to(roomId).emit('room_updated', { room: updatedRoom });
      }
    }
  });

  /* =====================================================================
   * LA ROULETTE
   * ===================================================================== */

  socket.on('submit_bet', (payload: SubmitBetPayload) => {
    const { roomId, amount, color } = payload || {};
    const result = roomManager.submitBet(roomId, socket.id, amount, color);

    if (!result.success || !result.room) {
      socket.emit('bet_error', { message: result.error || 'Mise invalide' });
      return;
    }

    socket.emit('bet_confirmed', { amount, color });
    io.to(roomId).emit('room_updated', { room: result.room });

    if (result.allBet) {
      const spinningRoom = roomManager.startSpinning(roomId);
      if (spinningRoom) {
        io.to(roomId).emit('room_updated', { room: spinningRoom });
      }

      setTimeout(() => {
        const resolution = roomManager.resolveRoulette(roomId);
        if (resolution) {
          io.to(roomId).emit('room_updated', { room: resolution.room });
        }
      }, 7000);
    }
  });

  socket.on('start_roulette_spin', ({ roomId }: { roomId: string }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.state !== 'playing_roulette') return;

    const spinningRoom = roomManager.startSpinning(roomId);
    if (spinningRoom) {
      io.to(roomId).emit('room_updated', { room: spinningRoom });
    }

    setTimeout(() => {
      const resolution = roomManager.resolveRoulette(roomId);
      if (resolution) {
        io.to(roomId).emit('room_updated', { room: resolution.room });
      }
    }, 7000);
  });

  /* =====================================================================
   * LE KRACH BOURSIER
   * ===================================================================== */

  socket.on('submit_crash_bet', (payload: SubmitCrashBetPayload) => {
    const { roomId, amount } = payload || {};
    const result = roomManager.submitCrashBet(roomId, socket.id, amount);

    if (!result.success || !result.room) {
      socket.emit('bet_error', { message: result.error || 'Mise invalide' });
      return;
    }

    socket.emit('crash_bet_confirmed', { amount });
    io.to(roomId).emit('room_updated', { room: result.room });

    if (result.allCrashBet) {
      startCrashFlightLoop(roomId);
    }
  });

  socket.on('cash_out', (payload: CashOutPayload) => {
    const { roomId } = payload || {};
    const room = roomManager.getRoom(roomId);
    if (!room || room.state !== 'crash_flying') return;

    const currentMultiplier = room.crashMultiplier || 1.00;
    const result = roomManager.cashOut(roomId, socket.id, currentMultiplier);

    if (result.success && result.room) {
      socket.emit('cashed_out', { multiplier: currentMultiplier });

      if (roomManager.checkAllCrashCashedOut(roomId)) {
        if (crashIntervals.has(roomId)) {
          clearInterval(crashIntervals.get(roomId)!);
          crashIntervals.delete(roomId);
        }
        room.crashPoint = currentMultiplier;
        const resolution = roomManager.resolveCrash(roomId);
        if (resolution) {
          io.to(roomId).emit('crash_update', {
            multiplier: currentMultiplier,
            prevMultiplier: currentMultiplier,
            trend: 'same',
            crashRound: room.crashRound || 1,
          });
          io.to(roomId).emit('room_updated', { room: resolution.room });
          return;
        }
      }

      io.to(roomId).emit('room_updated', { room: result.room });
    } else {
      socket.emit('error_message', { message: result.error || 'Impossible de vendre ses actions' });
    }
  });

  socket.on('next_crash_round', ({ roomId }: NextCrashRoundPayload) => {
    const updatedRoom = roomManager.nextCrashRound(roomId);
    if (updatedRoom) {
      io.to(roomId).emit('room_updated', { room: updatedRoom });
    }
  });

  /* =====================================================================
   * LE BLACKJACK (ASYNCHRONE)
   * ===================================================================== */

  socket.on('submit_blackjack_bet', (payload: SubmitBlackjackBetPayload) => {
    const { roomId, amount } = payload || {};
    const result = roomManager.submitBlackjackBet(roomId, socket.id, amount);
    if (!result.success || !result.room) {
      socket.emit('bet_error', { message: result.error || 'Mise invalide' });
      return;
    }

    socket.emit('blackjack_bet_confirmed', { amount });
    io.to(roomId).emit('room_updated', { room: result.room });

    if (result.allBlackjackBet) {
      const dealResult = roomManager.startBlackjackDealing(roomId);
      if (dealResult.room) {
        io.to(roomId).emit('room_updated', { room: dealResult.room });
        if (dealResult.allFinished) {
          startDealerTurn(roomId);
        }
      }
    }
  });

  socket.on('blackjack_hit', (payload: BlackjackActionPayload) => {
    const { roomId } = payload || {};
    const result = roomManager.blackjackHit(roomId, socket.id);

    if (!result.success || !result.room) {
      socket.emit('error_message', { message: result.error || 'Impossible de tirer une carte' });
      return;
    }

    io.to(roomId).emit('room_updated', { room: result.room });

    if (result.allFinished) {
      startDealerTurn(roomId);
    }
  });

  socket.on('blackjack_stand', (payload: BlackjackActionPayload) => {
    const { roomId } = payload || {};
    const result = roomManager.blackjackStand(roomId, socket.id);

    if (!result.success || !result.room) {
      socket.emit('error_message', { message: result.error || 'Action impossible' });
      return;
    }

    io.to(roomId).emit('room_updated', { room: result.room });

    if (result.allFinished) {
      startDealerTurn(roomId);
    }
  });

  /* =====================================================================
   * LES MINES (GRILLE COMMUNE 6x6)
   * ===================================================================== */

  socket.on('submit_mines_bet', (payload: SubmitMinesBetPayload) => {
    const { roomId, amount } = payload || {};
    const result = roomManager.submitMinesBet(roomId, socket.id, amount);
    if (!result.success || !result.room) {
      socket.emit('bet_error', { message: result.error || 'Mise invalide' });
      return;
    }

    socket.emit('mines_bet_confirmed', { amount });
    io.to(roomId).emit('room_updated', { room: result.room });

    if (result.allMinesBet) {
      const startedRoom = roomManager.startMinesGame(roomId);
      if (startedRoom) {
        io.to(roomId).emit('room_updated', { room: startedRoom });
      }
    }
  });

  socket.on('mines_reveal_cell', (payload: MinesRevealCellPayload) => {
    const { roomId, cellIndex } = payload || {};
    const result = roomManager.minesRevealCell(roomId, socket.id, cellIndex);

    if (!result.success || !result.room) {
      socket.emit('error_message', { message: result.error || 'Action impossible' });
      return;
    }

    io.to(roomId).emit('room_updated', { room: result.room });
  });

  socket.on('mines_cash_out', (payload: MinesCashOutPayload) => {
    const { roomId } = payload || {};
    const result = roomManager.minesCashOut(roomId, socket.id);

    if (!result.success || !result.room) {
      socket.emit('error_message', { message: result.error || 'Impossible de sécuriser vos gains' });
      return;
    }

    io.to(roomId).emit('room_updated', { room: result.room });
  });

  /* =====================================================================
   * LE DERBY (COURSE DE CHEVAUX)
   * ===================================================================== */

  socket.on('submit_derby_bet', (payload: SubmitDerbyBetPayload) => {
    const { roomId, horseId, amount } = payload || {};
    const result = roomManager.submitDerbyBet(roomId, socket.id, horseId, amount);
    if (!result.success || !result.room) {
      socket.emit('bet_error', { message: result.error || 'Pari invalide' });
      return;
    }

    socket.emit('derby_bet_confirmed', { horseId, amount });
    io.to(roomId).emit('room_updated', { room: result.room });

    if (result.allDerbyBet) {
      const started = roomManager.startDerbyRace(roomId);
      if (started) {
        io.to(roomId).emit('room_updated', { room: started });
        startDerbyRaceLoop(roomId);
      }
    }
  });

  socket.on('start_derby_race', ({ roomId }: { roomId: string }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.state !== 'playing_derby') return;
    const started = roomManager.startDerbyRace(roomId);
    if (started) {
      io.to(roomId).emit('room_updated', { room: started });
      startDerbyRaceLoop(roomId);
    }
  });

  /* =====================================================================
   * LE GRAND FINAL (TAXE, DISTRIBUTION FINALE, BILAN ULTIME)
   * ===================================================================== */

  socket.on('start_final_tax', ({ roomId }: { roomId: string }) => {
    const updatedRoom = roomManager.startFinalTax(roomId);
    if (updatedRoom) {
      io.to(roomId).emit('room_updated', { room: updatedRoom });
    }
  });

  socket.on('start_final_distribution', ({ roomId }: { roomId: string }) => {
    const updatedRoom = roomManager.startFinalDistribution(roomId);
    if (updatedRoom) {
      io.to(roomId).emit('room_updated', { room: updatedRoom });
    }
  });

  socket.on('submit_final_distribution', (payload: SubmitFinalDistributionPayload) => {
    const { roomId, allocations } = payload || {};
    const result = roomManager.submitFinalDistribution(roomId, socket.id, allocations);
    if (result.success && result.room) {
      socket.emit('final_distribution_confirmed');
      io.to(roomId).emit('room_updated', { room: result.room });
    } else {
      socket.emit('error_message', { message: result.error || 'Erreur lors de la distribution' });
    }
  });

  socket.on('reset_to_lobby', ({ roomId }: { roomId: string }) => {
    const updatedRoom = roomManager.resetToLobby(roomId);
    if (updatedRoom) {
      io.to(roomId).emit('room_updated', { room: updatedRoom });
    }
  });

  /* =====================================================================
   * DISTRIBUTION & DRINKING PHASE
   * ===================================================================== */

  socket.on('start_distribution', ({ roomId }: { roomId: string }) => {
    const updatedRoom = roomManager.startDistribution(roomId);
    if (updatedRoom) {
      io.to(roomId).emit('room_updated', { room: updatedRoom });
    }
  });

  socket.on('send_sips', (payload: SendSipsPayload) => {
    const { roomId, toPlayerId, amount } = payload || {};
    const result = roomManager.sendSips(roomId, socket.id, toPlayerId, amount);
    if (result.success && result.room) {
      socket.emit('sips_confirmed', { distribution: result.distribution });
      io.to(roomId).emit('room_updated', { room: result.room });
    } else {
      socket.emit('error_message', { message: result.error || 'Impossible d\'envoyer les gorgées' });
    }
  });

  socket.on('start_drinking_phase', ({ roomId }: { roomId: string }) => {
    const updatedRoom = roomManager.startDrinkingPhase(roomId);
    if (updatedRoom) {
      io.to(roomId).emit('room_updated', { room: updatedRoom });
    }
  });

  socket.on('confirm_drank', (payload: ConfirmDrankPayload) => {
    const { roomId } = payload || {};
    const result = roomManager.confirmDrank(roomId, socket.id);
    if (result.success && result.room) {
      io.to(roomId).emit('room_updated', { room: result.room });
    } else {
      socket.emit('error_message', { message: result.error || 'Erreur lors de la validation' });
    }
  });

  socket.on('end_turn', ({ roomId }: { roomId: string }) => {
    const updatedRoom = roomManager.endTurn(roomId);
    if (updatedRoom) {
      io.to(roomId).emit('room_updated', { room: updatedRoom });
      if (updatedRoom.state === 'voting') {
        startVotingTimer(roomId);
      }
    }
  });

  socket.on('get_room', ({ roomId }: { roomId: string }) => {
    const room = roomManager.getRoom(roomId);
    if (room) {
      socket.emit('room_updated', { room });
    }
  });

  socket.on('disconnect', () => {
    // Si c'est l'hôte qui quitte, on détruit la room et on prévient tout le monde
    const destroyedRoomId = roomManager.removeHost(socket.id);
    if (destroyedRoomId) {
      io.to(destroyedRoomId).emit('room_destroyed');
      return;
    }

    const removedInfo = roomManager.removePlayer(socket.id);

    if (removedInfo) {
      const roomId = removedInfo.room.id;

      if (removedInfo.room.state === 'voting' && removedInfo.allVoted) {
        if (votingTimeouts.has(roomId)) {
          clearTimeout(votingTimeouts.get(roomId)!);
          votingTimeouts.delete(roomId);
        }
        const updated = roomManager.resolveVoteAndTransition(roomId);
        if (updated) {
          io.to(roomId).emit('room_updated', { room: updated });
          return;
        }
      }

      if (removedInfo.room.state === 'playing_roulette' && removedInfo.allBet) {
        const spinningRoom = roomManager.startSpinning(roomId);
        if (spinningRoom) {
          io.to(roomId).emit('room_updated', { room: spinningRoom });
        }
        setTimeout(() => {
          const resolution = roomManager.resolveRoulette(roomId);
          if (resolution) {
            io.to(roomId).emit('room_updated', { room: resolution.room });
          }
        }, 7000);
        return;
      }

      if (removedInfo.room.state === 'playing_crash' && removedInfo.allCrashBet) {
        startCrashFlightLoop(roomId);
        return;
      }

      if (removedInfo.room.state === 'playing_blackjack' && removedInfo.allBlackjackBet) {
        const dealResult = roomManager.startBlackjackDealing(roomId);
        if (dealResult.room) {
          io.to(roomId).emit('room_updated', { room: dealResult.room });
          if (dealResult.allFinished) {
            startDealerTurn(roomId);
          }
        }
        return;
      }

      if (removedInfo.room.state === 'blackjack_playing' && removedInfo.allBlackjackFinished) {
        startDealerTurn(roomId);
        return;
      }

      if (removedInfo.room.state === 'playing_mines' && removedInfo.allMinesBet) {
        const started = roomManager.startMinesGame(roomId);
        if (started) {
          io.to(roomId).emit('room_updated', { room: started });
        }
        return;
      }

      io.to(roomId).emit('room_updated', { room: removedInfo.room });
    }
  });
});

server.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🎲 Casino à Boire - Backend Server Ready`);
  console.log(`🚀 Listening on http://localhost:${PORT}`);
  console.log(`=========================================`);
});
