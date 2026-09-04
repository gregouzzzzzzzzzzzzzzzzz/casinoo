import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
} from 'remotion';
import {
  titanOne, CREAM, CREAM_DIM, YELLOW, ORANGE_DEEP, RED, GREEN,
  usePop, SceneFade, Title, Sub, Bubble, Center, Emoji, Background,
} from './shared';

export const INTRO_FPS = 30;
export const INTRO_DURATION = 1080; // 36 s

// ── S1 · Logo (0-130) ───────────────────────────────────────────
const SceneLogo: React.FC = () => {
  const dice = usePop(4, 9);
  return (
    <SceneFade outStart={116}>
      <Center gap={26}>
        <div style={{
          width: 130, height: 130, borderRadius: 32,
          background: YELLOW, boxShadow: `0 10px 0 ${ORANGE_DEEP}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 74, transform: `scale(${dice}) rotate(${(1 - dice) * -18}deg)`,
        }}>
          🎲
        </div>
        <Title delay={12} size={96}>Casino <Bubble>à Boire</Bubble></Title>
        <Sub delay={26}>un jeu SIP SIP STUDIO</Sub>
      </Center>
    </SceneFade>
  );
};

// ── S2 · Le dispositif (130-290) ────────────────────────────────
const SceneSetup: React.FC = () => {
  const tv = usePop(8, 14);
  const phoneDelay = [26, 34, 42];
  const frame = useCurrentFrame();
  return (
    <SceneFade outStart={146}>
      <Center gap={34}>
        <Title size={62}>Un écran. <Bubble>Vos téléphones.</Bubble></Title>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 60 }}>
          <div style={{
            width: 420, height: 250, borderRadius: 18,
            border: `6px solid rgba(246,235,216,0.25)`, background: '#191209',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `scale(${tv})`,
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}>
            <span style={{ fontFamily: titanOne, fontSize: 72, color: YELLOW, letterSpacing: '0.18em', textShadow: `0 5px 0 ${ORANGE_DEEP}` }}>ABCD</span>
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            {phoneDelay.map((d, i) => {
              const p = spring({ frame: frame - d, fps: INTRO_FPS, config: { damping: 13 } });
              return (
                <div key={i} style={{
                  width: 74, height: 148, borderRadius: 16,
                  border: '4px solid rgba(246,235,216,0.25)', background: '#191209',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
                  transform: `translateY(${(1 - p) * 120}px)`, opacity: p,
                }}>
                  {['🍺', '💰', '🎲'][i]}
                </div>
              );
            })}
          </div>
        </div>
        <Sub delay={54}>Le grand écran affiche la table, vos téléphones sont les manettes.</Sub>
      </Center>
    </SceneFade>
  );
};

// ── S3 · Les 5 jeux (290-450) ───────────────────────────────────
const SceneGames: React.FC = () => (
  <SceneFade outStart={146}>
    <Center gap={50}>
      <Title size={62}>5 jeux de <Bubble>casino</Bubble></Title>
      <div style={{ display: 'flex', gap: 54 }}>
        <Emoji e="🎡" size={88} delay={14} label="Roulette" />
        <Emoji e="✈️" size={88} delay={22} label="L'Avion" />
        <Emoji e="♠️" size={88} delay={30} label="Blackjack" />
        <Emoji e="💣" size={88} delay={38} label="Les Mines" />
        <Emoji e="🐎" size={88} delay={46} label="Le Derby" />
      </div>
      <Sub delay={62}>À chaque manche, la table vote pour le prochain jeu.</Sub>
    </Center>
  </SceneFade>
);

// ── S4 · Jetons → gorgées (450-610) ─────────────────────────────
const SceneStakes: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <SceneFade outStart={146}>
      <Center gap={44}>
        <Title size={58}>Misez vos jetons. <Bubble>Perdu&nbsp;?</Bubble></Title>
        <div style={{ display: 'flex', gap: 30 }}>
          {[0, 1, 2, 3, 4].map((i) => {
            const flipStart = 52 + i * 9;
            const p = spring({ frame: frame - flipStart, fps: INTRO_FPS, config: { damping: 12 } });
            const appear = spring({ frame: frame - (10 + i * 5), fps: INTRO_FPS, config: { damping: 12 } });
            return (
              <div key={i} style={{
                fontSize: 84, lineHeight: 1,
                transform: `scale(${appear}) rotateY(${p * 180}deg)`,
                opacity: appear,
              }}>
                {p < 0.5 ? '💰' : <span style={{ display: 'inline-block', transform: 'rotateY(180deg)' }}>🍺</span>}
              </div>
            );
          })}
        </div>
        <Sub delay={100} size={36}>
          <span style={{ color: CREAM }}>1 jeton perdu = </span>
          <span style={{ color: RED, fontWeight: 600 }}>1 gorgée à boire</span>
        </Sub>
      </Center>
    </SceneFade>
  );
};

// ── S5 · Distribution (610-750) ─────────────────────────────────
const SceneGive: React.FC = () => {
  const frame = useCurrentFrame();
  const fly = interpolate(frame, [34, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <SceneFade outStart={126}>
      <Center gap={44}>
        <Title size={58}><Bubble>Gagné&nbsp;?</Bubble> Arrosez les copains.</Title>
        <div style={{ position: 'relative', display: 'flex', gap: 210, alignItems: 'center' }}>
          <Emoji e="😎" size={100} delay={12} />
          <Emoji e="😰" size={100} delay={18} />
          <span style={{
            position: 'absolute', left: `${18 + fly * 52}%`, top: `${8 - Math.sin(fly * Math.PI) * 46}%`,
            fontSize: 62, opacity: fly > 0 && fly < 1 ? 1 : 0,
            transform: `rotate(${fly * 260}deg)`,
          }}>
            🍺
          </span>
        </div>
        <Sub delay={40}>Après chaque manche, dépensez des jetons pour offrir des gorgées.</Sub>
      </Center>
    </SceneFade>
  );
};

// ── S6 · La taxe finale (750-930) ───────────────────────────────
const SceneTax: React.FC = () => {
  const frame = useCurrentFrame();
  const stamp = spring({ frame: frame - 34, fps: INTRO_FPS, config: { damping: 9, stiffness: 200 } });
  return (
    <SceneFade outStart={166}>
      <Center gap={38}>
        <Title size={58}>Au Grand Final, <Bubble>le fisc débarque.</Bubble></Title>
        <div style={{ position: 'relative', padding: '10px 30px' }}>
          <span style={{ fontSize: 110 }}>💸</span>
          <div style={{
            position: 'absolute', top: -8, right: -190,
            fontFamily: titanOne, fontSize: 44, color: RED,
            border: `6px solid ${RED}`, borderRadius: 18, padding: '8px 22px',
            transform: `rotate(-10deg) scale(${stamp})`,
            opacity: stamp,
            boxShadow: '0 10px 30px rgba(229,72,77,0.3)',
          }}>
            TAXE 10-40%
          </div>
        </div>
        <Sub delay={70} size={34}>
          Une part de votre fortune part en <span style={{ color: RED, fontWeight: 600 }}>gorgées pour vous</span>.
        </Sub>
        <Sub delay={96} size={34}>
          Le reste&nbsp;? Vous le distribuez <span style={{ color: GREEN, fontWeight: 600 }}>aux autres, en gorgées aussi</span>.
        </Sub>
      </Center>
    </SceneFade>
  );
};

// ── S7 · Santé ! (930-1080) ─────────────────────────────────────
const SceneCheers: React.FC = () => {
  const clink = usePop(10, 8);
  return (
    <SceneFade>
      <Center gap={30}>
        <div style={{ fontSize: 150, lineHeight: 1, transform: `scale(${clink}) rotate(${(1 - clink) * 14}deg)` }}>🍻</div>
        <Title delay={18} size={110}><Bubble>Santé !</Bubble></Title>
        <Sub delay={38}>Attrapez vos téléphones, la table est ouverte.</Sub>
        <Sub delay={58} size={20}>L'abus d'alcool est dangereux pour la santé. À consommer avec modération.</Sub>
      </Center>
    </SceneFade>
  );
};

// ── Assemblage ──────────────────────────────────────────────────
export const Intro: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <Sequence from={0} durationInFrames={130}><SceneLogo /></Sequence>
    <Sequence from={130} durationInFrames={160}><SceneSetup /></Sequence>
    <Sequence from={290} durationInFrames={160}><SceneGames /></Sequence>
    <Sequence from={450} durationInFrames={160}><SceneStakes /></Sequence>
    <Sequence from={610} durationInFrames={140}><SceneGive /></Sequence>
    <Sequence from={750} durationInFrames={180}><SceneTax /></Sequence>
    <Sequence from={930} durationInFrames={150}><SceneCheers /></Sequence>
  </AbsoluteFill>
);
