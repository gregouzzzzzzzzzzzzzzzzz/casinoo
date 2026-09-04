import React from 'react';
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame } from 'remotion';
import {
  titanOne, fredoka, CREAM, CREAM_DIM, YELLOW, ORANGE_DEEP, RED, GREEN,
  usePop, SceneFade, Title, Sub, Bubble, Center, Pill, Background,
} from './shared';

export const GAME_FPS = 30;
export const GAME_DURATION = 360; // 12 s

// ── Gabarit commun : carton titre (0-110) puis règles (110-360) ──
const GameCard: React.FC<{ emoji: string; children: React.ReactNode }> = ({ emoji, children }) => {
  const pop = usePop(6, 9);
  return (
    <SceneFade outStart={96}>
      <Center gap={26}>
        <div style={{
          width: 150, height: 150, borderRadius: 36,
          background: YELLOW, boxShadow: `0 10px 0 ${ORANGE_DEEP}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 86, transform: `scale(${pop}) rotate(${(1 - pop) * -14}deg)`,
        }}>
          {emoji}
        </div>
        <Title delay={12} size={92}>{children}</Title>
      </Center>
    </SceneFade>
  );
};

const Wrap: React.FC<{ emoji: string; title: React.ReactNode; rules: React.ReactNode }> = ({ emoji, title, rules }) => (
  <AbsoluteFill>
    <Background />
    <Sequence from={0} durationInFrames={110}>
      <GameCard emoji={emoji}>{title}</GameCard>
    </Sequence>
    <Sequence from={110} durationInFrames={250}>
      {rules}
    </Sequence>
  </AbsoluteFill>
);

/* ══════════════════ 🎡 LA ROULETTE ══════════════════ */
const RouletteRules: React.FC = () => {
  const spin = useCurrentFrame() * 6;
  const wheel = usePop(6, 12);
  return (
    <SceneFade>
      <Center gap={40}>
        <div style={{
          width: 190, height: 190, borderRadius: '50%',
          border: `10px solid ${YELLOW}`,
          background: `conic-gradient(${GREEN} 0deg 10deg, ${RED} 10deg 30deg, #16100a 30deg 50deg, ${RED} 50deg 70deg, #16100a 70deg 90deg, ${RED} 90deg 110deg, #16100a 110deg 130deg, ${RED} 130deg 150deg, #16100a 150deg 170deg, ${RED} 170deg 190deg, #16100a 190deg 210deg, ${RED} 210deg 230deg, #16100a 230deg 250deg, ${RED} 250deg 270deg, #16100a 270deg 290deg, ${RED} 290deg 310deg, #16100a 310deg 330deg, ${RED} 330deg 350deg, #16100a 350deg 360deg)`,
          transform: `scale(${wheel}) rotate(${spin}deg)`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }} />
        <div style={{ display: 'flex', gap: 24 }}>
          <Pill delay={26} color={RED}>🔴 ROUGE ×2</Pill>
          <Pill delay={36} color={CREAM}>⚫ NOIR ×2</Pill>
          <Pill delay={46} color={GREEN}>🟢 ZÉRO ×36</Pill>
        </div>
        <Sub delay={66} size={36}>
          Misez sur une couleur. <span style={{ color: RED, fontWeight: 600 }}>Perdu&nbsp;? La mise part en gorgées.</span>
        </Sub>
      </Center>
    </SceneFade>
  );
};
export const GameRoulette: React.FC = () => (
  <Wrap emoji="🎡" title={<>La <Bubble>Roulette</Bubble></>} rules={<RouletteRules />} />
);

/* ══════════════════ ✈️ L'AVION ══════════════════ */
const AvionRules: React.FC = () => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [10, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const crashed = frame > 150;
  const boom = spring({ frame: frame - 150, fps: GAME_FPS, config: { damping: 9 } });
  const px = 120 + t * 620;
  const py = 300 - Math.pow(t, 1.8) * 210;
  const mult = (1 + Math.pow(t, 1.8) * 1.84).toFixed(2);
  return (
    <SceneFade>
      <Center gap={30}>
        <div style={{ position: 'relative', width: 900, height: 340 }}>
          <svg width={900} height={340} style={{ position: 'absolute', inset: 0 }}>
            <path
              d={`M 120 300 Q ${120 + t * 400} 300 ${px} ${py}`}
              stroke={crashed ? RED : YELLOW}
              strokeWidth={9}
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <span style={{
            position: 'absolute', left: px - 26, top: py - 34,
            fontSize: 52, transform: 'rotate(-24deg)',
            opacity: crashed ? 0 : 1,
          }}>✈️</span>
          {crashed && (
            <span style={{
              position: 'absolute', left: px - 40, top: py - 46,
              fontSize: 56 + boom * 34, opacity: Math.max(0, 1.3 - boom),
            }}>💥</span>
          )}
          <span style={{
            position: 'absolute', left: 40, top: 8,
            fontFamily: titanOne, fontSize: 84,
            color: crashed ? RED : YELLOW,
            textShadow: `0 6px 0 ${crashed ? '#8c2429' : ORANGE_DEEP}`,
          }}>
            {crashed ? 'CRASH !' : `${mult}x`}
          </span>
        </div>
        <Sub delay={20} size={36}>
          L'avion monte, vos jetons sont multipliés.{' '}
          <span style={{ color: GREEN, fontWeight: 600 }}>Encaissez 🪂 avant le crash</span>
          <span style={{ color: RED, fontWeight: 600 }}> ou buvez votre mise.</span>
        </Sub>
      </Center>
    </SceneFade>
  );
};
export const GameAvion: React.FC = () => (
  <Wrap emoji="✈️" title={<><Bubble>L'Avion</Bubble></>} rules={<AvionRules />} />
);

/* ══════════════════ ♠️ LE BLACKJACK ══════════════════ */
const CardFace: React.FC<{ v: string; s: string; delay: number; red?: boolean }> = ({ v, s, delay, red }) => {
  const pop = usePop(delay, 11);
  return (
    <div style={{
      width: 120, height: 168, borderRadius: 14, background: '#fdf8ee',
      boxShadow: '0 10px 26px rgba(0,0,0,0.45)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: fredoka, fontWeight: 700, fontSize: 46,
      color: red ? '#d33a3f' : '#241a0e',
      transform: `translateY(${(1 - pop) * -60}px) rotate(${(1 - pop) * 14}deg)`,
      opacity: pop,
    }}>
      <span>{v}</span>
      <span style={{ fontSize: 52 }}>{s}</span>
    </div>
  );
};

const BlackjackRules: React.FC = () => (
  <SceneFade>
    <Center gap={40}>
      <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
        <CardFace v="K" s="♠" delay={8} />
        <CardFace v="9" s="♥" delay={18} red />
        <CardFace v="2" s="♣" delay={28} />
        <Pill delay={44} color={GREEN} size={44}>= 21 !</Pill>
      </div>
      <Sub delay={60} size={36}>
        Tirez des cartes pour approcher <span style={{ color: YELLOW, fontWeight: 600 }}>21 sans le dépasser</span>.
      </Sub>
      <Sub delay={84} size={36}>
        Battez le croupier <span style={{ color: RED, fontWeight: 600 }}>ou buvez votre mise.</span>
      </Sub>
    </Center>
  </SceneFade>
);
export const GameBlackjack: React.FC = () => (
  <Wrap emoji="♠️" title={<>Le <Bubble>Blackjack</Bubble></>} rules={<BlackjackRules />} />
);

/* ══════════════════ 💣 LES MINES ══════════════════ */
const MinesRules: React.FC = () => {
  const frame = useCurrentFrame();
  const cells = [
    { r: '💎', d: 26 }, { r: '', d: 0 }, { r: '💎', d: 44 }, { r: '', d: 0 },
    { r: '', d: 0 }, { r: '💎', d: 62 }, { r: '', d: 0 }, { r: '💣', d: 92 },
  ];
  return (
    <SceneFade>
      <Center gap={40}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 96px)', gap: 14 }}>
          {cells.map((c, i) => {
            const revealed = c.d > 0 && frame > c.d;
            const pop = spring({ frame: frame - (6 + i * 3), fps: GAME_FPS, config: { damping: 13 } });
            const isBomb = c.r === '💣';
            return (
              <div key={i} style={{
                width: 96, height: 96, borderRadius: 16,
                background: revealed
                  ? (isBomb ? 'linear-gradient(160deg, #3d100f, #200806)' : 'linear-gradient(160deg, #17381e, #0e2413)')
                  : 'linear-gradient(160deg, rgba(246,235,216,0.12), rgba(246,235,216,0.03) 45%), #241a0e',
                border: `2px solid ${revealed ? (isBomb ? RED : GREEN) : 'rgba(246,235,216,0.18)'}`,
                boxShadow: revealed ? `0 0 22px ${isBomb ? 'rgba(229,72,77,0.5)' : 'rgba(92,201,99,0.4)'}` : '0 4px 0 rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44,
                transform: `scale(${pop})`,
              }}>
                {revealed ? c.r : <span style={{ width: 9, height: 9, background: 'rgba(255,182,41,0.3)', transform: 'rotate(45deg)', borderRadius: 2 }} />}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <Pill delay={116} color={GREEN}>💎 = +1 jeton</Pill>
          <Pill delay={128} color={RED}>💣 = mise en gorgées</Pill>
        </div>
        <Sub delay={146} size={34}>
          Chacun son tour. Sécurisez vos gains <span style={{ color: YELLOW, fontWeight: 600 }}>avant de sauter sur une bombe !</span>
        </Sub>
      </Center>
    </SceneFade>
  );
};
export const GameMines: React.FC = () => (
  <Wrap emoji="💣" title={<>Les <Bubble>Mines</Bubble></>} rules={<MinesRules />} />
);

/* ══════════════════ 🐎 LE DERBY ══════════════════ */
const DerbyRules: React.FC = () => {
  const frame = useCurrentFrame();
  const horses = [
    { e: '🔴', speed: 1.0, c: RED },
    { e: '🔵', speed: 1.25, c: '#4d9de0' },
    { e: '🟢', speed: 0.85, c: GREEN },
    { e: '🟡', speed: 1.1, c: YELLOW },
  ];
  return (
    <SceneFade>
      <Center gap={36}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 860 }}>
          {horses.map((h, i) => {
            const x = Math.min(720, Math.max(0, (frame - 8) * 5.4 * h.speed));
            return (
              <div key={i} style={{
                position: 'relative', height: 62, borderRadius: 999,
                background: 'rgba(246,235,216,0.05)', border: `1px solid rgba(246,235,216,0.12)`,
              }}>
                <span style={{ position: 'absolute', left: 18 + x, top: 4, fontSize: 44 }}>🏇</span>
                <span style={{ position: 'absolute', left: 12 + x, top: 16, fontSize: 20 }}>{h.e}</span>
                <span style={{ position: 'absolute', right: 20, top: 12, fontSize: 30 }}>🏁</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <Pill delay={110} color={YELLOW}>GAGNANT ×3</Pill>
          <Sub delay={126} size={34}>
            Pariez sur un canasson. <span style={{ color: RED, fontWeight: 600 }}>S'il perd, vous buvez.</span>
          </Sub>
        </div>
      </Center>
    </SceneFade>
  );
};
export const GameDerby: React.FC = () => (
  <Wrap emoji="🐎" title={<>Le <Bubble>Derby</Bubble></>} rules={<DerbyRules />} />
);
