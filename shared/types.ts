export type PlayerStatus = 'active' | 'bankrupt';

export type RouletteColor = 'red' | 'black' | 'green';

export interface PlayerCurrentBet {
  amount: number;
  color: RouletteColor;
}

export interface Card {
  suit: string; // '♠' | '♥' | '♦' | '♣'
  value: string; // '2'..'10' | 'J' | 'Q' | 'K' | 'A'
}

export type BlackjackStatus = 'playing' | 'stood' | 'busted';
export type MinesStatus = 'playing' | 'busted' | 'cashed_out';

export interface Player {
  id: string;
  name: string;
  balance: number; // default: 15
  inventory: string[]; // default: []
  status: PlayerStatus; // default: 'active'
  currentBet?: PlayerCurrentBet | null;
  currentCrashBet?: number | null;
  cashOutMultiplier?: number | null;
  // Blackjack:
  hand?: Card[];
  blackjackStatus?: BlackjackStatus;
  currentBlackjackBet?: number | null;
  // Les Mines (Grille commune):
  minesStatus?: MinesStatus;
  safeClicks?: number; // count of safe cells uncovered
  currentMinesBet?: number | null;
  // Le Derby (Course de chevaux):
  derbyBet?: { horseId: number; amount: number } | null;
  // Grand Final (Taxe & Distribution):
  taxRate?: number; // 10 to 40 (%)
  personalTaxSips?: number; // gorgées dues à la taxe personnelle
  distributableBalance?: number; // solde restant à distribuer aux autres
  hasSubmittedFinalDistribution?: boolean;
  // Addition / Drinking:
  sipsToDrink: number; // default: 0 (accumulated sips from losses + received distribution)
  hasDrank: boolean; // default: false (true if sipsToDrink === 0 or after player confirms drinking)
}

export type RoomState =
  | 'lobby'
  | 'voting'
  | 'playing_roulette'
  | 'roulette_spinning'
  | 'roulette_result'
  | 'playing_crash'
  | 'crash_flying'
  | 'crash_result'
  | 'playing_blackjack'
  | 'blackjack_playing'
  | 'blackjack_dealer_turn'
  | 'blackjack_result'
  | 'playing_mines'
  | 'mines_playing'
  | 'mines_result'
  | 'playing_derby'
  | 'derby_racing'
  | 'derby_result'
  | 'distribution'
  | 'drinking_phase'
  | 'final_tax'
  | 'final_distribution'
  | 'final_drinking'
  | 'playing'
  | 'shop';

export type GameChoice = 'roulette' | 'crash' | 'blackjack' | 'mines' | 'derby' | 'dice' | 'end_game';

export interface RoomSettings {
  startingBalance: number; // default: 20
  minRounds: number; // default: 3
  maxRounds: number; // default: 10
  maxPlayers: number; // default: 8
  minesBombCount: number; // default: 7
  sipMultiplier: number; // default: 1 (1, 2, 3)
  enabledGames: GameChoice[]; // default: ['mines', 'blackjack', 'crash', 'roulette', 'derby']
}

export interface RouletteBet {
  playerId: string;
  amount: number;
  color: RouletteColor;
}

export interface PlayerRoundResult {
  playerId: string;
  playerName: string;
  betAmount: number;
  chosenColor: RouletteColor;
  won: boolean;
  netGain: number; // e.g. +5 or -5
  newBalance: number;
  isBankrupt: boolean;
}

export interface RouletteRoundResult {
  winningColor: RouletteColor;
  winningNumber: number; // 0 = Green, 1-36 = Red or Black
  results: PlayerRoundResult[];
}

export interface CrashBet {
  playerId: string;
  amount: number;
}

export interface PlayerCrashResult {
  playerId: string;
  playerName: string;
  betAmount: number;
  cashedOut: boolean;
  cashOutMultiplier?: number;
  won: boolean;
  netGain: number; // strictly integer
  sipsToDrink: number; // strictly integer
  newBalance: number;
  isBankrupt: boolean;
}

export interface CrashRoundResult {
  crashPoint: number;
  results: PlayerCrashResult[];
}

export interface PlayerBlackjackResult {
  playerId: string;
  playerName: string;
  betAmount: number;
  hand: Card[];
  score: number;
  status: 'won' | 'lost' | 'push' | 'busted';
  netGain: number; // strictly integer
  sipsToDrink: number; // strictly integer
  newBalance: number;
  isBankrupt: boolean;
}

export interface BlackjackRoundResult {
  dealerHand: Card[];
  dealerScore: number;
  dealerBusted: boolean;
  results: PlayerBlackjackResult[];
}

