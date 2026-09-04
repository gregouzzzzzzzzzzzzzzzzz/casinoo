import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { AviatorCanvas } from '../components/AviatorCanvas';
import {
  JoinRoomPayload,
  JoinRoomResponse,
  Player,
  Room,
  GameChoice,
  RouletteColor,
  Card,
  SendSipsPayload,
  ConfirmDrankPayload,
  SubmitCrashBetPayload,
  CashOutPayload,
  NextCrashRoundPayload,
  SubmitBlackjackBetPayload,
  BlackjackActionPayload,
  SubmitMinesBetPayload,
  MinesRevealCellPayload,
  MinesCashOutPayload,
  SubmitDerbyBetPayload,
  SubmitFinalDistributionPayload,
  SipDistribution,
  RoomSettings,
  UpdateSettingsPayload,
} from '../types';
import {
  LogIn,
  AlertCircle,
  CheckCircle2,
  Crown,
  Play,
  ArrowRight,
  ChevronRight,
  Minus,
  Plus,
  Beer,
  ShieldCheck,
  Hourglass,
  BarChart3,
  TrendingUp,
  Hand,
  PlusCircle,
  Lock,
  Flame,
  RotateCcw,
  Sliders,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#e5484d', '#ffb629', '#5cc963', '#4d9de0',
  '#a855f7', '#ec4899', '#f97316', '#06b6d4',
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function calculateHandScore(hand?: Card[]): number {
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

// ── Sub-components ───────────────────────────────────────────
const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 32 }) => (
  <div style={{
    width: size, height: size, borderRadius: 6, flexShrink: 0,
    background: avatarColor(name), display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: size * 0.44, fontWeight: 700, color: '#fff',
  }}>
    {name.charAt(0).toUpperCase()}
  </div>
);

interface PlayingCardProps {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  hidden?: boolean;
}

const PlayingCard: React.FC<PlayingCardProps> = ({ card, size = 'md', hidden = false }) => {
  if (hidden) {
    return (
      <div className={`playing-card card-back ${size === 'lg' ? 'playing-card-lg' : size === 'sm' ? 'playing-card-sm' : ''}`} />
    );
  }

  const isRed = card.suit === '♥' || card.suit === '♦';
  const colorClass = isRed ? 'playing-card-red' : 'playing-card-black';
  const sizeClass = size === 'lg' ? 'playing-card-lg' : size === 'sm' ? 'playing-card-sm' : '';

  return (
    <div className={`playing-card ${colorClass} ${sizeClass}`}>
      <div style={{ fontSize: size === 'lg' ? 16 : size === 'sm' ? 10 : 12, lineHeight: 1 }}>{card.value}</div>
      <div style={{ fontSize: size === 'lg' ? 24 : size === 'sm' ? 14 : 18, textAlign: 'center', lineHeight: 1 }}>{card.suit}</div>
      <div style={{ fontSize: size === 'lg' ? 16 : size === 'sm' ? 10 : 12, textAlign: 'right', lineHeight: 1 }}>{card.value}</div>
    </div>
  );
};

