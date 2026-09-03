import {
  Room,
  Player,
  GameChoice,
  RoomSettings,
  RouletteColor,
  RouletteBet,
  RouletteRoundResult,
  PlayerRoundResult,
  CrashBet,
  CrashRoundResult,
  PlayerCrashResult,
  Card,
  BlackjackRoundResult,
  PlayerBlackjackResult,
  PlayerMinesResult,
  MinesRoundResult,
  DerbyHorse,
  PlayerDerbyResult,
  DerbyRoundResult,
  SipDistribution,
} from './types';

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

const SUITS = ['♠', '♥', '♦', '♣'];
const CARD_VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of CARD_VALUES) {
      deck.push({ suit, value });
    }
  }
  // Shuffle Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function calculateHandScore(hand?: Card[]): number {
  if (!hand || hand.length === 0) return 0;
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.value === 'A') {
      aces += 1;
      total += 11;
    } else if (['K', 'Q', 'J', '10'].includes(card.value)) {
      total += 10;
    } else {
      total += parseInt(card.value, 10) || 0;
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

/**
 * Generates unique bomb positions in a 6x6 grid (indices 0 to 35).
 */
export function generateMinesBombs(count = 7, totalCells = 36): number[] {
  const safeCount = Math.max(1, Math.min(count, totalCells - 1));
  const indices: number[] = [];
  while (indices.length < safeCount) {
    const r = Math.floor(Math.random() * totalCells);
    if (!indices.includes(r)) {
      indices.push(r);
    }
  }
  return indices.sort((a, b) => a - b);
}

/**
 * Randomly picks exactly 2 games from the enabled games list for the voting round.
 */
export function pickVoteOptions(enabledGames: GameChoice[]): GameChoice[] {
  const games = enabledGames.filter((g) => g !== 'end_game');
  if (games.length <= 2) return [...games];
  const shuffled = [...games].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

export const DEFAULT_DERBY_HORSES: DerbyHorse[] = [
  { id: 1, name: 'Éclair Rouge', color: '#ef5350', emoji: '🔴', progress: 0, momentum: 'normal', momentumTimerTicks: 0, isTocard: false },
  { id: 2, name: 'Tornade Bleue', color: '#3b82f6', emoji: '🔵', progress: 0, momentum: 'normal', momentumTimerTicks: 0, isTocard: false },
  { id: 3, name: 'Galop Vert', color: '#5cc963', emoji: '🟢', progress: 0, momentum: 'normal', momentumTimerTicks: 0, isTocard: false },
  { id: 4, name: 'Pégase Jaune', color: '#ffb629', emoji: '🟡', progress: 0, momentum: 'normal', momentumTimerTicks: 0, isTocard: true },
];

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private socketToRoomMap: Map<string, string> = new Map();
  private hostSocketToRoomMap: Map<string, string> = new Map();

  /**
   * Generates a random 4-letter uppercase code (e.g., "ABCD").
   */
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Creates a new room with a unique 4-character ID.
   */
  public createRoom(hostSocketId: string): Room {
    let roomId = this.generateRoomCode();
    while (this.rooms.has(roomId)) {
      roomId = this.generateRoomCode();
    }
    this.hostSocketToRoomMap.set(hostSocketId, roomId);

    const newRoom: Room = {
      id: roomId,
      state: 'lobby',
      players: [],
      currentRound: 1,
      settings: {
        startingBalance: 20,
        minRounds: 3,
        maxRounds: 10,
        maxPlayers: 8,
        minesBombCount: 7,
        sipMultiplier: 1,
        enabledGames: ['mines', 'blackjack', 'crash', 'roulette', 'derby'],
      },
      votes: {},
      bets: {},
      crashBets: {},
      blackjackBets: {},
      minesBets: {},
      derbyBets: {},
      revealedCells: [],
      distributions: [],
    };

    this.rooms.set(roomId, newRoom);
    return newRoom;
  }

  /**
   * Retrieves a room by its ID.
   */
  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  /**
   * Updates room settings (startingBalance, minRounds, maxRounds, maxPlayers, minesBombCount, sipMultiplier, enabledGames).
   */
  public updateSettings(roomId: string, newSettings: Partial<RoomSettings>): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    const prevStartingBalance = room.settings?.startingBalance ?? 20;
    const newStartingBalance = newSettings.startingBalance ?? prevStartingBalance;

    room.settings = {
      startingBalance: newStartingBalance,
      minRounds: newSettings.minRounds ?? room.settings?.minRounds ?? 3,
      maxRounds: newSettings.maxRounds ?? room.settings?.maxRounds ?? 10,
      maxPlayers: newSettings.maxPlayers ?? room.settings?.maxPlayers ?? 8,
      minesBombCount: newSettings.minesBombCount ?? room.settings?.minesBombCount ?? 7,
      sipMultiplier: newSettings.sipMultiplier ?? room.settings?.sipMultiplier ?? 1,
      enabledGames: newSettings.enabledGames || room.settings?.enabledGames || ['mines', 'blackjack', 'crash', 'roulette'],
    };

    // Update players' balance in lobby if startingBalance changed
    if (room.state === 'lobby' && newStartingBalance !== prevStartingBalance) {
      room.players.forEach((p) => {
        p.balance = newStartingBalance;
      });
    }

    return room;
  }

  /**
   * Adds a player to a room.
   */
  public addPlayer(
    roomId: string,
    socketId: string,
    name: string
  ): { success: boolean; room?: Room; player?: Player; error?: string } {
    const normalizedRoomId = roomId.toUpperCase();
    const room = this.rooms.get(normalizedRoomId);

    if (!room) {
      return { success: false, error: "La salle demandée n'existe pas." };
    }

    if (room.state !== 'lobby') {
      return {
        success: false,
        error: 'La partie est déjà en cours dans cette salle.',
      };
    }

    const maxPlayers = room.settings?.maxPlayers ?? 8;
    if (room.players.length >= maxPlayers) {
      return {
        success: false,
        error: `La salle est complète (maximum ${maxPlayers} joueurs).`,
      };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { success: false, error: 'Le pseudo ne peut pas être vide.' };
    }

    const existingPlayer = room.players.find((p) => p.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingPlayer) {
      return { success: false, error: 'Ce pseudo est déjà pris dans cette salle.' };
    }

    const initialBalance = room.settings?.startingBalance ?? 20;

    const newPlayer: Player = {
      id: socketId,
      name: trimmedName,
      balance: initialBalance,
      inventory: [],
      status: 'active',
      currentBet: null,
      currentCrashBet: null,
      cashOutMultiplier: null,
      hand: [],
      currentBlackjackBet: null,
      safeClicks: 0,
      currentMinesBet: null,
      sipsToDrink: 0,
      hasDrank: false,
    };

    room.players.push(newPlayer);
    this.socketToRoomMap.set(socketId, normalizedRoomId);

    if (room.players.length === 1) {
      room.leaderId = newPlayer.id;
    }

    return { success: true, room, player: newPlayer };
  }

  /**
   * Removes a player from the room by socketId.
   */
  public getHostRoomId(socketId: string): string | null {
    return this.hostSocketToRoomMap.get(socketId) ?? null;
  }

  public clearHostMapping(socketId: string): void {
    this.hostSocketToRoomMap.delete(socketId);
  }

  /**
   * Re-attaches a reconnected host socket to its room (page reload, bfcache
   * restore, network blip) so the room survives brief host disconnections.
   */
  public reclaimHost(roomId: string, newSocketId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;
    this.hostSocketToRoomMap.set(newSocketId, room.id);
    return room;
  }

  public destroyRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) return false;
    this.rooms.delete(room.id);
    for (const [sockId, rId] of this.hostSocketToRoomMap.entries()) {
      if (rId === room.id) this.hostSocketToRoomMap.delete(sockId);
    }
    room.players.forEach((p) => this.socketToRoomMap.delete(p.id));
    return true;
  }

  public removePlayer(socketId: string): {
    room: Room;
    player: Player;
    allVoted?: boolean;
    allBet?: boolean;
    allCrashBet?: boolean;
    allBlackjackBet?: boolean;
    allBlackjackFinished?: boolean;
    allMinesBet?: boolean;
    allDerbyBet?: boolean;
    minesTurnAdvanced?: boolean;
    allFinalDistributed?: boolean;
  } | null {
    const roomId = this.socketToRoomMap.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const playerIndex = room.players.findIndex((p) => p.id === socketId);
    if (playerIndex === -1) return null;

    const [removedPlayer] = room.players.splice(playerIndex, 1);
    this.socketToRoomMap.delete(socketId);

    if (room.votes && room.votes[socketId]) delete room.votes[socketId];
    if (room.bets && room.bets[socketId]) delete room.bets[socketId];
    if (room.crashBets && room.crashBets[socketId]) delete room.crashBets[socketId];
    if (room.blackjackBets && room.blackjackBets[socketId]) delete room.blackjackBets[socketId];
    if (room.minesBets && room.minesBets[socketId]) delete room.minesBets[socketId];
    if (room.derbyBets && room.derbyBets[socketId]) delete room.derbyBets[socketId];

    if (room.leaderId === socketId) {
      if (room.players.length > 0) {
        room.leaderId = room.players[0].id;
      } else {
        room.leaderId = undefined;
      }
    }

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return { room, player: removedPlayer };
    }

    const allVoted = room.state === 'voting' ? this.checkAllVoted(room) : false;
    const allBet = room.state === 'playing_roulette' ? this.checkAllBet(room) : false;
    const allCrashBet = room.state === 'playing_crash' ? this.checkAllCrashBet(room) : false;
    const allBlackjackBet = room.state === 'playing_blackjack' ? this.checkAllBlackjackBet(room) : false;
    const allBlackjackFinished = room.state === 'blackjack_playing' ? this.checkAllBlackjackFinished(room) : false;
    const allMinesBet = room.state === 'playing_mines' ? this.checkAllMinesBet(room) : false;

    let allDerbyBet = false;
    if (room.state === 'playing_derby') {
      const activeBettors = room.players.filter((p) => p.balance > 0);
      allDerbyBet = activeBettors.length > 0 && activeBettors.every((p) => Boolean(p.derbyBet && p.derbyBet.amount > 0));
    }

    let minesTurnAdvanced = false;
    if (room.state === 'mines_playing' && room.currentTurnPlayerId === socketId) {
      this.nextMinesTurn(roomId);
      minesTurnAdvanced = true;
    }

    let allFinalDistributed = false;
    if (room.state === 'final_distribution') {
      allFinalDistributed = room.players.every((p) => p.hasSubmittedFinalDistribution);
      if (allFinalDistributed) {
        this.startFinalDrinking(roomId);
      }
    }

    return {
      room,
      player: removedPlayer,
      allVoted,
      allBet,
      allCrashBet,
      allBlackjackBet,
      allBlackjackFinished,
      allMinesBet,
      allDerbyBet,
      minesTurnAdvanced,
      allFinalDistributed,
    };
  }

  /**
   * Helper to transition directly to a chosen game.
   */
  public transitionToGameChoice(roomId: string, choice: GameChoice): Room | undefined {
    switch (choice) {
      case 'roulette':
        return this.transitionToRoulette(roomId);
      case 'crash':
        return this.transitionToCrash(roomId);
      case 'blackjack':
        return this.transitionToBlackjack(roomId);
      case 'mines':
        return this.transitionToMines(roomId);
      case 'derby':
        return this.transitionToDerby(roomId);
      case 'end_game':
        return this.startFinalTax(roomId);
      default:
        // Choix non reconnu : ne rien faire plutôt que de lancer les Mines par défaut.
        return undefined;
    }
  }

  /**
   * Starts the game:
   * - If 1 enabled game: Fast-tracks directly to that game's betting phase.
   * - If multiple games: Transitions to 'voting'.
   */
  public startGame(roomId: string): { success: boolean; room?: Room; fastTrack?: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'Room non trouvée' };
    if (room.state !== 'lobby') return { success: false, error: 'La partie est déjà lancée' };
    if (room.players.length === 0) return { success: false, error: 'Impossible de lancer une partie sans joueur' };

    const enabled = room.settings?.enabledGames || ['mines', 'blackjack', 'crash', 'roulette'];
    if (enabled.length === 1) {
      const updated = this.transitionToGameChoice(roomId, enabled[0]);
      return { success: true, room: updated, fastTrack: true };
    }

    room.state = 'voting';
    room.votes = {};
    room.currentVoteOptions = pickVoteOptions(enabled);
    return { success: true, room, fastTrack: false };
  }

  /**
   * Submits a player's vote during the voting phase.
   */
  public submitVote(
    roomId: string,
    socketId: string,
    vote: GameChoice
  ): { success: boolean; room?: Room; allVoted: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, allVoted: false, error: 'Room non trouvée' };
    if (room.state !== 'voting') return { success: false, allVoted: false, error: "Pas en phase de vote" };

    if (!room.votes) room.votes = {};
    room.votes[socketId] = vote;

    const allVoted = this.checkAllVoted(room);
    return { success: true, room, allVoted };
  }

  /**
   * Checks if all active players in the room have voted.
   */
  public checkAllVoted(room: Room): boolean {
    if (room.players.length === 0) return false;
    if (!room.votes) return false;
    return room.players.every((player) => room.votes && room.votes[player.id] !== undefined);
  }

  /**
   * Determines winning game choice and transitions room accordingly.
   */
  public resolveVoteAndTransition(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    const votes = room.votes || {};
    // Only count votes for the options that were actually proposed this round.
    // Falling back to all enabled games if currentVoteOptions wasn't set.
    const validOptions: GameChoice[] = (room.currentVoteOptions as GameChoice[])?.length
      ? (room.currentVoteOptions as GameChoice[])
      : (room.settings?.enabledGames ?? ['roulette', 'crash', 'blackjack', 'mines', 'derby']) as GameChoice[];

    // end_game is always a valid vote option even though it is not in currentVoteOptions
    // (it is displayed as an extra button on the client side).
    const allValidOptions: GameChoice[] = validOptions.includes('end_game')
      ? validOptions
      : [...validOptions, 'end_game'];

    // Build a vote tally initialised to 0 for each valid option only.
    const voteCounts: Record<string, number> = {};
    allValidOptions.forEach((opt) => { voteCounts[opt] = 0; });

    Object.values(votes).forEach((v) => {
      if (voteCounts[v] !== undefined) {
        voteCounts[v]++;
      }
    });

    // Find the maximum vote count.
    let maxVotes = 0;
    for (const count of Object.values(voteCounts)) {
      if (count > maxVotes) maxVotes = count;
    }

    // Collect all options tied at maxVotes, then pick one at random.
    // If nobody voted (all 0), exclude end_game from random pick to avoid
    // accidentally ending the game when everyone abstains.
    let winners = Object.entries(voteCounts)
      .filter(([, count]) => count === maxVotes)
      .map(([choice]) => choice as GameChoice);

    if (maxVotes === 0) {
      // Nobody voted — pick randomly among game options only (not end_game).
      winners = winners.filter((w) => w !== 'end_game');
      if (winners.length === 0) winners = validOptions.filter((v) => v !== 'end_game');
    }

    const winningChoice = winners[Math.floor(Math.random() * winners.length)];

    return this.transitionToGameChoice(roomId, winningChoice);
  }

  /* =====================================================================
   * LA ROULETTE
   * ===================================================================== */

  public transitionToRoulette(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.state = 'playing_roulette';
    room.bets = {};
    room.currentResult = undefined;
    room.players.forEach((p) => {
      p.currentBet = null;
    });

    return room;
  }

  public submitBet(
    roomId: string,
    socketId: string,
    amount: number,
    color: RouletteColor
  ): { success: boolean; room?: Room; allBet: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, allBet: false, error: 'Room non trouvée' };
    if (room.state !== 'playing_roulette') {
      return { success: false, allBet: false, error: "La prise des paris n'est pas en cours" };
    }

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return { success: false, allBet: false, error: 'Joueur non trouvé' };

    const maxAllowed = Math.min(player.balance, Math.max(5, Math.floor(player.balance * 0.30)));
    if (amount <= 0 || amount > maxAllowed) {
      return {
        success: false,
        allBet: false,
        error: `Mise invalide. Vous pouvez miser entre 1 et ${maxAllowed} jetons.`,
      };
    }

    if (!['red', 'black', 'green'].includes(color)) {
      return { success: false, allBet: false, error: 'Couleur invalide' };
    }

    if (!room.bets) room.bets = {};
    const safeAmount = Math.floor(amount);
    room.bets[socketId] = {
      playerId: socketId,
      amount: safeAmount,
      color,
    };

    player.currentBet = { amount: safeAmount, color };

    const allBet = this.checkAllBet(room);
    return { success: true, room, allBet };
  }

  public checkAllBet(room: Room): boolean {
    if (room.players.length === 0) return false;
    if (!room.bets) return false;

    const activeBettors = room.players.filter((p) => p.balance > 0);
    if (activeBettors.length === 0) return true;

    return activeBettors.every((player) => room.bets && room.bets[player.id] !== undefined);
  }

  public startSpinning(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    const winningNumber = Math.floor(Math.random() * 37);
    let winningColor: RouletteColor;
    if (winningNumber === 0) {
      winningColor = 'green';
    } else if (RED_NUMBERS.includes(winningNumber)) {
      winningColor = 'red';
    } else {
      winningColor = 'black';
    }

    room.currentResult = {
      winningColor,
      winningNumber,
      results: [],
    };
    room.state = 'roulette_spinning';
    return room;
  }

  public resolveRoulette(roomId: string): { room: Room; result: RouletteRoundResult } | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    const winningNumber = room.currentResult?.winningNumber ?? Math.floor(Math.random() * 37);
    let winningColor: RouletteColor;
    if (winningNumber === 0) {
      winningColor = 'green';
    } else if (RED_NUMBERS.includes(winningNumber)) {
      winningColor = 'red';
    } else {
      winningColor = 'black';
    }

    const sipMultiplier = room.settings?.sipMultiplier ?? 1;
    const results: PlayerRoundResult[] = [];

    room.players.forEach((player) => {
      const bet = player.currentBet ?? (room.bets ? room.bets[player.id] : null);

      if (!bet) {
        results.push({
          playerId: player.id,
          playerName: player.name,
          betAmount: 0,
          chosenColor: 'red',
          won: false,
          netGain: 0,
          newBalance: player.balance,
          isBankrupt: player.balance <= 0,
        });
        return;
      }

      const won = bet.color === winningColor;
      let netGain = 0;

      if (won) {
        const multiplier = winningColor === 'green' ? 36 : 2;
        netGain = bet.amount * (multiplier - 1);
        player.balance += netGain;
      } else {
        netGain = -bet.amount;
        player.balance -= bet.amount;
        player.sipsToDrink += Math.floor(bet.amount) * sipMultiplier;
      }

      player.balance = Math.max(0, player.balance);
      player.status = player.balance <= 0 ? 'bankrupt' : 'active';

      results.push({
        playerId: player.id,
        playerName: player.name,
        betAmount: bet.amount,
        chosenColor: bet.color,
        won,
        netGain,
        newBalance: player.balance,
        isBankrupt: player.status === 'bankrupt',
      });
    });

    const roundResult: RouletteRoundResult = {
      winningColor,
      winningNumber,
      results,
    };

    room.currentResult = roundResult;
    room.state = 'roulette_result';

    return { room, result: roundResult };
  }

  /* =====================================================================
   * LE KRACH BOURSIER
   * ===================================================================== */

  public transitionToCrash(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.state = 'playing_crash';
    room.crashRound = 1;
    room.crashMultiplier = 1.00;
    room.crashPoint = undefined;
    room.crashBets = {};
    room.currentCrashResult = undefined;
    room.players.forEach((p) => {
      p.currentCrashBet = null;
      p.cashOutMultiplier = null;
    });

    return room;
  }

  public submitCrashBet(
    roomId: string,
    socketId: string,
    amount: number
  ): { success: boolean; room?: Room; allCrashBet: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, allCrashBet: false, error: 'Room non trouvée' };
    if (room.state !== 'playing_crash') {
      return { success: false, allCrashBet: false, error: "La prise des mises du Crash n'est pas en cours" };
    }

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return { success: false, allCrashBet: false, error: 'Joueur non trouvé' };

    const maxAllowed = Math.min(player.balance, Math.max(5, Math.floor(player.balance * 0.30)));
    if (amount <= 0 || amount > maxAllowed) {
      return {
        success: false,
        allCrashBet: false,
        error: `Mise invalide. Vous pouvez miser entre 1 et ${maxAllowed} jetons.`,
      };
    }

    if (!room.crashBets) room.crashBets = {};
    const safeAmount = Math.floor(amount);
    room.crashBets[socketId] = {
      playerId: socketId,
      amount: safeAmount,
    };

    player.currentCrashBet = safeAmount;
    player.cashOutMultiplier = null;

    const allCrashBet = this.checkAllCrashBet(room);
    return { success: true, room, allCrashBet };
  }

  public checkAllCrashBet(room: Room): boolean {
    if (room.players.length === 0) return false;
    if (!room.crashBets) return false;

    const activeBettors = room.players.filter((p) => p.balance > 0);
    if (activeBettors.length === 0) return true;

    return activeBettors.every((player) => room.crashBets && room.crashBets[player.id] !== undefined);
  }

  public generateCrashPoint(): number {
    const r = Math.random();
    if (r < 0.08) {
      return 1.00;
    }
    const rawPoint = (0.96 / (1 - r));
    const roundedPoint = Math.floor(rawPoint * 100) / 100;
    return Math.min(Math.max(1.01, roundedPoint), 30.00);
  }

  public startCrashFlight(roomId: string, crashPoint: number): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.state = 'crash_flying';
    room.crashPoint = crashPoint;
    room.crashMultiplier = 1.00;
    room.players.forEach((p) => {
      p.cashOutMultiplier = null;
    });

    return room;
  }

  public cashOut(
    roomId: string,
    socketId: string,
    multiplier: number
  ): { success: boolean; room?: Room; player?: Player; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'Room non trouvée' };
    if (room.state !== 'crash_flying') return { success: false, error: "Le marché n'est pas ouvert" };

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return { success: false, error: 'Joueur non trouvé' };
    if (!player.currentCrashBet) return { success: false, error: "Vous n'avez pas investi sur cette session" };
    if (player.cashOutMultiplier) return { success: false, error: 'Vous avez déjà vendu vos actions !' };

    player.cashOutMultiplier = Math.floor(multiplier * 100) / 100;
    return { success: true, room, player };
  }

  public checkAllCrashCashedOut(roomId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room || !room.crashBets) return false;
    const bettorIds = Object.keys(room.crashBets);
    if (bettorIds.length === 0) return false;

    return bettorIds.every((id) => {
      const player = room.players.find((p) => p.id === id);
      return player && player.cashOutMultiplier !== null && player.cashOutMultiplier !== undefined;
    });
  }

  public resolveCrash(roomId: string): { room: Room; result: CrashRoundResult } | undefined {
    const room = this.getRoom(roomId);
    if (!room || room.crashPoint === undefined) return undefined;

    const crashPoint = room.crashPoint;
    const sipMultiplier = room.settings?.sipMultiplier ?? 1;
    const results: PlayerCrashResult[] = [];

    room.players.forEach((player) => {
      const bet = room.crashBets ? room.crashBets[player.id] : undefined;

      if (!bet) {
        results.push({
          playerId: player.id,
          playerName: player.name,
          betAmount: 0,
          cashedOut: false,
          won: false,
          netGain: 0,
          sipsToDrink: 0,
          newBalance: player.balance,
          isBankrupt: player.balance <= 0,
        });
        return;
      }

      const betAmount = bet.amount;
      const cashedOut = Boolean(
        player.cashOutMultiplier && player.cashOutMultiplier <= crashPoint
      );

      let netGain = 0;
      let sipsAdded = 0;

      if (cashedOut && player.cashOutMultiplier) {
        const totalReturn = Math.round(betAmount * player.cashOutMultiplier);
        netGain = totalReturn - betAmount;
        player.balance += netGain;
      } else {
        netGain = -betAmount;
        sipsAdded = Math.floor(betAmount) * sipMultiplier;
        player.balance -= betAmount;
        player.sipsToDrink += sipsAdded;
      }

      player.balance = Math.max(0, player.balance);
      player.status = player.balance <= 0 ? 'bankrupt' : 'active';

      results.push({
        playerId: player.id,
        playerName: player.name,
        betAmount,
        cashedOut,
        cashOutMultiplier: player.cashOutMultiplier ?? undefined,
        won: cashedOut,
        netGain,
        sipsToDrink: sipsAdded,
        newBalance: player.balance,
        isBankrupt: player.status === 'bankrupt',
      });
    });

    const roundResult: CrashRoundResult = {
      crashPoint,
      results,
    };

    room.currentCrashResult = roundResult;
    room.state = 'crash_result';

    return { room, result: roundResult };
  }

  public nextCrashRound(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    const currentRound = room.crashRound || 1;
    if (currentRound < 3) {
      room.crashRound = currentRound + 1;
      room.state = 'playing_crash';
      room.crashMultiplier = 1.00;
      room.crashPoint = undefined;
      room.crashBets = {};
      room.currentCrashResult = undefined;
      room.players.forEach((p) => {
        p.currentCrashBet = null;
        p.cashOutMultiplier = null;
      });
      return room;
    } else {
      return this.startDistribution(roomId);
    }
  }

  /* =====================================================================
   * LE BLACKJACK
   * ===================================================================== */

  public transitionToBlackjack(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.state = 'playing_blackjack';
    room.blackjackBets = {};
    room.dealerHand = [];
    room.currentBlackjackResult = undefined;
    room.deck = [];
    room.players.forEach((p) => {
      p.hand = [];
      p.blackjackStatus = undefined;
      p.currentBlackjackBet = null;
    });

    return room;
  }

  public submitBlackjackBet(
    roomId: string,
    socketId: string,
    amount: number
  ): { success: boolean; room?: Room; allBlackjackBet: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, allBlackjackBet: false, error: 'Room non trouvée' };
    if (room.state !== 'playing_blackjack') {
      return { success: false, allBlackjackBet: false, error: "La prise des mises du Blackjack n'est pas en cours" };
    }

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return { success: false, allBlackjackBet: false, error: 'Joueur non trouvé' };

    const maxAllowed = Math.min(player.balance, Math.max(5, Math.floor(player.balance * 0.30)));
    if (amount <= 0 || amount > maxAllowed) {
      return {
        success: false,
        allBlackjackBet: false,
        error: `Mise invalide. Vous pouvez miser entre 1 et ${maxAllowed} jetons.`,
      };
    }

    if (!room.blackjackBets) room.blackjackBets = {};
    const safeAmount = Math.floor(amount);
    room.blackjackBets[socketId] = safeAmount;
    player.currentBlackjackBet = safeAmount;

    const allBlackjackBet = this.checkAllBlackjackBet(room);
    return { success: true, room, allBlackjackBet };
  }

  public checkAllBlackjackBet(room: Room): boolean {
    if (room.players.length === 0) return false;
    if (!room.blackjackBets) return false;

    const activeBettors = room.players.filter((p) => p.balance > 0);
    if (activeBettors.length === 0) return true;

    return activeBettors.every((p) => room.blackjackBets && room.blackjackBets[p.id] !== undefined);
  }

  public startBlackjackDealing(roomId: string): { room?: Room; allFinished: boolean } {
    const room = this.getRoom(roomId);
    if (!room) return { allFinished: false };

    const deck = createDeck();
    room.state = 'blackjack_playing';

    room.players.forEach((player) => {
      const bet = room.blackjackBets ? room.blackjackBets[player.id] : undefined;
      if (bet && bet > 0) {
        player.hand = [deck.pop()!, deck.pop()!];
        const score = calculateHandScore(player.hand);
        player.blackjackStatus = score === 21 ? 'stood' : 'playing';
      } else {
        player.hand = [];
        player.blackjackStatus = 'stood';
      }
    });

    room.dealerHand = [deck.pop()!];
    room.deck = deck;

    const allFinished = this.checkAllBlackjackFinished(room);
    return { room, allFinished };
  }

  public blackjackHit(
    roomId: string,
    socketId: string
  ): { success: boolean; room?: Room; allFinished: boolean; playerBusted: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, allFinished: false, playerBusted: false, error: 'Room non trouvée' };
    if (room.state !== 'blackjack_playing') {
      return { success: false, allFinished: false, playerBusted: false, error: "Pas en cours de jeu" };
    }

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return { success: false, allFinished: false, playerBusted: false, error: 'Joueur non trouvé' };
    if (player.blackjackStatus !== 'playing') {
      return { success: false, allFinished: false, playerBusted: false, error: "Vous ne pouvez plus tirer de carte" };
    }

    if (!room.deck || room.deck.length === 0) {
      room.deck = createDeck();
    }

    if (!player.hand) player.hand = [];
    player.hand.push(room.deck.pop()!);

    const score = calculateHandScore(player.hand);
    let playerBusted = false;

    if (score > 21) {
      player.blackjackStatus = 'busted';
      playerBusted = true;
    } else if (score === 21) {
      player.blackjackStatus = 'stood';
    }

    const allFinished = this.checkAllBlackjackFinished(room);
    return { success: true, room, allFinished, playerBusted };
  }

  public blackjackStand(
    roomId: string,
    socketId: string
  ): { success: boolean; room?: Room; allFinished: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, allFinished: false, error: 'Room non trouvée' };
    if (room.state !== 'blackjack_playing') {
      return { success: false, allFinished: false, error: "Pas en cours de jeu" };
    }

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return { success: false, allFinished: false, error: 'Joueur non trouvé' };
    if (player.blackjackStatus !== 'playing') {
      return { success: false, allFinished: false, error: "Action déjà enregistrée" };
    }

    player.blackjackStatus = 'stood';
    const allFinished = this.checkAllBlackjackFinished(room);
    return { success: true, room, allFinished };
  }

  public checkAllBlackjackFinished(room: Room): boolean {
    if (room.players.length === 0) return true;
    const bettors = room.players.filter((p) => room.blackjackBets && room.blackjackBets[p.id]);
    if (bettors.length === 0) return true;

    return bettors.every((p) => p.blackjackStatus === 'stood' || p.blackjackStatus === 'busted');
  }

  public dealerDrawCard(roomId: string): {
    room?: Room;
    card?: Card;
    dealerScore: number;
    shouldContinue: boolean;
    dealerBusted: boolean;
  } {
    const room = this.getRoom(roomId);
    if (!room) return { dealerScore: 0, shouldContinue: false, dealerBusted: false };

    if (!room.deck || room.deck.length === 0) {
      room.deck = createDeck();
    }

    if (!room.dealerHand) room.dealerHand = [];
    const card = room.deck.pop()!;
    room.dealerHand.push(card);

    const dealerScore = calculateHandScore(room.dealerHand);
    const dealerBusted = dealerScore > 21;
    const shouldContinue = dealerScore < 17;

    return { room, card, dealerScore, shouldContinue, dealerBusted };
  }

  public resolveBlackjack(roomId: string): { room: Room; result: BlackjackRoundResult } | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    const dealerScore = calculateHandScore(room.dealerHand);
    const dealerBusted = dealerScore > 21;
    const sipMultiplier = room.settings?.sipMultiplier ?? 1;
    const results: PlayerBlackjackResult[] = [];

    room.players.forEach((player) => {
      const bet = room.blackjackBets ? room.blackjackBets[player.id] : undefined;

      if (!bet || bet <= 0) {
        results.push({
          playerId: player.id,
          playerName: player.name,
          betAmount: 0,
          hand: player.hand || [],
          score: calculateHandScore(player.hand),
          status: 'lost',
          netGain: 0,
          sipsToDrink: 0,
          newBalance: player.balance,
          isBankrupt: player.balance <= 0,
        });
        return;
      }

      const score = calculateHandScore(player.hand);
      const isPlayerBusted = player.blackjackStatus === 'busted' || score > 21;

      let status: 'won' | 'lost' | 'push' | 'busted';
      let netGain = 0;
      let sipsToDrink = 0;

      if (isPlayerBusted) {
        status = 'busted';
        netGain = -bet;
        sipsToDrink = bet * sipMultiplier;
        player.balance -= bet;
        player.sipsToDrink += sipsToDrink;
      } else if (dealerBusted) {
        status = 'won';
        netGain = bet;
        sipsToDrink = 0;
        player.balance += netGain;
      } else if (score > dealerScore) {
        status = 'won';
        netGain = bet;
        sipsToDrink = 0;
        player.balance += netGain;
      } else if (score < dealerScore) {
        status = 'lost';
        netGain = -bet;
        sipsToDrink = bet * sipMultiplier;
        player.balance -= bet;
        player.sipsToDrink += sipsToDrink;
      } else {
        status = 'push';
        netGain = 0;
        sipsToDrink = 0;
      }

      player.balance = Math.max(0, player.balance);
      player.status = player.balance <= 0 ? 'bankrupt' : 'active';

      results.push({
        playerId: player.id,
        playerName: player.name,
        betAmount: bet,
        hand: player.hand || [],
        score,
        status,
        netGain,
        sipsToDrink,
        newBalance: player.balance,
        isBankrupt: player.status === 'bankrupt',
      });
    });

    const roundResult: BlackjackRoundResult = {
      dealerHand: room.dealerHand || [],
      dealerScore,
      dealerBusted,
      results,
    };

    room.currentBlackjackResult = roundResult;
    room.state = 'blackjack_result';

    return { room, result: roundResult };
  }

  /* =====================================================================
   * LES MINES (GRILLE COMMUNE 6x6 — TOUR PAR TOUR)
   * ===================================================================== */

  public transitionToMines(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.state = 'playing_mines';
    room.minesBets = {};
    room.minesGrid = undefined;
    room.revealedCells = [];
    room.currentTurnPlayerId = undefined;
    room.currentMinesResult = undefined;
    room.players.forEach((p) => {
      p.minesStatus = undefined;
      p.safeClicks = 0;
      p.currentMinesBet = null;
    });

    return room;
  }

  public submitMinesBet(
    roomId: string,
    socketId: string,
    amount: number
  ): { success: boolean; room?: Room; allMinesBet: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, allMinesBet: false, error: 'Room non trouvée' };
    if (room.state !== 'playing_mines') {
      return { success: false, allMinesBet: false, error: "La prise des mises des Mines n'est pas en cours" };
    }

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return { success: false, allMinesBet: false, error: 'Joueur non trouvé' };

    const maxAllowed = Math.min(player.balance, Math.max(5, Math.floor(player.balance * 0.30)));
    if (amount <= 0 || amount > maxAllowed) {
      return {
        success: false,
        allMinesBet: false,
        error: `Mise invalide. Vous pouvez miser entre 1 et ${maxAllowed} jetons.`,
      };
    }

    if (!room.minesBets) room.minesBets = {};
    const safeAmount = Math.floor(amount);
    room.minesBets[socketId] = safeAmount;
    player.currentMinesBet = safeAmount;

    const allMinesBet = this.checkAllMinesBet(room);
    return { success: true, room, allMinesBet };
  }

  public checkAllMinesBet(room: Room): boolean {
    if (room.players.length === 0) return false;
    if (!room.minesBets) return false;

    const activeBettors = room.players.filter((p) => p.balance > 0);
    if (activeBettors.length === 0) return true;

    return activeBettors.every((p) => room.minesBets && room.minesBets[p.id] !== undefined);
  }

  public startMinesGame(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    const bombCount = room.settings?.minesBombCount ?? 7;
    room.state = 'mines_playing';
    room.minesGrid = generateMinesBombs(bombCount, 36);
    room.revealedCells = [];

    const bettors = room.players.filter((p) => room.minesBets && room.minesBets[p.id]);
    bettors.forEach((p) => {
      p.minesStatus = 'playing';
      p.safeClicks = 0;
    });

    if (bettors.length > 0) {
      room.currentTurnPlayerId = bettors[0].id;
    }

    return room;
  }

  public nextMinesTurn(roomId: string): { room?: Room; roundFinished: boolean } {
    const room = this.getRoom(roomId);
    if (!room) return { roundFinished: false };

    const bettors = room.players.filter((p) => room.minesBets && room.minesBets[p.id]);
    const playingPlayers = bettors.filter((p) => p.minesStatus === 'playing');

    const bombCount = room.settings?.minesBombCount ?? 7;
    const totalSafeTarget = 36 - bombCount;
    const totalBombsHit = (room.revealedCells || []).filter((idx) => room.minesGrid && room.minesGrid.includes(idx)).length;
    const totalSafeRevealed = (room.revealedCells || []).length - totalBombsHit;
    const allSafeFound = totalSafeRevealed >= totalSafeTarget;

    if (playingPlayers.length === 0 || allSafeFound) {
      this.resolveMines(roomId);
      return { room, roundFinished: true };
    }

    const currentIndex = bettors.findIndex((p) => p.id === room.currentTurnPlayerId);
    let nextIndex = (currentIndex + 1) % bettors.length;

    for (let i = 0; i < bettors.length; i++) {
      const p = bettors[nextIndex];
      if (p.minesStatus === 'playing') {
        room.currentTurnPlayerId = p.id;
        return { room, roundFinished: false };
      }
      nextIndex = (nextIndex + 1) % bettors.length;
    }

    this.resolveMines(roomId);
    return { room, roundFinished: true };
  }

  public minesRevealCell(
    roomId: string,
    socketId: string,
    cellIndex: number
  ): { success: boolean; room?: Room; isBomb: boolean; roundFinished: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, isBomb: false, roundFinished: false, error: 'Room non trouvée' };
    if (room.state !== 'mines_playing') {
      return { success: false, isBomb: false, roundFinished: false, error: "Ce n'est pas le moment de jouer" };
    }
    if (room.currentTurnPlayerId !== socketId) {
      return { success: false, isBomb: false, roundFinished: false, error: "Ce n'est pas votre tour de jouer !" };
    }
    if (cellIndex < 0 || cellIndex >= 36) {
      return { success: false, isBomb: false, roundFinished: false, error: 'Case invalide' };
    }
    if (!room.revealedCells) room.revealedCells = [];
    if (room.revealedCells.includes(cellIndex)) {
      return { success: false, isBomb: false, roundFinished: false, error: 'Cette case a déjà été découverte' };
    }

    const player = room.players.find((p) => p.id === socketId);
    if (!player || player.minesStatus !== 'playing') {
      return { success: false, isBomb: false, roundFinished: false, error: 'Vous ne jouez plus sur cette manche' };
    }

    room.revealedCells.push(cellIndex);
    const isBomb = Boolean(room.minesGrid && room.minesGrid.includes(cellIndex));

    if (isBomb) {
      player.minesStatus = 'busted';
    } else {
      player.safeClicks = (player.safeClicks || 0) + 1;
    }

    const nextResult = this.nextMinesTurn(roomId);
    return { success: true, room, isBomb, roundFinished: nextResult.roundFinished };
  }

  public minesCashOut(
    roomId: string,
    socketId: string
  ): { success: boolean; room?: Room; roundFinished: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, roundFinished: false, error: 'Room non trouvée' };
    if (room.state !== 'mines_playing') {
      return { success: false, roundFinished: false, error: "Ce n'est pas le moment de sécuriser" };
    }
    if (room.currentTurnPlayerId !== socketId) {
      return { success: false, roundFinished: false, error: "Ce n'est pas votre tour !" };
    }

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return { success: false, roundFinished: false, error: 'Joueur non trouvé' };
    if (player.minesStatus !== 'playing') {
      return { success: false, roundFinished: false, error: 'Action impossible' };
    }
    if ((player.safeClicks || 0) < 1) {
      return { success: false, roundFinished: false, error: 'Vous devez avoir trouvé au moins 1 case sûre pour sécuriser vos gains' };
    }

    player.minesStatus = 'cashed_out';
    const nextResult = this.nextMinesTurn(roomId);
    return { success: true, room, roundFinished: nextResult.roundFinished };
  }

  public resolveMines(roomId: string): { room: Room; result: MinesRoundResult } | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    const sipMultiplier = room.settings?.sipMultiplier ?? 1;
    const results: PlayerMinesResult[] = [];

    room.players.forEach((player) => {
      const bet = room.minesBets ? room.minesBets[player.id] : undefined;

      if (!bet || bet <= 0) {
        results.push({
          playerId: player.id,
          playerName: player.name,
          betAmount: 0,
          safeClicks: 0,
          status: 'busted',
          netGain: 0,
          sipsToDrink: 0,
          newBalance: player.balance,
          isBankrupt: player.balance <= 0,
        });
        return;
      }

      const safeClicks = player.safeClicks || 0;
      let status = player.minesStatus || 'busted';
      if (status === 'playing') {
        status = 'cashed_out';
        player.minesStatus = 'cashed_out';
      }

      let netGain = 0;
      let sipsToDrink = 0;

      if (status === 'cashed_out') {
        netGain = safeClicks;
        sipsToDrink = 0;
        player.balance += netGain;
      } else {
        netGain = -bet;
        sipsToDrink = bet * sipMultiplier;
        player.balance -= bet;
        player.sipsToDrink += sipsToDrink;
      }

      player.balance = Math.max(0, player.balance);
      player.status = player.balance <= 0 ? 'bankrupt' : 'active';

      results.push({
        playerId: player.id,
        playerName: player.name,
        betAmount: bet,
        safeClicks,
        status,
        netGain,
        sipsToDrink,
        newBalance: player.balance,
        isBankrupt: player.status === 'bankrupt',
      });
    });

    const roundResult: MinesRoundResult = {
      minesGrid: room.minesGrid || [],
      revealedCells: room.revealedCells || [],
      results,
    };

    room.currentMinesResult = roundResult;
    room.state = 'mines_result';

    return { room, result: roundResult };
  }

  /* =====================================================================
   * LE DERBY (COURSE DE CHEVAUX)
   * ===================================================================== */

  public transitionToDerby(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.state = 'playing_derby';
    room.derbyHorses = DEFAULT_DERBY_HORSES.map(h => ({ ...h, progress: 0 }));
    room.winningHorseId = null;
    room.derbyBets = {};
    room.currentDerbyResult = undefined;
    room.players.forEach(p => {
      p.derbyBet = null;
    });
    return room;
  }

  public submitDerbyBet(
    roomId: string,
    socketId: string,
    horseId: number,
    amount: number
  ): { success: boolean; room?: Room; allDerbyBet: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, allDerbyBet: false, error: 'Room non trouvée' };
    if (room.state !== 'playing_derby') {
      return { success: false, allDerbyBet: false, error: "La prise de pari du Derby n'est pas active" };
    }

    const player = room.players.find(p => p.id === socketId);
    if (!player) return { success: false, allDerbyBet: false, error: 'Joueur introuvable' };

    const parsedAmount = Math.floor(Number(amount));
    if (isNaN(parsedAmount) || parsedAmount < 1) {
      return { success: false, allDerbyBet: false, error: 'Le montant de la mise doit être au minimum de 1 jeton' };
    }

    const maxBet = Math.min(player.balance, Math.max(5, Math.floor(player.balance * 0.3)));
    if (parsedAmount > maxBet) {
      return { success: false, allDerbyBet: false, error: `La mise maximale autorisée est de ${maxBet} jetons` };
    }

    if (![1, 2, 3, 4].includes(horseId)) {
      return { success: false, allDerbyBet: false, error: 'Cheval sélectionné invalide' };
    }

    player.derbyBet = { horseId, amount: parsedAmount };
    if (!room.derbyBets) room.derbyBets = {};
    const activePlayers = room.players.filter(p => p.balance > 0);
    const allDerbyBet = activePlayers.length > 0 && activePlayers.every(p => Boolean(p.derbyBet && p.derbyBet.amount > 0));

    return { success: true, room, allDerbyBet };
  }

  public transitionToDerbyRacing(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;
    room.state = 'derby_racing';
    room.derbyHorses = DEFAULT_DERBY_HORSES.map(h => ({
      ...h,
      progress: 0,
      status: 'running' as const,
      momentum: 'normal' as const,
      momentumTimerTicks: 0,
    }));
    room.winningHorseId = null;
    return room;
  }

  public startDerbyRace(roomId: string): Room | undefined {
    return this.transitionToDerbyRacing(roomId);
  }

  public stepDerbyRace(
    roomId: string,
    tickIntervalMs = 100
  ): { finished: boolean; winnerId: number | null; horses: DerbyHorse[] } {
    const room = this.getRoom(roomId);
    if (!room || !room.derbyHorses) return { finished: false, winnerId: null, horses: [] };

    const WINNING_PROGRESS = 360; // 1 seul tour complet de l'hippodrome (360°)

    // 1. Repérer les positions relatives dynamiques des chevaux normaux pour le Rubber-banding
    const normalHorses = room.derbyHorses.filter(h => !h.isTocard);
    const sortedNormals = [...normalHorses].sort((a, b) => b.progress - a.progress);
    const leaderHorse = sortedNormals[0];
    const trailerHorse = sortedNormals[sortedNormals.length - 1];

    // 2. Calculer indépendamment la vitesse et le momentum de chaque cheval
    const speeds = new Map<number, number>();

    room.derbyHorses.forEach(horse => {
      if (horse.isTocard) {
        // Le Tocard avance à vitesse très réduite (quasiment pas, ~50° sur tout le tour)
        const tocardSpeed = Math.random() * 0.4 + 0.35;
        speeds.set(horse.id, tocardSpeed);
        return;
      }

      // Décrémenter le timer de momentum actif
      if (horse.momentumTimerTicks && horse.momentumTimerTicks > 0) {
        horse.momentumTimerTicks -= 1;
        if (horse.momentumTimerTicks === 0) {
          horse.momentum = 'normal';
        }
      }

      // Évaluation des changements de momentum
      if (!horse.momentum || horse.momentum === 'normal') {
        const isLeading = leaderHorse && horse.id === leaderHorse.id;
        const isTrailing = trailerHorse && horse.id === trailerHorse.id;
        const leadGap = sortedNormals.length > 1 ? leaderHorse.progress - sortedNormals[1].progress : 0;
        const trailGap = sortedNormals.length > 1 ? sortedNormals[sortedNormals.length - 2].progress - trailerHorse.progress : 0;

        const roll = Math.random();

        // Effet Mario Kart (Rubber-banding calibré sur 1 tour)
        if (isLeading && leadGap > 8 && roll < 0.16) {
          // Le 1er avec de l'avance s'essouffle (fatigue)
          horse.momentum = 'fatigued';
          horse.momentumTimerTicks = Math.floor(Math.random() * 6) + 6; // ~0.6s à 1.2s
        } else if (isTrailing && trailGap > 6 && roll < 0.18) {
          // Le dernier normal à la traîne a un sursaut d'énergie (boost sprint !)
          horse.momentum = 'boosted';
          horse.momentumTimerTicks = Math.floor(Math.random() * 7) + 6; // ~0.6s à 1.3s
        } else if (roll < 0.06) {
          // Aléatoire naturel indépendant
          horse.momentum = Math.random() < 0.5 ? 'boosted' : 'fatigued';
          horse.momentumTimerTicks = Math.floor(Math.random() * 6) + 6;
        }
      }

      // Vitesse de base indépendante calibrée pour 1 tour (360°) en ~14 secondes (140 ticks)
      let speed = Math.random() * 1.0 + 1.5;
      if (horse.momentum === 'boosted') {
        speed *= 2.5; // Multiplié par 2.5 pendant un instant
      } else if (horse.momentum === 'fatigued') {
        speed *= 0.5; // Divisé par 2
      }

      speeds.set(horse.id, speed);
    });

    // 3. Appliquer l'avancée et déterminer le vainqueur exact par fraction d'arrivée
    let bestCrossing: { horse: DerbyHorse; frac: number } | null = null;

    for (const horse of room.derbyHorses) {
      const speed = speeds.get(horse.id) ?? (Math.random() * 3.5 + 4.8);
      const prevProgress = horse.progress;
      const nextProgress = Math.round((prevProgress + speed) * 10) / 10;
      horse.progress = nextProgress;

      if (nextProgress >= WINNING_PROGRESS) {
        // Fraction exacte de l'itération au moment où le cheval a atteint 1080°
        const frac = (WINNING_PROGRESS - prevProgress) / speed;
        if (!bestCrossing || frac < bestCrossing.frac) {
          bestCrossing = { horse, frac };
        }
      }
    }

    if (bestCrossing) {
      const winningHorse: DerbyHorse = bestCrossing.horse;
      room.winningHorseId = winningHorse.id;
      return { finished: true, winnerId: winningHorse.id, horses: room.derbyHorses };
    }

    return { finished: false, winnerId: null, horses: room.derbyHorses };
  }

  public resolveDerby(roomId: string): { room: Room; result: DerbyRoundResult } | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    const winningHorseId = room.winningHorseId || 1;
    const winningHorse = (room.derbyHorses || DEFAULT_DERBY_HORSES).find(h => h.id === winningHorseId) || DEFAULT_DERBY_HORSES[0];
    const sipMultiplier = room.settings?.sipMultiplier || 1;

    const results: PlayerDerbyResult[] = [];

    room.players.forEach(player => {
      const bet = player.derbyBet || (room.derbyBets ? room.derbyBets[player.id] : null);
      if (!bet || bet.amount <= 0) {
        results.push({
          playerId: player.id,
          playerName: player.name,
          horseId: 0,
          betAmount: 0,
          won: false,
          netGain: 0,
          sipsToDrink: 0,
          newBalance: player.balance,
          isBankrupt: player.balance <= 0,
        });
        return;
      }

      const won = bet.horseId === winningHorseId;
      let netGain = 0;
      let sipsToDrink = 0;

      if (won) {
        netGain = bet.amount * 3;
        sipsToDrink = 0;
        player.balance += netGain;
      } else {
        netGain = -bet.amount;
        sipsToDrink = bet.amount * sipMultiplier;
        player.balance -= bet.amount;
        player.sipsToDrink += sipsToDrink;
      }

      player.balance = Math.max(0, player.balance);
      player.status = player.balance <= 0 ? 'bankrupt' : 'active';

      results.push({
        playerId: player.id,
        playerName: player.name,
        horseId: bet.horseId,
        betAmount: bet.amount,
        won,
        netGain,
        sipsToDrink,
        newBalance: player.balance,
        isBankrupt: player.status === 'bankrupt',
      });
    });

    const roundResult: DerbyRoundResult = {
      winningHorseId,
      winningHorse,
      horses: room.derbyHorses || DEFAULT_DERBY_HORSES,
      results,
    };

    room.currentDerbyResult = roundResult;
    room.state = 'derby_result';

    return { room, result: roundResult };
  }

  /* =====================================================================
   * LE GRAND FINAL (TAXE, DISTRIBUTION FINALE, BILAN ULTIME)
   * ===================================================================== */

  /**
   * Generates a random tax (10% to 40%) for every player and sets state to 'final_tax'.
   */
  public startFinalTax(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.state = 'final_tax';

    room.players.forEach((player) => {
      const taxRate = Math.floor(Math.random() * 31) + 10; // 10 to 40 %
      const personalTaxSips = Math.round(player.balance * (taxRate / 100));
      const distributableBalance = Math.max(0, player.balance - personalTaxSips);

      player.taxRate = taxRate;
      player.personalTaxSips = personalTaxSips;
      player.distributableBalance = distributableBalance;
      player.sipsToDrink = personalTaxSips;
      player.hasSubmittedFinalDistribution = distributableBalance === 0;
      player.hasDrank = false;
    });

    return room;
  }

  /**
   * Transitions from final_tax to final_distribution.
   */
  public startFinalDistribution(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.state = 'final_distribution';

    const allSubmitted = room.players.every((p) => p.hasSubmittedFinalDistribution);
    if (allSubmitted) {
      return this.startFinalDrinking(roomId);
    }

    return room;
  }

  /**
   * Submits player's distribution of their distributableBalance across other players.
   */
  public submitFinalDistribution(
    roomId: string,
    socketId: string,
    allocations: Record<string, number>
  ): { success: boolean; room?: Room; allSubmitted: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, allSubmitted: false, error: 'Room non trouvée' };
    if (room.state !== 'final_distribution') {
      return { success: false, allSubmitted: false, error: "La distribution finale n'est pas active" };
    }

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return { success: false, allSubmitted: false, error: 'Joueur non trouvé' };

    const expectedTotal = player.distributableBalance || 0;
    const totalAllocated = Object.values(allocations || {}).reduce(
      (sum, v) => sum + (Math.floor(Number(v)) || 0),
      0
    );

    if (totalAllocated !== expectedTotal) {
      return {
        success: false,
        allSubmitted: false,
        error: `La somme allouée (${totalAllocated} 🍺) doit être exactement égale à votre solde distribuable (${expectedTotal} 🍺).`,
      };
    }

    // Apply allocations
    for (const [targetPlayerId, sips] of Object.entries(allocations)) {
      const sipsInt = Math.floor(Number(sips)) || 0;
      if (sipsInt > 0) {
        const target = room.players.find((p) => p.id === targetPlayerId);
        if (target) {
          target.sipsToDrink += sipsInt;
        }
      }
    }

    player.balance -= expectedTotal;
    player.hasSubmittedFinalDistribution = true;

    const allSubmitted = room.players.every((p) => p.hasSubmittedFinalDistribution);
    if (allSubmitted) {
      this.startFinalDrinking(roomId);
    }

    return { success: true, room, allSubmitted };
  }

  /**
   * Transitions to final drinking phase ("LE GRAND BILAN").
   */
  public startFinalDrinking(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.state = 'final_drinking';
    room.players.forEach((p) => {
      p.hasDrank = p.sipsToDrink === 0;
    });

    return room;
  }

  /**
   * Resets room and balances back to lobby.
   */
  public resetToLobby(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    const startBal = room.settings?.startingBalance ?? 20;

    room.state = 'lobby';
    room.currentRound = 1;
    room.votes = {};
    room.bets = {};
    room.crashBets = {};
    room.blackjackBets = {};
    room.minesBets = {};
    room.currentResult = undefined;
    room.currentCrashResult = undefined;
    room.currentBlackjackResult = undefined;
    room.currentMinesResult = undefined;
    room.dealerHand = [];
    room.deck = [];
    room.minesGrid = undefined;
    room.revealedCells = [];
    room.currentTurnPlayerId = undefined;
    room.crashRound = undefined;
    room.crashMultiplier = undefined;
    room.crashPoint = undefined;
    room.derbyBets = {};
    room.derbyHorses = undefined;
    room.winningHorseId = null;
    room.currentDerbyResult = undefined;
    room.distributions = [];

    room.players.forEach((p) => {
      p.balance = startBal;
      p.sipsToDrink = 0;
      p.hasDrank = false;
      p.inventory = [];
      p.status = 'active';
      p.currentBet = null;
      p.currentCrashBet = null;
      p.cashOutMultiplier = null;
      p.hand = [];
      p.blackjackStatus = undefined;
      p.currentBlackjackBet = null;
      p.minesStatus = undefined;
      p.safeClicks = 0;
      p.currentMinesBet = null;
      p.derbyBet = null;
      p.taxRate = undefined;
      p.personalTaxSips = undefined;
      p.distributableBalance = undefined;
      p.hasSubmittedFinalDistribution = undefined;
    });

    return room;
  }

  /* =====================================================================
   * DISTRIBUTION & DRINKING PHASE STANDARD
   * ===================================================================== */

  public startDistribution(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.state = 'distribution';
    room.distributions = [];
    room.crashRound = undefined;
    return room;
  }

  public sendSips(
    roomId: string,
    fromSocketId: string,
    toPlayerId: string,
    amount: number
  ): { success: boolean; room?: Room; distribution?: SipDistribution; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'Room non trouvée' };
    if (room.state !== 'distribution') {
      return { success: false, error: "La phase de distribution n'est pas active" };
    }

    const fromPlayer = room.players.find((p) => p.id === fromSocketId);
    const toPlayer = room.players.find((p) => p.id === toPlayerId);

    if (!fromPlayer) return { success: false, error: 'Expéditeur non trouvé' };
    if (!toPlayer) return { success: false, error: 'Destinataire non trouvé' };
    if (fromSocketId === toPlayerId) return { success: false, error: 'Vous ne pouvez pas vous donner des gorgées à vous-même' };

    const maxAllowed = Math.floor(fromPlayer.balance * 0.20);
    if (amount <= 0 || amount > maxAllowed) {
      return {
        success: false,
        error: `Montant invalide. Vous pouvez donner entre 1 et ${maxAllowed} gorgées.`,
      };
    }

    const safeAmount = Math.floor(amount);
    fromPlayer.balance -= safeAmount;
    toPlayer.sipsToDrink += safeAmount;

    fromPlayer.balance = Math.max(0, fromPlayer.balance);
    fromPlayer.status = fromPlayer.balance <= 0 ? 'bankrupt' : 'active';

    const distribution: SipDistribution = {
      fromPlayerId: fromPlayer.id,
      fromPlayerName: fromPlayer.name,
      toPlayerId: toPlayer.id,
      toPlayerName: toPlayer.name,
      amount: safeAmount,
    };

    if (!room.distributions) room.distributions = [];
    room.distributions.push(distribution);

    return { success: true, room, distribution };
  }

  public startDrinkingPhase(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.state = 'drinking_phase';
    room.players.forEach((p) => {
      p.hasDrank = p.sipsToDrink === 0;
    });

    return room;
  }

  public confirmDrank(
    roomId: string,
    socketId: string
  ): { success: boolean; room?: Room; allDrank: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, allDrank: false, error: 'Room introuvable' };
    if (room.state !== 'drinking_phase' && room.state !== 'final_drinking') {
      return { success: false, allDrank: false, error: "Pas en phase de boisson" };
    }

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return { success: false, allDrank: false, error: 'Joueur introuvable' };

    player.hasDrank = true;
    const allDrank = this.checkAllDrank(room);

    return { success: true, room, allDrank };
  }

  public checkAllDrank(room: Room): boolean {
    if (room.players.length === 0) return true;
    return room.players.every((p) => p.hasDrank);
  }

  public endTurn(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    room.currentRound = (room.currentRound || 1) + 1;

    // Check forced final if maxRounds reached
    const maxRounds = room.settings?.maxRounds ?? 10;
    if (room.currentRound >= maxRounds) {
      return this.startFinalTax(roomId);
    }

    room.votes = {};
    room.bets = {};
    room.crashBets = {};
    room.blackjackBets = {};
    room.minesBets = {};
    room.derbyBets = {};
    room.currentResult = undefined;
    room.currentCrashResult = undefined;
    room.currentBlackjackResult = undefined;
    room.currentMinesResult = undefined;
    room.derbyHorses = undefined;
    room.winningHorseId = null;
    room.currentDerbyResult = undefined;
    room.dealerHand = [];
    room.deck = [];
    room.minesGrid = undefined;
    room.revealedCells = [];
    room.currentTurnPlayerId = undefined;
    room.crashRound = undefined;
    room.crashMultiplier = undefined;
    room.crashPoint = undefined;
    room.distributions = [];
    room.players.forEach((p) => {
      p.currentBet = null;
      p.currentCrashBet = null;
      p.cashOutMultiplier = null;
      p.hand = [];
      p.blackjackStatus = undefined;
      p.currentBlackjackBet = null;
      p.minesStatus = undefined;
      p.safeClicks = 0;
      p.currentMinesBet = null;
      p.derbyBet = null;
      p.sipsToDrink = 0;
      p.hasDrank = false;
    });

    const enabled = room.settings?.enabledGames || ['mines', 'blackjack', 'crash', 'roulette', 'derby'];
    if (enabled.length === 1) {
      return this.transitionToGameChoice(roomId, enabled[0]);
    }

    room.state = 'voting';
    room.currentVoteOptions = pickVoteOptions(enabled);
    return room;
  }

  public getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }
}

export const roomManager = new RoomManager();
