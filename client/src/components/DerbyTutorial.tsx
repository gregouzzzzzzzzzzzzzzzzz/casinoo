import React, { useEffect, useState } from 'react';

interface DerbyTutorialProps {
  roomId: string;
  onEndTutorial: () => void;
}

interface DemoHorse {
  id: number;
  name: string;
  color: string;
  emoji: string;
  lane: number;
  progress: number;
  speed: number;
  momentum: 'normal' | 'boosted' | 'fatigued';
}

function getTutorialLanePath(idx: number): string {
  const radii = [95, 120, 145, 170];
  const R = radii[idx] ?? (95 + idx * 25);
  const cx1 = 230;
  const cx2 = 550;
  const cy = 215;
  const startX = 390;
  const startY = cy + R;
  return `M ${startX} ${startY} L ${cx2} ${startY} A ${R} ${R} 0 0 0 ${cx2} ${cy - R} L ${cx1} ${cy - R} A ${R} ${R} 0 0 0 ${cx1} ${startY} Z`;
}

export const DerbyTutorial: React.FC<DerbyTutorialProps> = ({ onEndTutorial }) => {
  const TOTAL_DURATION_SECONDS = 12; // 12 seconds standard tutorial duration
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_DURATION_SECONDS);
  const [progressPercent, setProgressPercent] = useState(0);

  // 4 simulation horses for the animated oval preview
  const [horses, setHorses] = useState<DemoHorse[]>([
    { id: 1, name: 'Éclair Rouge', color: '#ef5350', emoji: '🔴', lane: 0, progress: 20, speed: 0.9, momentum: 'normal' },
    { id: 2, name: 'Tornade Bleue', color: '#3b82f6', emoji: '🔵', lane: 1, progress: 105, speed: 1.15, momentum: 'boosted' },
    { id: 3, name: 'Galop Vert', color: '#5cc963', emoji: '🟢', lane: 2, progress: 190, speed: 0.85, momentum: 'normal' },
    { id: 4, name: 'Pégase Jaune', color: '#ffb629', emoji: '🟡', lane: 3, progress: 280, speed: 0.75, momentum: 'fatigued' },
  ]);

  // Handle countdown & progress bar over 12 seconds
  useEffect(() => {
    const startTime = Date.now();
    const durationMs = TOTAL_DURATION_SECONDS * 1000;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      const pct = Math.min(100, (elapsed / durationMs) * 100);

      setSecondsLeft(remaining);
      setProgressPercent(pct);

      if (elapsed >= durationMs) {
        clearInterval(timer);
        onEndTutorial();
      }
    }, 100);

    return () => clearInterval(timer);
  }, [onEndTutorial]);

  // Live animation loop for the horses galloping on the oval track
  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    let momentumSwitchCounter = 0;

    const animate = (currentTime: number) => {
      const dt = Math.min(100, currentTime - lastTime);
      lastTime = currentTime;

      momentumSwitchCounter += dt;
      let shouldSwitchMomentum = false;
      if (momentumSwitchCounter > 2400) {
        momentumSwitchCounter = 0;
        shouldSwitchMomentum = true;
      }

      setHorses(prev => {
        return prev.map(h => {
          let currentMomentum = h.momentum;
          let currentSpeed = h.speed;

          if (shouldSwitchMomentum && Math.random() < 0.4) {
            const roll = Math.random();
            if (roll < 0.35) {
              currentMomentum = 'boosted';
              currentSpeed = 1.25;
            } else if (roll < 0.65) {
              currentMomentum = 'fatigued';
              currentSpeed = 0.65;
            } else {
              currentMomentum = 'normal';
              currentSpeed = 0.95;
            }
          }

          // Advance along the track (360 degrees)
          const newProgress = (h.progress + currentSpeed * (dt / 32)) % 360;
          return {
            ...h,
            progress: newProgress,
            speed: currentSpeed,
            momentum: currentMomentum,
          };
        });
      });

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const sortedHorses = [...horses].sort((a, b) => b.progress - a.progress);

  return (
    <div className="card animate-in" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      padding: '24px 32px',
      maxWidth: 1100,
      margin: '0 auto',
      width: '100%',
      background: 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(255, 182, 41, 0.08) 100%)',
      border: '2px solid rgba(255, 182, 41, 0.4)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
      borderRadius: 24,
    }}>
      {/* ── Top Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="badge badge-gold" style={{ fontSize: 13, padding: '6px 14px', letterSpacing: '0.08em' }}>
            🎬 DIDACTICIEL
          </span>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 8 }}>
              🏇 Le Derby Hippique
            </h2>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>
              Course de chevaux palpitante · Piste ovale & Momentum live
            </div>
          </div>
        </div>

        <button
          onClick={onEndTutorial}
          className="btn btn-primary"
          style={{
            padding: '12px 24px',
            fontSize: 15,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 12,
            boxShadow: '0 4px 14px rgba(255,182,41,0.35)',
            cursor: 'pointer',
          }}
        >
          <span>Passer / Lancer la course ▸</span>
        </button>
      </div>

      {/* ── Main Showcase: Animated Oval Track ────────────────── */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 780,
        height: 300,
        borderRadius: 20,
        overflow: 'hidden',
        background: '#09100d',
        boxShadow: '0 16px 40px rgba(0,0,0,0.85), inset 0 0 35px rgba(0,0,0,0.8)',
        border: '2px solid #1f3323',
      }}>
        <svg
          viewBox="0 0 780 430"
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            <radialGradient id="tutTurfGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0f4523" />
              <stop offset="100%" stopColor="#082814" />
            </radialGradient>
            <pattern id="tutCheckered" width="10" height="10" patternUnits="userSpaceOnUse">
              <rect width="5" height="5" fill="#ffffff" />
              <rect x="5" width="5" height="5" fill="#000000" />
              <rect y="5" width="5" height="5" fill="#000000" />
              <rect x="5" y="5" width="5" height="5" fill="#ffffff" />
            </pattern>
          </defs>

          {/* Dirt Track (Piste en terre battue) */}
          <path
            d="M 390 400 L 550 400 A 185 185 0 0 0 550 30 L 230 30 A 185 185 0 0 0 230 400 Z"
            fill="#3a2216"
            stroke="#5c3826"
            strokeWidth="6"
          />

          {/* Turf Infield (Pelouse intérieure) */}
          <path
            d="M 390 295 L 550 295 A 80 80 0 0 0 550 135 L 230 135 A 80 80 0 0 0 230 295 Z"
            fill="url(#tutTurfGradient)"
            stroke="#166534"
            strokeWidth="4"
          />

          {/* Lane Separator Dashed Lines */}
          <path
            d="M 390 322.5 L 550 322.5 A 107.5 107.5 0 0 0 550 107.5 L 230 107.5 A 107.5 107.5 0 0 0 230 322.5 Z"
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1.5"
            strokeDasharray="8 8"
          />
          <path
            d="M 390 347.5 L 550 347.5 A 132.5 132.5 0 0 0 550 82.5 L 230 82.5 A 132.5 132.5 0 0 0 230 347.5 Z"
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1.5"
            strokeDasharray="8 8"
          />
          <path
            d="M 390 372.5 L 550 372.5 A 157.5 157.5 0 0 0 550 57.5 L 230 57.5 A 157.5 157.5 0 0 0 230 372.5 Z"
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1.5"
            strokeDasharray="8 8"
          />

          {/* Finish Line (Damier) */}
          <rect
            x="386"
            y="295"
            width="8"
            height="105"
            fill="url(#tutCheckered)"
            stroke="#ffffff"
            strokeWidth="1"
          />
          <text x="390" y="420" textAnchor="middle" fontSize="18">🏁</text>
        </svg>

        {/* Center Infield HUD: Live Race Simulation Demo */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 250,
          background: 'rgba(8, 30, 16, 0.94)',
          border: '1.5px solid rgba(255, 182, 41, 0.5)',
          borderRadius: 12,
          padding: '8px 12px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.85)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--yellow)', letterSpacing: '0.05em' }}>
              ⚡ SIMULATION DU DERBY
            </span>
            <span className="badge badge-gold" style={{ fontSize: 8, padding: '1px 5px' }}>
              DIRECT
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
            {sortedHorses.map((h, i) => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: h.color, fontWeight: 700 }}>
                  <span>{['🥇', '🥈', '🥉', '4e'][i]}</span>
                  <span>{h.emoji} {h.name.split(' ')[0]}</span>
                </span>
                <span style={{ fontSize: 9, fontWeight: 700 }}>
                  {h.momentum === 'boosted' && <span style={{ color: '#ffb629' }}>🔥 SPRINT</span>}
                  {h.momentum === 'fatigued' && <span style={{ color: '#9ca3af' }}>💨 FATIGUE</span>}
                  {h.momentum === 'normal' && <span style={{ color: 'rgba(255,255,255,0.6)' }}>GALOP</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 4 Animated Horses Running with CSS Motion Path */}
        {horses.map((horse) => {
          const lanePath = getTutorialLanePath(horse.lane);
          const percentDistance = (horse.progress / 360) * 100;
          const isBoosted = horse.momentum === 'boosted';
          const isFatigued = horse.momentum === 'fatigued';

          return (
            <div
              key={horse.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                offsetPath: `path('${lanePath}')`,
                WebkitOffsetPath: `path('${lanePath}')`,
                offsetDistance: `${percentDistance}%`,
                WebkitOffsetDistance: `${percentDistance}%`,
                offsetRotate: '0deg',
                WebkitOffsetRotate: '0deg',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 20 + horse.lane,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                filter: isBoosted
                  ? 'drop-shadow(0 0 10px rgba(255,182,41,0.9))'
                  : 'drop-shadow(0 4px 8px rgba(0,0,0,0.8))',
              } as any}
            >
              {/* Momentum status badge over horse */}
              {isBoosted && (
                <span style={{
                  background: '#ffb629',
                  color: '#000',
                  fontSize: 8,
                  fontWeight: 900,
                  padding: '1px 4px',
                  borderRadius: 6,
                  whiteSpace: 'nowrap',
                  lineHeight: 1,
                  marginBottom: 2,
                  boxShadow: '0 0 6px #ffb629',
                }}>
                  🔥 BOOST
                </span>
              )}
              {isFatigued && (
                <span style={{
                  background: 'rgba(75,85,99,0.9)',
                  color: '#fff',
                  fontSize: 8,
                  fontWeight: 800,
                  padding: '1px 4px',
                  borderRadius: 6,
                  whiteSpace: 'nowrap',
                  lineHeight: 1,
                  marginBottom: 2,
                }}>
                  💨 FATIGUE
                </span>
              )}

              {/* Horse Avatar Circle */}
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: horse.color,
                border: `2px solid ${isBoosted ? '#ffb629' : '#ffffff'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                boxShadow: `0 0 12px ${horse.color}88`,
              }}>
                🏇
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 3 Clear Rules Cards ───────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        width: '100%',
      }}>
        <div style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-default)',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📱 1. MISEZ SUR MOBILE</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Choisissez l'un des <strong>4 chevaux</strong> sur votre téléphone et placez votre mise en jetons avant le signal de départ.
          </p>
        </div>

        <div style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-default)',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚡ 2. LE MOMENTUM</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Surveillez les accélérations <strong>🔥 Boost</strong> et coups de fatigue <strong>💨</strong> dans les virages ! Tout peut basculer jusqu'à la ligne.
          </p>
        </div>

        <div style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-default)',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🍻 3. VICTOIRE OU GORGÉES</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Le premier cheval fait <strong>tripler la mise (Cote ×3.00)</strong> de ses parieurs. Les perdants boivent leur mise en gorgées !
          </p>
        </div>
      </div>

      {/* ── 4 Horse Stalls Roster ─────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10,
        width: '100%',
      }}>
        {[
          { id: 1, name: 'Éclair Rouge', color: '#ef5350', emoji: '🔴', cote: '×3.00' },
          { id: 2, name: 'Tornade Bleue', color: '#3b82f6', emoji: '🔵', cote: '×3.00' },
          { id: 3, name: 'Galop Vert', color: '#5cc963', emoji: '🟢', cote: '×3.00' },
          { id: 4, name: 'Pégase Jaune', color: '#ffb629', emoji: '🟡', cote: '×3.00' },
        ].map(horse => (
          <div key={horse.id} style={{
            background: 'var(--bg-input)',
            borderLeft: `4px solid ${horse.color}`,
            borderRadius: 10,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: horse.color }}>
              {horse.emoji} {horse.name}
            </span>
            <span className="badge badge-surface" style={{ fontSize: 11, fontWeight: 800, color: 'var(--yellow)' }}>
              {horse.cote}
            </span>
          </div>
        ))}
      </div>

      {/* ── Animated Progress Bar & Auto-launch Countdown ────── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
        background: 'var(--bg-input)',
        padding: '12px 20px',
        borderRadius: 14,
        border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            <span>Préparez-vous à placer vos paris sur vos smartphones...</span>
          </div>
          <div style={{ fontWeight: 800, color: 'var(--yellow)' }}>
            Lancement automatique dans {secondsLeft}s
          </div>
        </div>

        <div style={{
          width: '100%',
          height: 6,
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: 4,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${progressPercent}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--gold) 0%, #ff6b35 100%)',
            transition: 'width 0.1s linear',
          }} />
        </div>
      </div>
    </div>
  );
};
