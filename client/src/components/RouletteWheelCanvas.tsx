import React, { useEffect, useRef, useState } from 'react';

export const ROULETTE_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

export const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

export function getNumberColor(num: number): 'green' | 'red' | 'black' {
  if (num === 0) return 'green';
  return RED_NUMBERS.includes(num) ? 'red' : 'black';
}

export function getNumberColorHex(num: number): string {
  const c = getNumberColor(num);
  if (c === 'green') return '#10b981';
  if (c === 'red') return '#e11d48';
  return '#18181b';
}

// ── Web Audio Synthesizer (Bruits de bille et cliquetis) ──────
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playBallClickSound(volume = 0.2) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const pitch = 900 + Math.random() * 300;
    osc.frequency.setValueAtTime(pitch, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.025);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.025);
  } catch {
    // Audio non critique
  }
}

function playWinChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.09);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.09);
      osc.stop(ctx.currentTime + i * 0.09 + 0.35);
    });
  } catch {
    // ignore
  }
}

interface RouletteWheelCanvasProps {
  isSpinning: boolean;
  targetNumber?: number | null;
  size?: number;
  durationMs?: number;
  onSpinEnd?: (winningNumber: number) => void;
}

export const RouletteWheelCanvas: React.FC<RouletteWheelCanvasProps> = ({
  isSpinning,
  targetNumber = null,
  size = 460,
  durationMs = 6800,
  onSpinEnd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Angles d'état
  const wheelAngleRef = useRef<number>(0);
  const ballAngleRef = useRef<number>(0);
  const ballRadiusRef = useRef<number>(0.83); // relatif au rayon R
  const spinStartTimeRef = useRef<number | null>(null);
  const lastClickAngleRef = useRef<number>(0);
  const hasTriggeredEndRef = useRef<boolean>(false);

  // Sauvegarder les paramètres de la rotation
  const spinParamsRef = useRef<{
    startWheelAngle: number;
    totalWheelRotations: number;
    startBallAngle: number;
    totalBallRotations: number;
    targetPocketAngle: number;
  } | null>(null);

  const [displayResult, setDisplayResult] = useState<number | null>(null);

  // Initialisation lors du début du spin
  useEffect(() => {
    if (isSpinning) {
      hasTriggeredEndRef.current = false;
      setDisplayResult(null);
      const chosenTarget = targetNumber ?? 0;
      const targetIndex = ROULETTE_NUMBERS.indexOf(chosenTarget);
      const stepAngle = (2 * Math.PI) / 37;
      // Centre de la case cible relative à la roue
      const pocketCenterAngle = targetIndex * stepAngle + stepAngle / 2;

      // Paramètres de rotation
      const startWheel = wheelAngleRef.current;
      const wheelTurns = 3 + Math.random() * 1.5; // Roue tourne ~3-4 fois clockwise

      // On veut qu'à la fin (t=1), la bille soit DANS la poche :
      // ballAngle(1) % (2PI) = (wheelAngle(1) + pocketCenterAngle) % (2PI)
      const endWheelAngle = startWheel + wheelTurns * 2 * Math.PI;
      const desiredEndBallAngle = endWheelAngle + pocketCenterAngle;

      const startBall = ballAngleRef.current;
      const ballTurns = 12 + Math.random() * 2; // Bille tourne 12-14 fois counter-clockwise (négatif)
      // Ajuster pour atterrir exactement sur desiredEndBallAngle
      const totalBallRotations = - (ballTurns * 2 * Math.PI + ((startBall - desiredEndBallAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));

      spinParamsRef.current = {
        startWheelAngle: startWheel,
        totalWheelRotations: wheelTurns * 2 * Math.PI,
        startBallAngle: startBall,
        totalBallRotations,
        targetPocketAngle: pocketCenterAngle,
      };

      spinStartTimeRef.current = performance.now();
    } else {
      spinParamsRef.current = null;
      spinStartTimeRef.current = null;
    }
  }, [isSpinning, targetNumber]);

  // Boucle d'animation Canvas
  useEffect(() => {
    let animationFrameId: number;

    const render = (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = size;
      const height = size;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const R = (Math.min(width, height) / 2) - 8;

      // ── Gestion de la physique ──
      if (isSpinning && spinStartTimeRef.current && spinParamsRef.current) {
        const elapsed = time - spinStartTimeRef.current;
        const progress = Math.min(1, Math.max(0, elapsed / durationMs));

        // Décélération cubique pour la roue
        const wheelEase = 1 - Math.pow(1 - progress, 2.5);
        wheelAngleRef.current = spinParamsRef.current.startWheelAngle + spinParamsRef.current.totalWheelRotations * wheelEase;

        // Décélération puissante pour la bille
        const ballEase = 1 - Math.pow(1 - progress, 3.2);
        ballAngleRef.current = spinParamsRef.current.startBallAngle + spinParamsRef.current.totalBallRotations * ballEase;

        // Évolution radiale de la bille (du haut de la piste jusqu'au fond de la case)
        if (progress < 0.50) {
          // Reste plaquée contre la piste extérieure
          ballRadiusRef.current = 0.83;
        } else if (progress < 0.78) {
          // Descend la rampe vers les séparateurs
          const dropP = (progress - 0.50) / 0.28;
          const dropEase = dropP * dropP;
          ballRadiusRef.current = 0.83 - (0.83 - 0.63) * dropEase;
        } else {
          // Rebondit sur les séparateurs en fin de course
          const bounceP = (progress - 0.78) / 0.22;
          const bounceDamp = Math.cos(bounceP * Math.PI * 5) * (1 - bounceP) * 0.035;
          ballRadiusRef.current = 0.63 + bounceDamp;
        }

        // Bruit de clic quand la bille croise les cases (plus intense au drop)
        const currentAngleDiff = Math.abs(ballAngleRef.current - lastClickAngleRef.current);
        const threshold = progress > 0.65 ? 0.25 : 0.45;
        if (currentAngleDiff > threshold) {
          lastClickAngleRef.current = ballAngleRef.current;
          const vol = Math.max(0.04, 0.25 * (1 - progress));
          playBallClickSound(vol);
        }

        // Fin de course
        if (progress >= 1 && !hasTriggeredEndRef.current) {
          hasTriggeredEndRef.current = true;
          const finalNum = targetNumber ?? 0;
          setDisplayResult(finalNum);
          playWinChime();
          if (onSpinEnd) onSpinEnd(finalNum);
        }
      } else {
        // Mode veille : rotation lente élégante (~1 tour / 20s)
        wheelAngleRef.current += 0.003;
        if (targetNumber !== null && targetNumber !== undefined) {
          // Bille posée dans la poche du dernier numéro
          const targetIndex = ROULETTE_NUMBERS.indexOf(targetNumber);
          const stepAngle = (2 * Math.PI) / 37;
          const pocketCenterAngle = targetIndex * stepAngle + stepAngle / 2;
          ballAngleRef.current = wheelAngleRef.current + pocketCenterAngle;
          ballRadiusRef.current = 0.63;
        } else {
          // Posée sur le zéro
          const stepAngle = (2 * Math.PI) / 37;
          ballAngleRef.current = wheelAngleRef.current + stepAngle / 2;
          ballRadiusRef.current = 0.63;
        }
      }

      // ── DESSIN DE LA ROULETTE ──

      // 1. Ombre portée externe
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 25;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = '#16100a';
      ctx.fill();
      ctx.restore();

      // 2. Bordure en bois d'acajou luxueux
      const woodGrad = ctx.createRadialGradient(cx, cy, R * 0.88, cx, cy, R);
      woodGrad.addColorStop(0, '#2d1406');
      woodGrad.addColorStop(0.5, '#451a03');
      woodGrad.addColorStop(0.85, '#5e2406');
      woodGrad.addColorStop(1, '#1e0c03');

      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = woodGrad;
      ctx.fill();

      // Anneau intérieur en laiton doré
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.90, 0, Math.PI * 2);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 3. Piste de la bille (Ball track sombre et métallique)
      const trackGrad = ctx.createRadialGradient(cx, cy, R * 0.76, cx, cy, R * 0.90);
      trackGrad.addColorStop(0, '#1c1917');
      trackGrad.addColorStop(0.7, '#292524');
      trackGrad.addColorStop(1, '#0c0a09');

      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.90, 0, Math.PI * 2);
      ctx.arc(cx, cy, R * 0.76, 0, Math.PI * 2, true);
      ctx.fillStyle = trackGrad;
      ctx.fill();

      // 8 Déflecteurs losanges en argent/or sur la piste
      for (let i = 0; i < 8; i++) {
        const defAngle = (i * Math.PI) / 4;
        const dx = cx + Math.cos(defAngle) * (R * 0.84);
        const dy = cy + Math.sin(defAngle) * (R * 0.84);
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(defAngle + Math.PI / 4);
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      }

      // 4. LE CYLINDRE ET LES CASES (WHEEL POCKETS)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(wheelAngleRef.current);

      const pocketInnerR = R * 0.50;
      const pocketOuterR = R * 0.76;
      const stepAngle = (2 * Math.PI) / 37;

      for (let i = 0; i < 37; i++) {
        const num = ROULETTE_NUMBERS[i];
        const startA = i * stepAngle;
        const endA = (i + 1) * stepAngle;
        const color = getNumberColor(num);

        // Fond de la case
        ctx.beginPath();
        ctx.arc(0, 0, pocketOuterR, startA, endA);
        ctx.arc(0, 0, pocketInnerR, endA, startA, true);
        ctx.closePath();

        if (color === 'green') {
          ctx.fillStyle = '#059669'; // Zéro Vert émeraude
        } else if (color === 'red') {
          ctx.fillStyle = '#dc2626'; // Rouge casino profond
        } else {
          ctx.fillStyle = '#18181b'; // Noir ardoise
        }
        ctx.fill();

        // Séparateurs de cases (frets chromés)
        ctx.beginPath();
        ctx.moveTo(Math.cos(startA) * pocketInnerR, Math.sin(startA) * pocketInnerR);
        ctx.lineTo(Math.cos(startA) * pocketOuterR, Math.sin(startA) * pocketOuterR);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Numéro de la case
        const midA = startA + stepAngle / 2;
        const textR = (pocketInnerR + pocketOuterR) / 2;
        const tx = Math.cos(midA) * textR;
        const ty = Math.sin(midA) * textR;

        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(midA + Math.PI / 2); // Oriente le texte vers l'extérieur

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(R * 0.055)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 3;
        ctx.fillText(num.toString(), 0, 0);
        ctx.restore();

        // Spotlight si c'est le numéro gagnant arrêté
        if (displayResult === num) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, pocketOuterR + 1, startA, endA);
          ctx.arc(0, 0, pocketInnerR - 1, endA, startA, true);
          ctx.closePath();
          ctx.fillStyle = 'rgba(251, 191, 36, 0.45)';
          ctx.fill();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        }
      }

      // 5. Cône central métallique et branches (Turret / Cone)
      const coneR = pocketInnerR;
      const coneGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coneR);
      coneGrad.addColorStop(0, '#fef08a');
      coneGrad.addColorStop(0.3, '#d97706');
      coneGrad.addColorStop(0.6, '#78350f');
      coneGrad.addColorStop(0.85, '#d97706');
      coneGrad.addColorStop(1, '#451a03');

      ctx.beginPath();
      ctx.arc(0, 0, coneR, 0, Math.PI * 2);
      ctx.fillStyle = coneGrad;
      ctx.fill();

      // 8 Rayons dorés métalliques
      for (let j = 0; j < 8; j++) {
        const spokeA = (j * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(spokeA) * (coneR * 0.92), Math.sin(spokeA) * (coneR * 0.92));
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 3;
        ctx.stroke();
      }

      // Tourelle centrale dorée (Le bouton de préhension central)
      const centerCapR = coneR * 0.38;
      const capGrad = ctx.createRadialGradient(-3, -3, 0, 0, 0, centerCapR);
      capGrad.addColorStop(0, '#ffffff');
      capGrad.addColorStop(0.2, '#fef08a');
      capGrad.addColorStop(0.6, '#b45309');
      capGrad.addColorStop(1, '#451a03');

      ctx.beginPath();
      ctx.arc(0, 0, centerCapR, 0, Math.PI * 2);
      ctx.fillStyle = capGrad;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.fill();

      // Poignées chromées de lancement
      for (let k = 0; k < 4; k++) {
        const handleA = (k * Math.PI) / 2;
        ctx.save();
        ctx.rotate(handleA);
        ctx.beginPath();
        ctx.roundRect(0, -3, centerCapR * 1.6, 6, 3);
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fill();
        ctx.restore();
      }

      ctx.restore(); // fin rotation de la roue

      // 6. LA BILLE (White Pearl Ball)
      const bx = cx + Math.cos(ballAngleRef.current) * (R * ballRadiusRef.current);
      const by = cy + Math.sin(ballAngleRef.current) * (R * ballRadiusRef.current);
      const ballSize = Math.max(6, Math.round(R * 0.038));

      // Ombre portée de la bille
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx + 2, by + 3, ballSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.filter = 'blur(2px)';
      ctx.fill();
      ctx.restore();

      // Corps de la bille perlée avec réflexion
      const ballGrad = ctx.createRadialGradient(
        bx - ballSize * 0.35,
        by - ballSize * 0.35,
        ballSize * 0.1,
        bx,
        by,
        ballSize
      );
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.5, '#f8fafc');
      ballGrad.addColorStop(0.85, '#cbd5e1');
      ballGrad.addColorStop(1, '#64748b');

      ctx.beginPath();
      ctx.arc(bx, by, ballSize, 0, Math.PI * 2);
      ctx.fillStyle = ballGrad;
      ctx.fill();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isSpinning, targetNumber, size, durationMs, onSpinEnd, displayResult]);

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: size,
          height: size,
          display: 'block',
          borderRadius: '50%',
        }}
      />
      {displayResult !== null && (
        <div
          style={{
            position: 'absolute',
            bottom: -15,
            left: '50%',
            transform: 'translateX(-50%)',
            background: getNumberColorHex(displayResult),
            border: '2px solid #ffffff',
            color: '#ffffff',
            padding: '6px 16px',
            borderRadius: 20,
            fontWeight: 900,
            fontSize: 18,
            boxShadow: '0 4px 15px rgba(0,0,0,0.6)',
            letterSpacing: '0.05em',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}
        >
          {displayResult === 0 ? '🟢 0 VERT' : `${getNumberColor(displayResult) === 'red' ? '🔴' : '⚫'} ${displayResult} ${getNumberColor(displayResult).toUpperCase()}`}
        </div>
      )}
    </div>
  );
};