export interface PlayerMinesResult {
  playerId: string;
  playerName: string;
  betAmount: number;
  safeClicks: number;
  status: 'cashed_out' | 'busted' | 'playing';
  netGain: number; // strictly integer (safeClicks if cashed_out, -betAmount if busted)
  sipsToDrink: number; // strictly integer (betAmount if busted)
  newBalance: number;
  isBankrupt: boolean;
}

export interface MinesRoundResult {
  minesGrid: number[]; // 7 bomb indices (0 to 35)
  revealedCells: number[]; // indices of clicked cells
  results: PlayerMinesResult[];
}

export interface DerbyHorse {
  id: number;
  name: string;
  color: string;
  emoji: string;
  progress: number; // 0 to 1080 (3 tours de 360)
  status?: 'running' | 'jumping' | 'fallen';
  momentum?: 'normal' | 'boosted' | 'fatigued';
  momentumTimerTicks?: number;
  isTocard?: boolean;
  fallenTimerMs?: number;
  lastObstaclePassed?: number;
}

export interface PlayerDerbyResult {
  playerId: string;
  playerName: string;
  horseId: number;
  betAmount: number;
  won: boolean;
  netGain: number; // strictly integer (betAmount * 3 if won, -betAmount if lost)
  sipsToDrink: number; // strictly integer (betAmount * sipMultiplier if lost)
  newBalance: number;
  isBankrupt: boolean;
}

export interface DerbyRoundResult {
  winningHorseId: number;
  winningHorse: DerbyHorse;
  horses: DerbyHorse[];
  results: PlayerDerbyResult[];
}

export interface SipDistribution {
  fromPlayerId: string;
  fromPlayerName: string;
  toPlayerId: string;
  toPlayerName: string;
  amount: number;
}

export interface Room {
  id: string;
  state: RoomState;
  players: Player[];
  leaderId?: string; // Socket ID of the group leader (first player joined)
  currentRound: number; // default: 1
  settings?: RoomSettings;
  currentVoteOptions?: GameChoice[]; // 2 jeux sélectionnés aléatoirement pour le vote
  votes?: Record<string, GameChoice>;
  bets?: Record<string, RouletteBet>;
  currentResult?: RouletteRoundResult;
  crashRound?: number; // 1, 2, or 3
  crashMultiplier?: number; // live climbing multiplier
  crashPoint?: number; // point where rocket explodes
  crashBets?: Record<string, CrashBet>;
  currentCrashResult?: CrashRoundResult;
  // Blackjack:
  dealerHand?: Card[];
  blackjackBets?: Record<string, number>;
  currentBlackjackResult?: BlackjackRoundResult;
  deck?: Card[];
  // Les Mines (Grille commune 6x6):
  minesGrid?: number[]; // indices des 7 bombes (0 à 35)
  revealedCells?: number[]; // indices des cases cliquées
  currentTurnPlayerId?: string; // ID du joueur dont c'est le tour
  minesBets?: Record<string, number>;
  currentMinesResult?: MinesRoundResult;
  // Le Derby (Course de chevaux):
  derbyHorses?: DerbyHorse[];
  winningHorseId?: number | null;
  derbyBets?: Record<string, { horseId: number; amount: number }>;
  currentDerbyResult?: DerbyRoundResult;
  distributions?: SipDistribution[];
}

export interface JoinRoomPayload {
  roomId: string;
  name: string;
}

export interface JoinRoomResponse {
  success: boolean;
  room?: Room;
  player?: Player;
  error?: string;
}

export interface CreateRoomResponse {
  room: Room;
}

export interface SubmitVotePayload {
  roomId: string;
  vote: GameChoice;
}

export interface SubmitBetPayload {
  roomId: string;
  amount: number;
  color: RouletteColor;
}

export interface SubmitCrashBetPayload {
  roomId: string;
  amount: number;
}

export interface CashOutPayload {
  roomId: string;
}

export interface NextCrashRoundPayload {
  roomId: string;
}

export interface SubmitBlackjackBetPayload {
  roomId: string;
  amount: number;
}

export interface BlackjackActionPayload {
  roomId: string;
}

export interface SubmitMinesBetPayload {
  roomId: string;
  amount: number;
}

export interface MinesRevealCellPayload {
  roomId: string;
  cellIndex: number;
}

export interface MinesCashOutPayload {
  roomId: string;
}

export interface SubmitDerbyBetPayload {
  roomId: string;
  horseId: number;
  amount: number;
}

export interface SendSipsPayload {
  roomId: string;
  toPlayerId: string;
  amount: number;
}

export interface SubmitFinalDistributionPayload {
  roomId: string;
  allocations: Record<string, number>; // toPlayerId -> sips amount
}

export interface ConfirmDrankPayload {
  roomId: string;
}

export interface UpdateSettingsPayload {
  roomId: string;
  settings: Partial<RoomSettings>;
}
