import React, { useEffect, useRef } from 'react';

interface AviatorCanvasProps {
  multiplier: number;
  crashed: boolean;
  height?: number;
}

/**
 * Courbe de vol façon Aviator : l'avion grimpe le long de la courbe du
 * multiplicateur, puis explose au moment du krach. Dessin Canvas 2D,
 * interpolation à 60 fps entre les ticks serveur (10 Hz).
 */
export const AviatorCanvas: React.FC<AviatorCanvasProps> = ({ multiplier, crashed, height = 360 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(1);
  const smoothRef = useRef(1);
  const historyRef = useRef<number[]>([1]);
  const crashedRef = useRef(false);
  const crashFrameRef = useRef(0);
  const rafRef = useRef(0);

  // Nouveau round : le multiplicateur repart à 1.
  if (multiplier < targetRef.current - 0.001 && !crashed) {
    historyRef.current = [1];
    smoothRef.current = 1;
    crashedRef.current = false;
    crashFrameRef.current = 0;
  }
  targetRef.current = multiplier;
  crashedRef.current = crashed;

  useEffect(() => {
    historyRef.current.push(multiplier);
    if (historyRef.current.length > 400) historyRef.current.shift();
  }, [multiplier]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Interpolation douce vers la cible serveur
      smoothRef.current += (targetRef.current - smoothRef.current) * (reduceMotion ? 1 : 0.18);
      if (crashedRef.current) crashFrameRef.current += 1;

      const pad = { top: 26, right: 62, bottom: 26, left: 14 };
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      const history = historyRef.current;
      const maxMult = Math.max(2, smoothRef.current * 1.15);
      const yFor = (m: number) => pad.top + plotH - ((m - 1) / (maxMult - 1)) * plotH;
      const xFor = (i: number) => pad.left + (i / Math.max(24, history.length - 1)) * plotW;

      // Fond ciel nocturne chaud
      ctx.clearRect(0, 0, w, h);
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, 'rgba(255, 182, 41, 0.05)');
      sky.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Lignes de niveau + libellés à droite
      ctx.strokeStyle = 'rgba(246, 235, 216, 0.08)';
      ctx.fillStyle = 'rgba(246, 235, 216, 0.4)';
      ctx.font = '600 11px Fredoka, sans-serif';
      ctx.textAlign = 'left';
      ctx.lineWidth = 1;
      const step = maxMult <= 3 ? 0.5 : maxMult <= 8 ? 1 : 2;
      for (let m = 1; m <= maxMult; m += step) {
        const y = yFor(m);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right + 8, y);
        ctx.stroke();
        ctx.fillText(`${m.toFixed(step < 1 ? 1 : 0)}x`, w - pad.right + 14, y + 4);
      }

      // Courbe de vol (dernier point interpolé)
      const pts = history.slice(0, -1).concat(smoothRef.current);
      const lastX = xFor(pts.length - 1);
      const lastY = yFor(pts[pts.length - 1]);
      const curveColor = crashedRef.current ? '#f2696d' : '#ffb629';

      ctx.beginPath();
      ctx.moveTo(xFor(0), yFor(1));
      pts.forEach((m, i) => ctx.lineTo(xFor(i), yFor(m)));
      ctx.strokeStyle = curveColor;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = crashedRef.current ? 'rgba(229,72,77,0.5)' : 'rgba(255,182,41,0.45)';
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Remplissage sous la courbe
      ctx.lineTo(lastX, yFor(1));
      ctx.lineTo(xFor(0), yFor(1));
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
      fill.addColorStop(0, crashedRef.current ? 'rgba(229,72,77,0.22)' : 'rgba(255,182,41,0.22)');
      fill.addColorStop(1, 'rgba(255,182,41,0)');
      ctx.fillStyle = fill;
      ctx.fill();

      // L'avion (ou l'explosion)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (crashedRef.current) {
        const boom = Math.min(1, crashFrameRef.current / 12);
        ctx.font = `${28 + boom * 22}px sans-serif`;
        ctx.globalAlpha = Math.max(0, 1.25 - boom);
        ctx.fillText('💥', lastX, lastY);
        ctx.globalAlpha = 1;
      } else {
        const prev = pts[Math.max(0, pts.length - 6)];
        const slope = Math.atan2(yFor(prev) - lastY, plotW * 0.06);
        ctx.save();
        ctx.translate(lastX, lastY - 4);
        ctx.rotate(-Math.min(0.9, slope));
        ctx.font = '30px sans-serif';
        ctx.fillText('✈️', 0, 0);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block', borderRadius: 16 }}
      aria-label="Courbe de vol du multiplicateur"
    />
  );
};
