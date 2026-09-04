import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { loadFont as loadTitanOne } from '@remotion/google-fonts/TitanOne';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';

const { fontFamily: titanOneFamily } = loadTitanOne();
const { fontFamily: fredokaFamily } = loadFredoka();

export const titanOne = titanOneFamily;
export const fredoka = fredokaFamily;

// ── Palette Sip Sip Studio ──────────────────────────────────────
export const INK = '#100c08';
export const CREAM = '#f6ebd8';
export const CREAM_DIM = 'rgba(246, 235, 216, 0.65)';
export const YELLOW = '#ffb629';
export const ORANGE_DEEP = '#c96a0d';
export const RED = '#e5484d';
export const GREEN = '#5cc963';

// ── Helpers d'animation ─────────────────────────────────────────
export const usePop = (delay: number, damping = 12) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 130 } });
};

export const SceneFade: React.FC<{ children: React.ReactNode; outStart?: number }> = ({ children, outStart }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = outStart === undefined ? 1 : interpolate(frame, [outStart, outStart + 14], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>{children}</AbsoluteFill>;
};

export const Title: React.FC<{ children: React.ReactNode; size?: number; color?: string; delay?: number }> = ({ children, size = 74, color = CREAM, delay = 0 }) => {
  const pop = usePop(delay);
  return (
    <div style={{
      fontFamily: titanOne,
      fontSize: size,
      color,
      textAlign: 'center',
      lineHeight: 1.12,
      textShadow: `0 ${Math.round(size * 0.055)}px 0 rgba(0,0,0,0.45)`,
      transform: `scale(${0.7 + pop * 0.3}) translateY(${(1 - pop) * 26}px)`,
      opacity: pop,
    }}>
      {children}
    </div>
  );
};

export const Sub: React.FC<{ children: React.ReactNode; delay?: number; size?: number }> = ({ children, delay = 10, size = 32 }) => {
  const pop = usePop(delay, 16);
  return (
    <div style={{
      fontFamily: fredoka,
      fontWeight: 500,
      fontSize: size,
      color: CREAM_DIM,
      textAlign: 'center',
      opacity: pop,
      transform: `translateY(${(1 - pop) * 18}px)`,
      maxWidth: 980,
      lineHeight: 1.35,
    }}>
      {children}
    </div>
  );
};

export const Bubble: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ color: YELLOW, textShadow: `0 0.06em 0 ${ORANGE_DEEP}` }}>{children}</span>
);

export const Center: React.FC<{ children: React.ReactNode; gap?: number }> = ({ children, gap = 30 }) => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap }}>
    {children}
  </AbsoluteFill>
);

export const Emoji: React.FC<{ e: string; size: number; delay: number; label?: string }> = ({ e, size, delay, label }) => {
  const pop = usePop(delay);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, transform: `scale(${pop})`, opacity: pop }}>
      <span style={{ fontSize: size, lineHeight: 1 }}>{e}</span>
      {label && <span style={{ fontFamily: fredoka, fontWeight: 600, fontSize: 24, color: CREAM_DIM }}>{label}</span>}
    </div>
  );
};

export const Background: React.FC = () => (
  <AbsoluteFill style={{
    background: INK,
    backgroundImage: [
      'radial-gradient(ellipse 80% 55% at 50% -10%, rgba(255,182,41,0.10), transparent 70%)',
      'radial-gradient(ellipse 60% 45% at 85% 108%, rgba(239,133,17,0.08), transparent 70%)',
      'radial-gradient(ellipse 130% 100% at 50% 50%, transparent 60%, rgba(0,0,0,0.4) 100%)',
    ].join(', '),
  }} />
);

// Pastille de règle (« ×2 », « +1 jeton »...)
export const Pill: React.FC<{ children: React.ReactNode; color?: string; delay?: number; size?: number }> = ({ children, color = YELLOW, delay = 0, size = 34 }) => {
  const pop = usePop(delay, 10);
  return (
    <span style={{
      fontFamily: titanOne,
      fontSize: size,
      color: INK,
      background: color,
      borderRadius: 999,
      padding: '10px 26px',
      boxShadow: `0 6px 0 rgba(0,0,0,0.35)`,
      transform: `scale(${pop})`,
      opacity: pop,
      display: 'inline-block',
    }}>
      {children}
    </span>
  );
};