// ── PhoneScreen ──────────────────────────────────────────────
export const PhoneScreen: React.FC = () => {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joinedPlayer, setJoinedPlayer] = useState<Player | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showIntro, setShowIntro] = useState(false);

  // Voting
  const [myVote, setMyVote] = useState<GameChoice | null>(null);

  // Roulette Betting
  const [betAmount, setBetAmount] = useState<number>(5);
  const [betColor, setBetColor] = useState<RouletteColor>('red');
  const [hasBet, setHasBet] = useState(false);

  // Crash/Bourse Betting & Live Trading
  const [crashBetAmount, setCrashBetAmount] = useState<number>(5);
  const [hasCrashBet, setHasCrashBet] = useState(false);
  const [liveCrashMultiplier, setLiveCrashMultiplier] = useState<number>(1.00);
  const [, setCrashTrend] = useState<'up' | 'down' | 'same'>('same');

  // Blackjack Betting
  const [blackjackBetAmount, setBlackjackBetAmount] = useState<number>(5);
  const [hasBlackjackBet, setHasBlackjackBet] = useState(false);

  // Mines Betting
  const [minesBetAmount, setMinesBetAmount] = useState<number>(5);
  const [hasMinesBet, setHasMinesBet] = useState(false);

  // Derby Betting
  const [derbyHorseId, setDerbyHorseId] = useState<number>(1);
  const [derbyBetAmount, setDerbyBetAmount] = useState<number>(5);
  const [hasDerbyBet, setHasDerbyBet] = useState(false);

  // Distribution
  const [targetPlayerId, setTargetPlayerId] = useState<string>('');
  const [sipsAmount, setSipsAmount] = useState<number>(0);
  const [hasSentSips, setHasSentSips] = useState(false);
  const [sentSipsInfo, setSentSipsInfo] = useState<{ toName: string; amount: number } | null>(null);

  // Final Distribution allocations
  const [finalAllocations, setFinalAllocations] = useState<Record<string, number>>({});

  useEffect(() => {
    socket.on('room_joined', (response: JoinRoomResponse) => {
      setIsLoading(false);
      if (response.success && response.player && response.room) {
        setJoinedPlayer(response.player);
        setCurrentRoom(response.room);
        setError(null);
      } else {
        setError(response.error ?? 'Impossible de rejoindre la room.');
      }
    });

    const handleCrashUpdate = ({ multiplier, trend }: { multiplier: number; trend?: 'up' | 'down' | 'same' }) => {
      setLiveCrashMultiplier(multiplier);
      if (trend) setCrashTrend(trend);
    };

    socket.on('crash_update', handleCrashUpdate);

    socket.on('room_destroyed', () => {
      setCurrentRoom(null);
      setJoinedPlayer(null);
      alert("L'hôte a quitté la partie.");
    });

    socket.on('room_updated', ({ room }: { room: Room }) => {
      setCurrentRoom(room);
      if (socket.id) {
        const me = room.players.find(p => p.id === socket.id);
        if (me) setJoinedPlayer(me);
      }
      if (room.state === 'voting') {
        if (!room.votes || !socket.id || room.votes[socket.id] === undefined) setMyVote(null);
        setHasBet(false);
        setHasCrashBet(false);
        setHasBlackjackBet(false);
        setHasMinesBet(false);
        setHasDerbyBet(false);
        setHasSentSips(false);
        setSentSipsInfo(null);
      }
      if (room.state === 'playing_roulette') {
        if (!room.bets || !socket.id || room.bets[socket.id] === undefined) setHasBet(false);
        else setHasBet(true);
        setHasSentSips(false);
      }
      if (room.state === 'playing_crash') {
        if (!room.crashBets || !socket.id || room.crashBets[socket.id] === undefined) setHasCrashBet(false);
        else setHasCrashBet(true);
        setHasSentSips(false);
        setLiveCrashMultiplier(1.00);
        setCrashTrend('same');
      }
      if (room.state === 'playing_blackjack') {
        if (!room.blackjackBets || !socket.id || room.blackjackBets[socket.id] === undefined) setHasBlackjackBet(false);
        else setHasBlackjackBet(true);
        setHasSentSips(false);
      }
      if (room.state === 'playing_mines') {
        if (!room.minesBets || !socket.id || room.minesBets[socket.id] === undefined) setHasMinesBet(false);
        else setHasMinesBet(true);
        setHasSentSips(false);
      }
      if (room.state === 'playing_derby') {
        if (!room.derbyBets || !socket.id || room.derbyBets[socket.id] === undefined) setHasDerbyBet(false);
        else setHasDerbyBet(true);
        setHasSentSips(false);
      }
      if (room.state === 'distribution') {
        const others = room.players.filter(p => p.id !== socket.id);
        if (others.length > 0) setTargetPlayerId(prev => prev || others[0].id);
      }
      if (room.state === 'final_distribution') {
        // Init final allocations to 0 for all other players
        const others = room.players.filter(p => p.id !== socket.id);
        setFinalAllocations(prev => {
          const updated = { ...prev };
          others.forEach(p => {
            if (updated[p.id] === undefined) updated[p.id] = 0;
          });
          return updated;
        });
      }
    });

    socket.on('bet_confirmed', () => { setHasBet(true); setError(null); });
    socket.on('crash_bet_confirmed', () => { setHasCrashBet(true); setError(null); });
    socket.on('blackjack_bet_confirmed', () => { setHasBlackjackBet(true); setError(null); });
    socket.on('mines_bet_confirmed', () => { setHasMinesBet(true); setError(null); });
    socket.on('derby_bet_confirmed', () => { setHasDerbyBet(true); setError(null); });
    socket.on('cashed_out', () => { setError(null); });
    socket.on('bet_error', ({ message }: { message: string }) => setError(message));
    socket.on('error_message', ({ message }: { message: string }) => setError(message));
    socket.on('sips_confirmed', ({ distribution }: { distribution?: SipDistribution }) => {
      setHasSentSips(true);
      if (distribution) setSentSipsInfo({ toName: distribution.toPlayerName, amount: distribution.amount });
      setError(null);
    });
    socket.on('final_distribution_confirmed', () => { setError(null); });

    return () => {
      socket.off('room_joined');
      socket.off('crash_update', handleCrashUpdate);
      socket.off('room_destroyed');
      socket.off('room_updated');
      socket.off('bet_confirmed');
      socket.off('crash_bet_confirmed');
      socket.off('blackjack_bet_confirmed');
      socket.off('mines_bet_confirmed');
      socket.off('derby_bet_confirmed');
      socket.off('cashed_out');
      socket.off('bet_error');
      socket.off('error_message');
      socket.off('sips_confirmed');
      socket.off('final_distribution_confirmed');
    };
  }, []);

  useEffect(() => {
    if (!joinedPlayer) return;
    const maxAllowed = Math.min(joinedPlayer.balance, Math.max(5, Math.floor(joinedPlayer.balance * 0.3)));
    setBetAmount(prev => Math.min(prev, Math.max(1, maxAllowed)));
    setCrashBetAmount(prev => Math.min(prev, Math.max(1, maxAllowed)));
    setBlackjackBetAmount(prev => Math.min(prev, Math.max(1, maxAllowed)));
    setMinesBetAmount(prev => Math.min(prev, Math.max(1, maxAllowed)));
    setDerbyBetAmount(prev => Math.min(prev, Math.max(1, maxAllowed)));
    const maxSips = Math.floor(joinedPlayer.balance * 0.2);
    setSipsAmount(prev => Math.min(prev, Math.max(0, maxSips)));
  }, [joinedPlayer?.balance]);

  // Actions
  const handleLeave = () => {
    socket.disconnect();
    setCurrentRoom(null);
    setJoinedPlayer(null);
    socket.connect();
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Veuillez entrer un pseudo.');
    if (!roomId.trim()) return setError('Veuillez entrer un code de salle.');
    setError(null);
    setIsLoading(true);
    socket.emit('join_room', { roomId: roomId.trim().toUpperCase(), name: name.trim() } as JoinRoomPayload);
  };

  const handleVote = (vote: GameChoice) => {
    if (!currentRoom) return;
    setMyVote(vote);
    socket.emit('submit_vote', { roomId: currentRoom.id, vote });
  };

  const handleRouletteBetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoom || !joinedPlayer) return;
    socket.emit('submit_bet', { roomId: currentRoom.id, amount: betAmount, color: betColor });
  };

  const handleCrashBetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoom || !joinedPlayer) return;
    socket.emit('submit_crash_bet', { roomId: currentRoom.id, amount: crashBetAmount } as SubmitCrashBetPayload);
  };

  const handleBlackjackBetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoom || !joinedPlayer) return;
    socket.emit('submit_blackjack_bet', { roomId: currentRoom.id, amount: blackjackBetAmount } as SubmitBlackjackBetPayload);
  };

  const handleMinesBetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoom || !joinedPlayer) return;
    socket.emit('submit_mines_bet', { roomId: currentRoom.id, amount: minesBetAmount } as SubmitMinesBetPayload);
  };

  const handleDerbyBetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoom || !joinedPlayer) return;
    socket.emit('submit_derby_bet', { roomId: currentRoom.id, horseId: derbyHorseId, amount: derbyBetAmount } as SubmitDerbyBetPayload);
  };

  const handleMinesRevealCell = (cellIndex: number) => {
    if (!currentRoom) return;
    socket.emit('mines_reveal_cell', { roomId: currentRoom.id, cellIndex } as MinesRevealCellPayload);
  };

  const handleMinesCashOut = () => {
    if (!currentRoom) return;
    socket.emit('mines_cash_out', { roomId: currentRoom.id } as MinesCashOutPayload);
  };

  const handleBlackjackHit = () => {
    if (!currentRoom) return;
    socket.emit('blackjack_hit', { roomId: currentRoom.id } as BlackjackActionPayload);
  };

  const handleBlackjackStand = () => {
    if (!currentRoom) return;
    socket.emit('blackjack_stand', { roomId: currentRoom.id } as BlackjackActionPayload);
  };

  const handleCashOut = () => {
    if (!currentRoom) return;
    socket.emit('cash_out', { roomId: currentRoom.id } as CashOutPayload);
  };

  const handleSendSips = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoom || !joinedPlayer || !targetPlayerId) return;
    socket.emit('send_sips', { roomId: currentRoom.id, toPlayerId: targetPlayerId, amount: sipsAmount } as SendSipsPayload);
  };

  const handleFinalAllocationChange = (toPlayerId: string, sips: number) => {
    setFinalAllocations(prev => ({
      ...prev,
      [toPlayerId]: Math.max(0, sips),
    }));
  };

  const handleFinalDistributionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoom) return;
    socket.emit('submit_final_distribution', {
      roomId: currentRoom.id,
      allocations: finalAllocations,
    } as SubmitFinalDistributionPayload);
  };

  const handleConfirmDrank = () => {
    if (!currentRoom) return;
    socket.emit('confirm_drank', { roomId: currentRoom.id } as ConfirmDrankPayload);
  };

  // Leader controls
  const handleLeaderStartGame = () => currentRoom && socket.emit('start_game', { roomId: currentRoom.id });
  const handleLeaderStartDistribution = () => currentRoom && socket.emit('start_distribution', { roomId: currentRoom.id });
  const handleLeaderNextCrashRound = () => currentRoom && socket.emit('next_crash_round', { roomId: currentRoom.id } as NextCrashRoundPayload);
  const handleLeaderStartDrinkingPhase = () => currentRoom && socket.emit('start_drinking_phase', { roomId: currentRoom.id });
  const handleLeaderEndTurn = () => currentRoom && socket.emit('end_turn', { roomId: currentRoom.id });
  const handleLeaderStartFinalTax = () => currentRoom && socket.emit('start_final_tax', { roomId: currentRoom.id });
  const handleLeaderStartFinalDistribution = () => currentRoom && socket.emit('start_final_distribution', { roomId: currentRoom.id });
  const handleLeaderResetToLobby = () => currentRoom && socket.emit('reset_to_lobby', { roomId: currentRoom.id });

  const handleUpdateSettings = (partial: Partial<RoomSettings>) => {
    if (!currentRoom) return;
    // Only send the changed fields: the server merges them with the current
    // settings, which avoids racing stale client state on rapid clicks.
    socket.emit('update_settings', { roomId: currentRoom.id, settings: partial } as UpdateSettingsPayload);
  };

  // Computed
  const isLeader = Boolean(currentRoom?.leaderId && joinedPlayer?.id === currentRoom.leaderId);
  const minRoundsRequired = currentRoom?.settings?.minRounds ?? 3;
  const canEndGame = (currentRoom?.currentRound ?? 1) >= minRoundsRequired;

  const maxBet = joinedPlayer
    ? Math.min(joinedPlayer.balance, Math.max(5, Math.floor(joinedPlayer.balance * 0.3)))
    : 5;
  const maxSips = joinedPlayer ? Math.floor(joinedPlayer.balance * 0.2) : 0;

  const otherPlayers = currentRoom?.players.filter(p => p.id !== socket.id) ?? [];

  // Drinking phase stats
  const drankPlayersCount = currentRoom?.players.filter(p => p.hasDrank).length ?? 0;
  const totalPlayersCount = currentRoom?.players.length ?? 0;
  const allPlayersDrank = totalPlayersCount > 0 && drankPlayersCount === totalPlayersCount;

  // Final distribution tally (now handled locally in the UI block)

  // Crash calculation
  const myCrashBet = joinedPlayer?.currentCrashBet || (currentRoom?.crashBets && socket.id ? currentRoom.crashBets[socket.id]?.amount : 0) || 0;
  const currentMultiplier = currentRoom?.crashMultiplier || liveCrashMultiplier || 1.00;
  const currentPotentialReturn = Math.round(myCrashBet * currentMultiplier);

  // Blackjack player score
  const myScore = calculateHandScore(joinedPlayer?.hand);
  const isBusted = joinedPlayer?.blackjackStatus === 'busted' || myScore > 21;
  const isStood = joinedPlayer?.blackjackStatus === 'stood';
  const isPlaying = joinedPlayer?.blackjackStatus === 'playing' && !isBusted && !isStood;

  // Mines turn detection
  const isMyTurnInMines = Boolean(
    currentRoom?.state === 'mines_playing' &&
    currentRoom.currentTurnPlayerId === socket.id &&
    joinedPlayer?.minesStatus === 'playing'
  );
  const currentTurnPlayer = currentRoom?.players.find(p => p.id === currentRoom.currentTurnPlayerId);

  const clampBet = (v: number) => Math.max(1, Math.min(maxBet, v));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>

      {/* ── STICKY HEADER ── */}
      {joinedPlayer && (
        <header style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-default)',
          padding: '0 16px',
          height: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          position: 'sticky', top: 0, zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              background: 'var(--yellow)', boxShadow: '0 2px 0 var(--orange-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 13 }}>🎲</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Avatar name={joinedPlayer.name} size={24} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>{joinedPlayer.name}</span>
              {isLeader && <Crown size={12} color="var(--gold)" />}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {joinedPlayer.balance}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>💰</span>
            {currentRoom?.id && (
              <>
                <div style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>
                  {currentRoom.id}
                </span>
                <button
                  onClick={handleLeave}
                  style={{
                    marginLeft: 4,
                    padding: '4px 8px',
                    borderRadius: 4,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--text-secondary)',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Quitter
                </button>
              </>
            )}
          </div>
        </header>
      )}

      {/* ── SCROLLABLE CONTENT ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── LEADER VIP CONTROLS ── */}
        {isLeader && currentRoom && (currentRoom.state === 'lobby' || currentRoom.state === 'roulette_result' || currentRoom.state === 'crash_result' || currentRoom.state === 'blackjack_result' || currentRoom.state === 'mines_result' || currentRoom.state === 'derby_result' || currentRoom.state === 'distribution' || currentRoom.state === 'drinking_phase' || currentRoom.state === 'final_tax' || currentRoom.state === 'final_drinking') && (
          <div className="animate-in" style={{
            background: 'var(--gold-subtle)',
            border: '1px solid rgba(255,182,41,0.25)',
            borderRadius: 'var(--r-lg)',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crown size={14} color="var(--gold)" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                Contrôles Chef de Table
              </span>
            </div>

            {currentRoom.state === 'lobby' && (
              <button
                onClick={handleLeaderStartGame}
                disabled={currentRoom.players.length === 0}
                className="btn btn-primary btn-full"
                style={{ fontSize: 14, padding: '11px 16px' }}
              >
                <Play size={15} fill="var(--bg-base)" />
                Lancer la partie · {currentRoom.players.length} joueur{currentRoom.players.length > 1 ? 's' : ''}
              </button>
            )}

            {currentRoom.state === 'roulette_result' && (
              <button onClick={handleLeaderStartDistribution} className="btn btn-primary btn-full" style={{ fontSize: 14, padding: '11px 16px' }}>
                Passer à la distribution 🍻
                <ChevronRight size={15} />
              </button>
            )}

            {currentRoom.state === 'crash_result' && (
              currentRoom.crashRound && currentRoom.crashRound < 3 ? (
                <button onClick={handleLeaderNextCrashRound} className="btn btn-primary btn-full" style={{ fontSize: 14, padding: '11px 16px' }}>
                  <TrendingUp size={15} />
                  Session suivante ({currentRoom.crashRound + 1}/3) 📈
                  <ChevronRight size={15} />
                </button>
              ) : (
                <button onClick={handleLeaderStartDistribution} className="btn btn-primary btn-full" style={{ fontSize: 14, padding: '11px 16px' }}>
                  Passer à la distribution 🍻
                  <ChevronRight size={15} />
                </button>
              )
            )}

            {currentRoom.state === 'blackjack_result' && (
              <button onClick={handleLeaderStartDistribution} className="btn btn-primary btn-full" style={{ fontSize: 14, padding: '11px 16px' }}>
                Passer à la distribution 🍻
                <ChevronRight size={15} />
              </button>
            )}

            {currentRoom.state === 'mines_result' && (
              <button onClick={handleLeaderStartDistribution} className="btn btn-primary btn-full" style={{ fontSize: 14, padding: '11px 16px' }}>
                Passer à la distribution 🍻
                <ChevronRight size={15} />
              </button>
            )}

            {currentRoom.state === 'derby_result' && (
              <button onClick={handleLeaderStartDistribution} className="btn btn-primary btn-full" style={{ fontSize: 14, padding: '11px 16px' }}>
                Passer à la distribution 🍻
                <ChevronRight size={15} />
              </button>
            )}

            {currentRoom.state === 'distribution' && (
              <button onClick={handleLeaderStartDrinkingPhase} className="btn btn-primary btn-full" style={{ fontSize: 14, padding: '11px 16px' }}>
                <BarChart3 size={15} />
                Voir le Bilan (L'Addition !)
                <ChevronRight size={15} />
              </button>
            )}

            {currentRoom.state === 'drinking_phase' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={handleLeaderEndTurn}
                  disabled={!allPlayersDrank}
                  className="btn btn-primary btn-full"
                  style={{ fontSize: 14, padding: '11px 16px' }}
                >
                  {allPlayersDrank ? (
                    <>
                      <span>Manche suivante ({currentRoom.currentRound + 1})</span>
                      <ArrowRight size={15} />
                    </>
                  ) : (
                    <>
                      <Hourglass size={15} />
                      <span>En attente des buveurs ({drankPlayersCount}/{totalPlayersCount})</span>
                    </>
                  )}
                </button>

                {canEndGame && (
                  <button
                    onClick={handleLeaderStartFinalTax}
                    className="btn btn-red btn-full"
                    style={{ fontSize: 13, padding: '9px 14px' }}
                  >
                    <Flame size={14} />
                    <span>🛑 Terminer la partie (Le Grand Final)</span>
                  </button>
                )}
              </div>
            )}

            {currentRoom.state === 'final_tax' && (
              <button onClick={handleLeaderStartFinalDistribution} className="btn btn-primary btn-full" style={{ fontSize: 14, padding: '11px 16px' }}>
                Passer à la distribution finale 🍻
                <ChevronRight size={15} />
              </button>
            )}

            {currentRoom.state === 'final_drinking' && (
              <button
                onClick={handleLeaderResetToLobby}
                disabled={!allPlayersDrank}
                className="btn btn-primary btn-full"
                style={{ fontSize: 14, padding: '12px 16px' }}
              >
                <RotateCcw size={16} />
                <span>Retour au Lobby (Nouvelle Partie)</span>
              </button>
            )}
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div style={{
            background: 'var(--red-subtle)',
            border: '1px solid rgba(229,72,77,0.3)',
            borderRadius: 'var(--r-md)',
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
          }}>
            <AlertCircle size={15} color="var(--red)" style={{ flexShrink: 0 }} />
            <span style={{ color: '#f2696d' }}>{error}</span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* JOIN FORM                                               */}
        {/* ═══════════════════════════════════════════════════════ */}
        {!joinedPlayer && (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: 'var(--yellow)', boxShadow: '0 4px 0 var(--orange-deep)',
                display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 26, marginBottom: 14,
              }}>
                🎲
              </div>
              <h1 style={{ fontSize: 26, color: 'var(--text-primary)' }}>
                Casino <span className="bubble">à&nbsp;Boire</span>
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                Un écran, vos téléphones, zéro excuse. 🍻
              </p>
            </div>

            <div className="card" style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label className="field-label" htmlFor="pseudo">Pseudo</label>
                <input
                  id="pseudo"
                  type="text"
                  className="input"
                  placeholder="Greg, Sarah, Max..."
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={20}
                  required
                  autoFocus
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="roomCode">Code de la table</label>
                <input
                  id="roomCode"
                  type="text"
                  className="input input-code"
                  placeholder="ABCD"
                  value={roomId}
                  onChange={e => setRoomId(e.target.value.toUpperCase())}
                  maxLength={6}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !name.trim() || !roomId.trim()}
                className="btn btn-primary btn-full btn-lg"
              >
                <LogIn size={16} />
                {isLoading ? 'Connexion...' : 'Rejoindre la table'}
              </button>
            </div>

            <div className="marquee-band" aria-hidden="true" style={{ margin: '18px -16px 0' }}>
              <div className="marquee-track">
                <span>SANTÉ ✦ TCHIN ✦ CHEERS ✦ SALUD ✦ PROST ✦ SKÅL ✦ KANPAI ✦ SLÁINTE ✦ </span><span>SANTÉ ✦ TCHIN ✦ CHEERS ✦ SALUD ✦ PROST ✦ SKÅL ✦ KANPAI ✦ SLÁINTE ✦ </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIntro(true)}
              className="btn btn-secondary btn-full"
              style={{ marginTop: 14 }}
            >
              ▶︎ Comment jouer ?
            </button>

            <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', marginTop: 14 }}>
              Un jeu <span style={{ fontFamily: 'var(--font-display)', color: 'rgba(255,182,41,0.55)' }}>SIP SIP STUDIO</span> · À consommer avec modération
            </p>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LOBBY WAITING & SETTINGS                                */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && (!currentRoom || currentRoom.state === 'lobby') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card animate-in" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={joinedPlayer.name} size={36} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{joinedPlayer.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Table · <strong style={{ color: 'var(--text-primary)' }}>{currentRoom?.id}</strong>
                    </div>
                  </div>
                </div>
                {isLeader ? (
                  <span className="badge badge-gold" style={{ fontSize: 11, padding: '4px 8px' }}>
                    <Crown size={12} /> Chef de Table
                  </span>
                ) : (
                  <span className="badge badge-surface" style={{ fontSize: 11, padding: '4px 8px' }}>
                    Joueur
                  </span>
                )}
              </div>
            </div>

            {/* LEADER CONFIGURATION PANEL */}
            {isLeader && currentRoom && (() => {
              const s = currentRoom.settings || {
                startingBalance: 20,
                minRounds: 3,
                maxRounds: 10,
                maxPlayers: 8,
                minesBombCount: 7,
                sipMultiplier: 1,
                enabledGames: ['mines', 'blackjack', 'crash', 'roulette'] as GameChoice[],
              };

              const toggleGame = (game: GameChoice) => {
                const currentList = s.enabledGames || ['mines', 'blackjack', 'crash', 'roulette'];
                let nextList: GameChoice[];
                if (currentList.includes(game)) {
                  if (currentList.length === 1) return; // keep at least 1 game
                  nextList = currentList.filter(g => g !== game);
                } else {
                  nextList = [...currentList, game];
                }
                handleUpdateSettings({ enabledGames: nextList });
              };

              return (
                <div className="card animate-in" style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sliders size={18} color="var(--gold)" />
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Configuration de la Table</h2>
                  </div>

                  <div className="divider" />

                  {/* Solde de Départ */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Solde de départ</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Jetons par joueur</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleUpdateSettings({ startingBalance: Math.max(5, s.startingBalance - 5) })}
                        className="btn btn-secondary btn-sm" style={{ padding: '6px 10px' }}
                      >
                        <Minus size={13} />
                      </button>
                      <span style={{ fontSize: 15, fontWeight: 700, minWidth: 42, textAlign: 'center', color: 'var(--green)' }}>
                        {s.startingBalance} 💰
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateSettings({ startingBalance: Math.min(100, s.startingBalance + 5) })}
                        className="btn btn-secondary btn-sm" style={{ padding: '6px 10px' }}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Multiplicateur de Gorgées */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Intensité de l'Alcool</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Multiplicateur de gorgées</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1, 2, 3].map(mult => (
                        <button
                          key={mult}
                          type="button"
                          onClick={() => handleUpdateSettings({ sipMultiplier: mult })}
                          className={`btn btn-sm ${s.sipMultiplier === mult ? 'btn-red' : 'btn-secondary'}`}
                          style={{ padding: '5px 10px', fontSize: 12, fontWeight: 700 }}
                        >
                          ×{mult} 🍺
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bombes aux Mines */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Bombes aux Mines</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Sur la grille 6x6</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleUpdateSettings({ minesBombCount: Math.max(1, s.minesBombCount - 1) })}
                        className="btn btn-secondary btn-sm" style={{ padding: '6px 10px' }}
                      >
                        <Minus size={13} />
                      </button>
                      <span style={{ fontSize: 15, fontWeight: 700, minWidth: 42, textAlign: 'center', color: '#f2696d' }}>
                        {s.minesBombCount} 💣
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateSettings({ minesBombCount: Math.min(15, s.minesBombCount + 1) })}
                        className="btn btn-secondary btn-sm" style={{ padding: '6px 10px' }}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Limite Joueurs & Manches */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'var(--bg-input)', padding: '8px 10px', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Max Joueurs</span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button type="button" onClick={() => handleUpdateSettings({ maxPlayers: Math.max(2, s.maxPlayers - 1) })} className="btn btn-secondary btn-sm" style={{ padding: '4px 6px' }}><Minus size={11} /></button>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{s.maxPlayers}</span>
                        <button type="button" onClick={() => handleUpdateSettings({ maxPlayers: Math.min(16, s.maxPlayers + 1) })} className="btn btn-secondary btn-sm" style={{ padding: '4px 6px' }}><Plus size={11} /></button>
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-input)', padding: '8px 10px', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Max Manches</span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button type="button" onClick={() => handleUpdateSettings({ maxRounds: Math.max(3, s.maxRounds - 1) })} className="btn btn-secondary btn-sm" style={{ padding: '4px 6px' }}><Minus size={11} /></button>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{s.maxRounds} 🏁</span>
                        <button type="button" onClick={() => handleUpdateSettings({ maxRounds: Math.min(30, s.maxRounds + 1) })} className="btn btn-secondary btn-sm" style={{ padding: '4px 6px' }}><Plus size={11} /></button>
                      </div>
                    </div>
                  </div>

                  {/* Jeux Activés */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>JEUX DISPONIBLES</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => toggleGame('mines')}
                        className={`btn btn-sm ${s.enabledGames.includes('mines') ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 12, justifyContent: 'center' }}
                      >
                        💣 Mines
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGame('blackjack')}
                        className={`btn btn-sm ${s.enabledGames.includes('blackjack') ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 12, justifyContent: 'center' }}
                      >
                        ♠ Blackjack
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGame('crash')}
                        className={`btn btn-sm ${s.enabledGames.includes('crash') ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 12, justifyContent: 'center' }}
                      >
                        📈 Krach
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGame('roulette')}
                        className={`btn btn-sm ${s.enabledGames.includes('roulette') ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 12, justifyContent: 'center' }}
                      >
                        🎡 Roulette
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGame('derby')}
                        className={`btn btn-sm ${s.enabledGames.includes('derby') ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 12, justifyContent: 'center' }}
                      >
                        🐎 Derby
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* NON-LEADER VIEW */}
            {!isLeader && (
              <div className="card animate-in" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="dot dot-gold animate-pulse" />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Le Chef configure la table...
                  </span>
                </div>
                <div className="divider" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                  <div style={{ background: 'var(--bg-input)', padding: '6px 8px', borderRadius: 4 }}>
                    Solde : <strong>{currentRoom?.settings?.startingBalance ?? 20} 💰</strong>
                  </div>
                  <div style={{ background: 'var(--bg-input)', padding: '6px 8px', borderRadius: 4 }}>
                    Gorgées : <strong>×{currentRoom?.settings?.sipMultiplier ?? 1} 🍺</strong>
                  </div>
                  <div style={{ background: 'var(--bg-input)', padding: '6px 8px', borderRadius: 4 }}>
                    Bombes : <strong>{currentRoom?.settings?.minesBombCount ?? 7} 💣</strong>
                  </div>
                  <div style={{ background: 'var(--bg-input)', padding: '6px 8px', borderRadius: 4 }}>
                    Max Manches : <strong>{currentRoom?.settings?.maxRounds ?? 10} 🏁</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* VOTING (With optional End Game vote)                    */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'voting' && (
          <div className="card animate-in" style={{ padding: '20px 16px' }}>
            <div className="label-xs" style={{ marginBottom: 6 }}>VOTE · MANCHE {currentRoom.currentRound || 1}</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Faites votre choix</h2>

            {myVote ? (
              <div style={{
                background: 'var(--green-subtle)',
                border: '1px solid rgba(92,201,99,0.25)',
                borderRadius: 'var(--r-md)',
                padding: '16px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center',
              }}>
                <CheckCircle2 size={28} color="var(--green)" />
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)' }}>Vote enregistré</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {myVote === 'mines' && '💣 Les Mines'}
                  {myVote === 'blackjack' && '♠ Le Blackjack'}
                  {myVote === 'crash' && '📈 Le Krach Boursier'}
                  {myVote === 'roulette' && '🎡 La Roulette'}
                  {myVote === 'derby' && '🐎 Le Derby'}
                  {myVote === 'end_game' && '🛑 Terminer la partie'}
                </div>
              </div>
            ) : (() => {
              const voteOptions: GameChoice[] = currentRoom.currentVoteOptions && currentRoom.currentVoteOptions.length > 0
                ? currentRoom.currentVoteOptions
                : (currentRoom.settings?.enabledGames || ['mines', 'blackjack']).slice(0, 2);

              const GAME_DETAILS: Record<string, { emoji: string; name: string; sub: string }> = {
                mines: { emoji: '💣', name: 'Les Mines', sub: 'Grille piégée 6×6' },
                blackjack: { emoji: '♠️', name: 'Le Blackjack', sub: 'Battez le croupier' },
                crash: { emoji: '✈️', name: "L'Avion", sub: 'Sautez avant le crash' },
                roulette: { emoji: '🎡', name: 'La Roulette', sub: 'Rouge, noir ou vert' },
                derby: { emoji: '🐎', name: 'Le Derby', sub: 'Pariez sur un canasson' },
              };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: voteOptions.length > 1 ? '1fr 1fr' : '1fr', gap: 10 }}>
                    {voteOptions.map((gameKey) => {
                      const detail = GAME_DETAILS[gameKey] || { emoji: '🎲', name: gameKey, sub: '' };
                      return (
                        <button
                          key={gameKey}
                          onClick={() => handleVote(gameKey)}
                          className="vote-duel-card"
                        >
                          <span style={{ fontSize: 44, lineHeight: 1 }}>{detail.emoji}</span>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--text-primary)' }}>{detail.name}</span>
                          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{detail.sub}</span>
                        </button>
                      );
                    })}
                    {voteOptions.length === 2 && (
                      <span className="vote-vs-badge" aria-hidden="true">VS</span>
                    )}
                  </div>

                  {canEndGame && (
                    <button
                      onClick={() => handleVote('end_game')}
                      className="btn btn-red btn-full"
                      style={{ marginTop: 2, padding: '12px' }}
                    >
                      🛑 Terminer la partie
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PLAYING ROULETTE                                        */}
        {/* ═══════════════════════════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════ */}
        {/* PLAYING ROULETTE (Mise avec jetons rapides)              */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'playing_roulette' && (
          <div className="card animate-in" style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div className="label-xs" style={{ marginBottom: 4, color: 'var(--gold)' }}>CASINO ROYALE · ROULETTE</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Placez votre mise</h2>
            </div>

            {hasBet ? (
              <div style={{
                background: 'rgba(92, 201, 99, 0.1)',
                border: '1px solid var(--green)',
                borderRadius: 'var(--r-md)',
                padding: '20px 16px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
              }}>
                <CheckCircle2 size={36} color="var(--green)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--green)' }}>Mise validée !</div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {betAmount} 💰 placés sur {betColor === 'red' ? '🔴 ROUGE' : betColor === 'black' ? '⚫ NOIR' : '🟢 ZÉRO'}
                  </div>
                </div>
                <div className="badge badge-surface" style={{ fontSize: 11, marginTop: 4 }}>
                  Regardez l'écran central pour le tirage...
                </div>
              </div>
            ) : (
              <form onSubmit={handleRouletteBetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Montant de la mise avec stepper et jetons rapides */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="label-xs">MONTANT DU JETON (MAX: {maxBet} 💰)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setBetAmount(clampBet(betAmount - 1))} className="btn btn-secondary btn-sm" style={{ padding: '10px 14px' }}>
                      <Minus size={16} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={maxBet}
                      value={betAmount}
                      onChange={e => setBetAmount(clampBet(parseInt(e.target.value) || 1))}
                      className="input"
                      style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, flex: 1 }}
                      required
                    />
                    <button type="button" onClick={() => setBetAmount(clampBet(betAmount + 1))} className="btn btn-secondary btn-sm" style={{ padding: '10px 14px' }}>
                      <Plus size={16} />
                    </button>
                  </div>

                  {/* Jetons rapides */}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    {[1, 5, 10, maxBet].map((val, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setBetAmount(clampBet(val))}
                        className="btn btn-secondary btn-sm"
                        style={{
                          flex: 1,
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '6px 4px',
                          border: betAmount === val ? '1px solid var(--green)' : undefined,
                          color: betAmount === val ? 'var(--green)' : undefined,
                        }}
                      >
                        {val === maxBet ? 'MAX' : `${val} 💰`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Choix de la couleur */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="label-xs">CHOISISSEZ VOTRE COULEUR</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setBetColor('red')}
                      className={`color-btn color-btn-red ${betColor === 'red' ? 'active' : ''}`}
                      style={{ padding: '16px 8px', fontSize: 15, fontWeight: 700 }}
                    >
                      🔴 ROUGE (×2)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBetColor('black')}
                      className={`color-btn color-btn-black ${betColor === 'black' ? 'active' : ''}`}
                      style={{ padding: '16px 8px', fontSize: 15, fontWeight: 700 }}
                    >
                      ⚫ NOIR (×2)
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBetColor('green')}
                    className={`color-btn color-btn-green-roulette ${betColor === 'green' ? 'active' : ''}`}
                    style={{ padding: '12px', fontSize: 14, fontWeight: 700 }}
                  >
                    🟢 LE ZÉRO (×36)
                  </button>
                </div>

                <button type="submit" className="btn btn-primary btn-full btn-lg" style={{ fontSize: 16, fontWeight: 700, padding: 16 }}>
                  Miser {betAmount} 💰 sur {betColor === 'red' ? 'ROUGE' : betColor === 'black' ? 'NOIR' : 'ZÉRO'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ROULETTE SPINNING (Suspense sur Mobile)                 */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'roulette_spinning' && (() => {
          const myBet = joinedPlayer.currentBet || (currentRoom.bets ? currentRoom.bets[socket.id || ''] : null);

          return (
            <div className="card animate-in" style={{
              padding: '32px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20,
              border: '2px solid var(--gold)',
              background: 'radial-gradient(circle, rgba(30,41,59,0.9) 0%, var(--bg-card) 100%)',
            }}>
              <div style={{ fontSize: 54, animation: 'spin 3s linear infinite', display: 'inline-block' }}>
                🎡
              </div>
              <div>
                <div className="label-xs" style={{ color: 'var(--gold)', letterSpacing: '0.15em', marginBottom: 6 }}>
                  TIRAGE EN DIRECT
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Rien ne va plus !
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                  La bille tourne sur le cylindre... Regardez l'écran hôte !
                </p>
              </div>

              {myBet ? (
                <div style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 12,
                  padding: '12px 20px',
                  width: '100%',
                }}>
                  <div className="label-xs" style={{ marginBottom: 4 }}>VOTRE MISE</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {myBet.amount} 💰 sur {myBet.color === 'red' ? '🔴 ROUGE' : myBet.color === 'black' ? '⚫ NOIR' : '🟢 ZÉRO'}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  Vous n'avez pas misé sur ce tour.
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ROULETTE RESULT (Résultat individuel sur Mobile)        */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'roulette_result' && currentRoom.currentResult && (() => {
          const res = currentRoom.currentResult;
          const myRound = res.results.find(r => r.playerId === socket.id);
          const won = myRound?.won ?? false;
          const wc = res.winningColor;
          const wn = res.winningNumber;

          return (
            <div className="card animate-in" style={{
              padding: '24px 18px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              border: `2px solid ${won ? 'var(--green)' : '#ef4444'}`,
              background: won ? 'radial-gradient(circle, rgba(92,201,99,0.12) 0%, var(--bg-card) 100%)' : 'radial-gradient(circle, rgba(239,68,68,0.12) 0%, var(--bg-card) 100%)',
            }}>
              {/* Le numéro tiré */}
              <div style={{
                width: 70, height: 70, borderRadius: '50%',
                background: wc === 'red' ? '#dc2626' : wc === 'black' ? '#18181b' : '#059669',
                border: '3px solid #ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, fontWeight: 700, color: '#ffffff',
                boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
              }}>
                {wn}
              </div>

              <div>
                <div className="label-xs" style={{ marginBottom: 4 }}>NUMÉRO TIRÉ</div>
                <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                  {wc === 'red' ? '🔴 ROUGE' : wc === 'black' ? '⚫ NOIR' : '🟢 ZÉRO'} ({wn})
                </h3>
              </div>

              {/* Message de victoire ou de gorgée */}
              {myRound ? (
                won ? (
                  <div style={{
                    background: 'rgba(92,201,99,0.15)',
                    border: '1px solid var(--green)',
                    borderRadius: 12,
                    padding: '16px',
                    width: '100%',
                  }}>
                    <div style={{ fontSize: 32 }}>🎉</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>
                      VICTOIRE !
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                      +{myRound.netGain} 💰 ajoutés à votre solde !
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: 'rgba(239,68,68,0.15)',
                    border: '1px solid #ef4444',
                    borderRadius: 12,
                    padding: '16px',
                    width: '100%',
                  }}>
                    <div style={{ fontSize: 32 }}>🍺</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>
                      C'EST PERDU !
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                      Vous devez boire {myRound.betAmount} gorgée{myRound.betAmount > 1 ? 's' : ''} !
                    </div>
                  </div>
                )
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Vous n'aviez pas placé de mise sur cette manche.
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PLAYING CRASH                                           */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'playing_crash' && (
          <div className="card animate-in" style={{ padding: '20px 16px' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Embarquez dans l'avion ✈️</h2>
            {hasCrashBet ? (
              <div style={{ background: 'var(--green-subtle)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                <CheckCircle2 size={24} color="var(--green)" style={{ margin: '0 auto 6px' }} />
                <div style={{ fontWeight: 700, color: 'var(--green)' }}>Position enregistrée ({crashBetAmount} 💰)</div>
              </div>
            ) : (
              <form onSubmit={handleCrashBetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <input type="number" min={1} max={maxBet} value={crashBetAmount} onChange={e => setCrashBetAmount(clampBet(parseInt(e.target.value) || 1))} className="input" style={{ textAlign: 'center', fontSize: 18, fontWeight: 700 }} required />
                <button type="submit" className="btn btn-primary btn-full btn-lg">Embarquer avec {crashBetAmount} 💰</button>
              </form>
            )}
          </div>
        )}

        {joinedPlayer && currentRoom?.state === 'crash_flying' && (
          <div className="card animate-in" style={{ padding: '14px 12px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <AviatorCanvas multiplier={liveCrashMultiplier || 1.00} crashed={false} height={190} />
              <div style={{
                position: 'absolute', top: 10, left: 12, pointerEvents: 'none',
                fontFamily: 'var(--font-display)', fontSize: 38, lineHeight: 1,
                color: 'var(--yellow)', textShadow: '0 3px 0 var(--orange-deep)',
              }}>
                {(liveCrashMultiplier || 1.00).toFixed(2)}x
              </div>
            </div>
            {joinedPlayer.cashOutMultiplier ? (
              <div style={{ background: 'var(--green-subtle)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 30 }}>🪂</div>
                <div style={{ fontWeight: 700, color: 'var(--green)' }}>Sauté à {joinedPlayer.cashOutMultiplier.toFixed(2)}x ! 🎉</div>
              </div>
            ) : myCrashBet > 0 ? (
              <button onClick={handleCashOut} className="btn btn-primary btn-full animate-green-pulse" style={{ fontSize: 18, fontWeight: 700, padding: '18px 20px' }}>
                🪂 J'ENCAISSE ! (+{currentPotentialReturn - myCrashBet} 💰)
              </button>
            ) : (
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-dim)' }}>Regardez l'avion sur le grand écran !</div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PLAYING BLACKJACK                                       */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'playing_blackjack' && (
          <div className="card animate-in" style={{ padding: '20px 16px' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Mise Blackjack ♠</h2>
            {hasBlackjackBet ? (
              <div style={{ background: 'var(--green-subtle)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                <CheckCircle2 size={24} color="var(--green)" style={{ margin: '0 auto 6px' }} />
                <div style={{ fontWeight: 700, color: 'var(--green)' }}>Mise enregistrée ({blackjackBetAmount} 💰)</div>
              </div>
            ) : (
              <form onSubmit={handleBlackjackBetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <input type="number" min={1} max={maxBet} value={blackjackBetAmount} onChange={e => setBlackjackBetAmount(clampBet(parseInt(e.target.value) || 1))} className="input" style={{ textAlign: 'center', fontSize: 18, fontWeight: 700 }} required />
                <button type="submit" className="btn btn-primary btn-full btn-lg">Miser {blackjackBetAmount} 💰</button>
              </form>
            )}
          </div>
        )}

        {joinedPlayer && (currentRoom?.state === 'blackjack_playing' || currentRoom?.state === 'blackjack_dealer_turn') && (
          <div className="card animate-in" style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Score : {myScore}</div>
            <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
              {joinedPlayer.hand?.map((c, i) => <PlayingCard key={i} card={c} size="lg" />)}
            </div>
            {currentRoom.state === 'blackjack_playing' && isPlaying && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button onClick={handleBlackjackHit} className="btn btn-primary btn-full btn-lg"><PlusCircle size={20} /> TIRER</button>
                <button onClick={handleBlackjackStand} className="btn btn-secondary btn-full btn-lg"><Hand size={20} /> RESTER</button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PLAYING MINES                                           */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'playing_mines' && (
          <div className="card animate-in" style={{ padding: '20px 16px' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Mise Les Mines 💣</h2>
            {hasMinesBet ? (
              <div style={{ background: 'var(--green-subtle)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                <CheckCircle2 size={24} color="var(--green)" style={{ margin: '0 auto 6px' }} />
                <div style={{ fontWeight: 700, color: 'var(--green)' }}>Mise enregistrée ({minesBetAmount} 💰)</div>
              </div>
            ) : (
              <form onSubmit={handleMinesBetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <input type="number" min={1} max={maxBet} value={minesBetAmount} onChange={e => setMinesBetAmount(clampBet(parseInt(e.target.value) || 1))} className="input" style={{ textAlign: 'center', fontSize: 18, fontWeight: 700 }} required />
                <button type="submit" className="btn btn-primary btn-full btn-lg">Miser {minesBetAmount} 💰</button>
              </form>
            )}
          </div>
        )}

        {joinedPlayer && currentRoom?.state === 'mines_playing' && (
          <div className="card animate-in" style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isMyTurnInMines ? (
              <div style={{ background: 'var(--green-subtle)', border: '2px solid var(--green)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <div className="label-xs" style={{ color: 'var(--green)' }}>C'EST TON TOUR !</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Touche une case non découverte 💎</div>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Hourglass size={18} color="var(--gold)" />
                <div style={{ fontSize: 13 }}>Tour de <strong>{currentTurnPlayer?.name ?? '...'}</strong></div>
              </div>
            )}

            <div className="mines-board"><div className="mines-grid-phone">
              {Array.from({ length: 36 }).map((_, index) => {
                const isRevealed = (currentRoom.revealedCells || []).includes(index);
                const isBomb = isRevealed && Boolean(currentRoom.minesGrid && currentRoom.minesGrid.includes(index));
                const isSafe = isRevealed && !isBomb;
                const isClickable = isMyTurnInMines && !isRevealed;

                return (
                  <button
                    key={index}
                    type="button"
                    disabled={!isClickable}
                    onClick={() => isClickable && handleMinesRevealCell(index)}
                    className={`mines-cell ${isSafe ? 'mines-cell-safe' : isBomb ? 'mines-cell-bomb' : isClickable ? 'mines-cell-interactive' : 'mines-cell-disabled'}`}
                  >
                    {isBomb ? '💣' : isSafe ? '💎' : <span className="mines-cell-dot" />}
                  </button>
                );
              })}
            </div></div>

            {isMyTurnInMines && (joinedPlayer.safeClicks || 0) >= 1 && (
              <button type="button" onClick={handleMinesCashOut} className="btn btn-gold btn-full btn-lg animate-pulse">
                <Lock size={18} /> SÉCURISER SES GAINS (+{joinedPlayer.safeClicks} 💰)
              </button>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PLAYING DERBY (Pari sur les Chevaux)                    */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'playing_derby' && (
          <div className="card animate-in" style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="label-xs" style={{ color: 'var(--gold)' }}>LE DERBY · PARIS HIPPIQUES</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Choisis ton champion 🐎</h2>

            {hasDerbyBet || (joinedPlayer.derbyBet && joinedPlayer.derbyBet.amount > 0) ? (
              <div style={{
                background: 'var(--green-subtle)',
                border: '1px solid rgba(92,201,99,0.25)',
                borderRadius: 'var(--r-md)',
                padding: '20px 16px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center',
              }}>
                <CheckCircle2 size={32} color="var(--green)" />
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--green)' }}>Pari Validé !</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Mise de <strong>{joinedPlayer.derbyBet?.amount || derbyBetAmount} 💰</strong> sur le <strong>{
                    (currentRoom.derbyHorses || [
                      { id: 1, name: 'Éclair Rouge', emoji: '🔴' },
                      { id: 2, name: 'Tornade Bleue', emoji: '🔵' },
                      { id: 3, name: 'Galop Vert', emoji: '🟢' },
                      { id: 4, name: 'Pégase Jaune', emoji: '🟡' },
                    ]).find(h => h.id === (joinedPlayer.derbyBet?.horseId || derbyHorseId))?.name
                  }</strong>.
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  En attente des autres parieurs avant le départ...
                </div>
              </div>
            ) : (
              <form onSubmit={handleDerbyBetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Horse Selection Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { id: 1, name: 'Éclair Rouge', color: '#f2696d', emoji: '🔴' },
                    { id: 2, name: 'Tornade Bleue', color: '#4d9de0', emoji: '🔵' },
                    { id: 3, name: 'Galop Vert', color: '#5cc963', emoji: '🟢' },
                    { id: 4, name: 'Pégase Jaune', color: '#ffb629', emoji: '🟡' },
                  ].map((horse) => {
                    const isSelected = derbyHorseId === horse.id;
                    return (
                      <button
                        key={horse.id}
                        type="button"
                        onClick={() => setDerbyHorseId(horse.id)}
                        className="card"
                        style={{
                          background: isSelected ? `${horse.color}22` : 'var(--bg-input)',
                          border: isSelected ? `2px solid ${horse.color}` : '1px solid var(--border-subtle)',
                          borderRadius: 8,
                          padding: '12px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 4,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ fontSize: 24 }}>{horse.emoji}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: horse.color, textAlign: 'center' }}>
                          {horse.name}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Amount Slider / Input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="field-label" style={{ margin: 0 }}>Montant du pari</label>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>{derbyBetAmount} 💰</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setDerbyBetAmount(prev => clampBet(prev - 1))}
                      className="btn btn-secondary btn-sm" style={{ padding: '8px 12px' }}
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={maxBet}
                      value={derbyBetAmount}
                      onChange={e => setDerbyBetAmount(clampBet(parseInt(e.target.value) || 1))}
                      className="input"
                      style={{ textAlign: 'center', fontSize: 18, fontWeight: 700 }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setDerbyBetAmount(prev => clampBet(prev + 1))}
                      className="btn btn-secondary btn-sm" style={{ padding: '8px 12px' }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-full btn-lg">
                  Parier {derbyBetAmount} 💰 (Cote ×3.00)
                </button>
              </form>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* DERBY RACING (Phone Live Cheering & Laps)               */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'derby_racing' && (() => {
          const myBet = joinedPlayer.derbyBet || (currentRoom.derbyBets ? currentRoom.derbyBets[joinedPlayer.id] : null);
          const chosenHorse = myBet ? (currentRoom.derbyHorses || []).find(h => h.id === myBet.horseId) : null;
          const percent = chosenHorse ? Math.min(100, Math.round((chosenHorse.progress / 360) * 100)) : 0;

          return (
            <div className="card animate-in" style={{
              padding: '28px 18px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              border: chosenHorse ? `2px solid ${chosenHorse.color}` : undefined,
            }}>
              <div style={{ fontSize: 52 }}>🏇</div>

              <div>
                <div className="label-xs" style={{ color: 'var(--gold)', letterSpacing: '0.12em' }}>
                  HIPPODROME EN DIRECT · 1 TOUR UNIQUE (360°)
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginTop: 4 }}>
                  {percent >= 80 ? '⚡ DERNIÈRE LIGNE DROITE !' : percent >= 45 ? 'Mi-course !' : 'La course est lancée ! 🏁'}
                </h2>

                {chosenHorse ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: chosenHorse.color }}>
                      {chosenHorse.emoji} {chosenHorse.name}
                    </div>

                    {chosenHorse.momentum === 'boosted' && (
                      <div style={{
                        background: 'rgba(245, 158, 11, 0.2)',
                        border: '1px solid #f59e0b',
                        borderRadius: 8,
                        padding: '6px 10px',
                        marginTop: 8,
                        color: '#fef3c7',
                        fontWeight: 700,
                        fontSize: 13,
                        animation: 'pulse 1s infinite',
                      }}>
                        🔥 SPRINT BOOSTÉ ! Plein gaz !
                      </div>
                    )}
                    {chosenHorse.momentum === 'fatigued' && (
                      <div style={{
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid #ef4444',
                        borderRadius: 8,
                        padding: '6px 10px',
                        marginTop: 8,
                        color: '#fca5a5',
                        fontWeight: 700,
                        fontSize: 13,
                      }}>
                        💨 Coup de fatigue... Accroche-toi !
                      </div>
                    )}

                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                        <span>Distance parcourue</span>
                        <span style={{ color: chosenHorse.color }}>{percent}% ({Math.round(chosenHorse.progress)}° / 360°)</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${percent}%`,
                          background: chosenHorse.color,
                          transition: 'width 100ms linear',
                        }} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
                    Regardez le grand écran pour suivre l'hippodrome ovale !
                  </p>
                )}
              </div>

              <span className="badge badge-surface" style={{ margin: '0 auto', fontSize: 11 }}>
                Course rapide de 15 secondes max !
              </span>
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* DERBY RESULT (Phone Gain/Loss)                          */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'derby_result' && currentRoom.currentDerbyResult && (() => {
          const myResult = currentRoom.currentDerbyResult.results.find(r => r.playerId === joinedPlayer.id);
          const winner = currentRoom.currentDerbyResult.winningHorse;
          const won = Boolean(myResult?.won);

          return (
            <div className="card animate-in" style={{ padding: '24px 18px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: won ? 'var(--green-subtle)' : 'var(--red-subtle)',
                border: won ? '2px solid var(--green)' : '2px solid #f2696d',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
                fontSize: 28,
              }}>
                {won ? '🏆' : '🍺'}
              </div>

              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: won ? 'var(--green)' : '#f2696d' }}>
                  {won ? 'PARI GAGNÉ ! 🎉' : 'PARI PERDU...'}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Le <strong>{winner.name} ({winner.emoji})</strong> a franchi la ligne en tête !
                </p>
              </div>

              <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 14 }}>
                {won ? (
                  <>
                    <span className="label-xs" style={{ color: 'var(--green)' }}>Gains crédités</span>
                    <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--green)', marginTop: 2 }}>
                      +{myResult?.netGain || 0} 💰
                    </div>
                  </>
                ) : (
                  <>
                    <span className="label-xs" style={{ color: '#f2696d' }}>Pénalité à boire</span>
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#f2696d', marginTop: 2 }}>
                      +{myResult?.sipsToDrink || 0} 🍺
                    </div>
                  </>
                )}
              </div>

              {!isLeader && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  En attente que le Chef de Groupe passe à la suite...
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LE GRAND FINAL : 1. LA TAXE (final_tax)                  */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'final_tax' && (
          <div className="card animate-in" style={{ padding: '24px 18px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="label-xs" style={{ color: '#f2696d' }}>LE GRAND FINAL</div>

            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'var(--red-subtle)', border: '2px solid #f2696d',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
            }}>
              <Flame size={32} color="#f2696d" />
            </div>

            <div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff' }}>
                Taxe Prélevée : <span style={{ color: '#f2696d' }}>{joinedPlayer.taxRate || 0}%</span>
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                Tu dois boire <strong style={{ color: '#f2696d' }}>{joinedPlayer.personalTaxSips || 0} gorgée{(joinedPlayer.personalTaxSips || 0) > 1 ? 's' : ''}</strong> de taxe personnelle !
              </p>
            </div>

            <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 14 }}>
              <span className="label-xs" style={{ color: 'var(--green)' }}>Solde restant à distribuer aux autres</span>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)', marginTop: 2 }}>
                {joinedPlayer.distributableBalance || 0} 💰
              </div>
            </div>

            {!isLeader && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                En attente que le Chef de Groupe lance la distribution finale...
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LE GRAND FINAL : 2. DISTRIBUTION FINALE                 */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'final_distribution' && (() => {
          // Recalculate from room data to be sure we have the latest values
          const me = currentRoom.players.find(p => p.id === socket.id);
          const distributable = me?.distributableBalance ?? 0;
          const others = currentRoom.players.filter(p => p.id !== socket.id);
          const totalAllocated = Object.values(finalAllocations).reduce((s, v) => s + (v || 0), 0);
          const isValid = totalAllocated === distributable;

          return (
            <div className="card animate-in" style={{ padding: '20px 16px' }}>
              <div className="label-xs" style={{ marginBottom: 6, color: 'var(--gold)' }}>DISTRIBUTION FINALE</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Répartis tout ton solde</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Tu dois allouer exactement <strong>{distributable}</strong> 🍺 entre tes adversaires.
              </p>

              {me?.hasSubmittedFinalDistribution ? (
                <div style={{ background: 'var(--green-subtle)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                  <CheckCircle2 size={28} color="var(--green)" style={{ margin: '0 auto 6px' }} />
                  <div style={{ fontWeight: 700, color: 'var(--green)' }}>Distribution validée !</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    En attente des autres joueurs...
                  </div>
                </div>
              ) : others.length === 0 || distributable === 0 ? (
                <button
                  type="button"
                  onClick={handleFinalDistributionSubmit}
                  className="btn btn-primary btn-full btn-lg"
                >
                  Valider (0 gorgée à distribuer)
                </button>
              ) : (
                <form onSubmit={handleFinalDistributionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* ── Player allocation rows ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {others.map(p => {
                      const currentAlloc = finalAllocations[p.id] || 0;
                      const canDecrease = currentAlloc > 0;
                      const canIncrease = totalAllocated < distributable;
                      return (
                        <div
                          key={p.id}
                          className="player-row"
                          style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                          {/* Name */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={p.name} size={28} />
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</span>
                          </div>

                          {/* Stepper */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleFinalAllocationChange(p.id, currentAlloc - 1)}
                              disabled={!canDecrease}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '6px 10px', opacity: canDecrease ? 1 : 0.35 }}
                            >
                              <Minus size={12} />
                            </button>
                            <span style={{
                              minWidth: 32,
                              textAlign: 'center',
                              fontWeight: 700,
                              fontSize: 16,
                              color: currentAlloc > 0 ? 'var(--green)' : 'var(--text-secondary)',
                            }}>
                              {currentAlloc}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleFinalAllocationChange(p.id, currentAlloc + 1)}
                              disabled={!canIncrease}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '6px 10px', opacity: canIncrease ? 1 : 0.35 }}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Running total ── */}
                  <div style={{
                    background: isValid ? 'var(--green-subtle)' : 'var(--bg-input)',
                    border: `1px solid ${isValid ? 'var(--green)' : totalAllocated > distributable ? '#f2696d' : 'var(--border-default)'}`,
                    borderRadius: 6,
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Total alloué</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: isValid ? 'var(--green)' : totalAllocated > distributable ? '#f2696d' : 'var(--text-primary)' }}>
                      {totalAllocated} / {distributable} 🍺
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={!isValid}
                    className="btn btn-primary btn-full btn-lg"
                    style={{ opacity: isValid ? 1 : 0.5 }}
                  >
                    {isValid ? '✅ Valider la distribution finale 🍻' : `Il reste ${distributable - totalAllocated} 🍺 à allouer`}
                  </button>
                </form>
              )}
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LE GRAND FINAL : 3. BILAN ULTIME (final_drinking)       */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'final_drinking' && (
          <div className="card animate-in" style={{ padding: '24px 18px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="label-xs" style={{ color: 'var(--green)' }}>LE GRAND BILAN</div>

            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: joinedPlayer.hasDrank ? 'var(--green-subtle)' : 'var(--red-subtle)',
              border: `2px solid ${joinedPlayer.hasDrank ? 'var(--green)' : 'var(--red)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
            }}>
              {joinedPlayer.hasDrank ? <CheckCircle2 size={32} color="var(--green)" /> : <Beer size={32} color="var(--red)" />}
            </div>

            <div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: joinedPlayer.hasDrank ? 'var(--green)' : '#f2696d' }}>
                {joinedPlayer.hasDrank
                  ? 'Santé ultime ! 🍻'
                  : `Tu dois boire ${joinedPlayer.sipsToDrink} gorgée${joinedPlayer.sipsToDrink > 1 ? 's' : ''} !`}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                {joinedPlayer.hasDrank
                  ? 'Gorgées validées. Merci pour la partie !'
                  : `(Taxe de ${joinedPlayer.personalTaxSips || 0} 🍺 + ${Math.max(0, (joinedPlayer.sipsToDrink || 0) - (joinedPlayer.personalTaxSips || 0))} 🍺 reçues des autres)`}
              </p>
            </div>

            {!joinedPlayer.hasDrank && joinedPlayer.sipsToDrink > 0 && (
              <button onClick={handleConfirmDrank} className="btn btn-primary btn-full btn-lg" style={{ fontSize: 16, padding: '14px 20px' }}>
                <Beer size={20} />
                <span>J'ai tout bu ! 🍻</span>
              </button>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* DISTRIBUTION (Standard)                                 */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'distribution' && (
          <div className="card animate-in" style={{ padding: '20px 16px' }}>
            <div className="label-xs" style={{ marginBottom: 6 }}>DISTRIBUTION DES GORGÉES</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Donnez des gorgées</h2>

            {hasSentSips && sentSipsInfo ? (
              <div style={{ background: 'var(--green-subtle)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                <CheckCircle2 size={24} color="var(--green)" style={{ margin: '0 auto 4px' }} />
                <div style={{ fontWeight: 700, color: 'var(--green)' }}>{sentSipsInfo.amount} 🍺 envoyés à {sentSipsInfo.toName}</div>
              </div>
            ) : otherPlayers.length === 0 || maxSips === 0 ? (
              <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 20 }}>
                {maxSips === 0 ? 'Solde insuffisant pour distribuer.' : 'Aucun autre joueur disponible.'}
              </div>
            ) : (
              <form onSubmit={handleSendSips} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <select value={targetPlayerId} onChange={e => setTargetPlayerId(e.target.value)} className="select" required>
                  {otherPlayers.map(p => <option key={p.id} value={p.id} style={{ background: '#241a0e' }}>{p.name} ({p.balance} 💰)</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button type="button" onClick={() => setSipsAmount(Math.max(0, sipsAmount - 1))} className="btn btn-secondary btn-sm"><Minus size={14} /></button>
                  <input type="number" min={0} max={maxSips} value={sipsAmount} onChange={e => setSipsAmount(Math.max(0, Math.min(maxSips, parseInt(e.target.value) || 0)))} className="input" style={{ textAlign: 'center', fontSize: 18, fontWeight: 700 }} required />
                  <button type="button" onClick={() => setSipsAmount(Math.min(maxSips, sipsAmount + 1))} className="btn btn-secondary btn-sm"><Plus size={14} /></button>
                </div>
                <button type="submit" disabled={!targetPlayerId || sipsAmount <= 0} className="btn btn-primary btn-full btn-lg">
                  Envoyer {sipsAmount} 🍺 à {otherPlayers.find(p => p.id === targetPlayerId)?.name ?? '...'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* DRINKING PHASE (Standard)                               */}
        {/* ═══════════════════════════════════════════════════════ */}
        {joinedPlayer && currentRoom?.state === 'drinking_phase' && (
          <div className="card animate-in" style={{ padding: '24px 18px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="label-xs" style={{ color: 'var(--gold)' }}>BILAN & BOISSONS · MANCHE {currentRoom.currentRound || 1}</div>

            {joinedPlayer.sipsToDrink > 0 ? (
              <>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: joinedPlayer.hasDrank ? 'var(--green-subtle)' : 'var(--red-subtle)',
                  border: `2px solid ${joinedPlayer.hasDrank ? 'var(--green)' : 'var(--red)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
                }}>
                  {joinedPlayer.hasDrank ? <CheckCircle2 size={32} color="var(--green)" /> : <Beer size={32} color="var(--red)" />}
                </div>

                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, color: joinedPlayer.hasDrank ? 'var(--green)' : '#f2696d' }}>
                    {joinedPlayer.hasDrank ? 'Santé ! 🍻' : `Tu dois boire ${joinedPlayer.sipsToDrink} gorgée${joinedPlayer.sipsToDrink > 1 ? 's' : ''} !`}
                  </h2>
                </div>

                {!joinedPlayer.hasDrank && (
                  <button onClick={handleConfirmDrank} className="btn btn-primary btn-full btn-lg" style={{ fontSize: 16, padding: '14px 20px' }}>
                    <Beer size={20} />
                    <span>J'ai fini de boire 🍻</span>
                  </button>
                )}
              </>
            ) : (
              <div style={{ padding: 12 }}>
                <ShieldCheck size={36} color="var(--green)" style={{ margin: '0 auto 8px' }} />
                <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>Tu es sauf ! 🥳</h2>
              </div>
            )}
          </div>
        )}

      </div>

      {showIntro && (
        <div
          onClick={() => setShowIntro(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(16, 12, 8, 0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 12,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <video
              src="/intro.mp4"
              controls
              autoPlay
              playsInline
              style={{ width: '100%', borderRadius: 16, border: '1px solid var(--border-default)' }}
            />
            <button onClick={() => setShowIntro(false)} className="btn btn-secondary" style={{ alignSelf: 'center' }}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
