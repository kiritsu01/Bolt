import { useEffect, useRef } from "react";
import {
  createGhosts,
  effectiveHeat,
  ghostAlpha,
  ghostRgb,
  ghostSignals,
  isBursting,
  shouldDraw,
  stepGhosts,
  type Ghost,
} from "@/game/ghosts";

/**
 * Canvas unico dietro tutto con le frecce fantasma.
 * Al massimo 30 fps, in pausa quando la pagina è nascosta, fermo con prefers-reduced-motion.
 */
export function GhostField() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let w = 0;
    let h = 0;
    let ghosts: Ghost[] = [];
    let accent = "#ff5a1f";
    let accentAt = 0;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;

    const readAccent = (now: number) => {
      if (now - accentAt < 500) return;
      accentAt = now;
      accent = getComputedStyle(canvas).getPropertyValue("--color-accent").trim() || accent;
    };

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!ghosts.length) ghosts = createGhosts(w, h);
    };

    const draw = (now: number) => {
      readAccent(now);
      const heat = effectiveHeat(ghostSignals, now);
      const [r, g, b] = ghostRgb(accent, heat);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      for (const gh of ghosts) {
        ctx.globalAlpha = ghostAlpha(gh.alpha, heat);
        ctx.save();
        ctx.translate(gh.x, gh.y);
        ctx.rotate(gh.rot);
        const s = gh.size;
        // Freccia che punta in alto (stessa sagoma delle frecce del gioco).
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.5);
        ctx.lineTo(s * 0.38, -s * 0.06);
        ctx.lineTo(s * 0.16, -s * 0.06);
        ctx.lineTo(s * 0.16, s * 0.44);
        ctx.lineTo(-s * 0.16, s * 0.44);
        ctx.lineTo(-s * 0.16, -s * 0.06);
        ctx.lineTo(-s * 0.38, -s * 0.06);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) {
        last = now;
        return;
      }
      if (!shouldDraw(lastDraw, now)) return;
      const dt = (now - last) / 1000;
      last = now;
      lastDraw = now;
      stepGhosts(ghosts, dt, w, h, now, ghostSignals);
      draw(now);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      resize();
      if (motion.matches) {
        // Movimento ridotto: un solo disegno, fermo (ridisegnato solo se cambia il colore).
        draw(performance.now());
        return;
      }
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    const onVisible = () => {
      if (!document.hidden) last = performance.now();
    };
    const onResize = () => {
      resize();
      if (motion.matches) draw(performance.now());
    };
    // Con movimento ridotto il colore del capitolo si aggiorna lo stesso, ma senza animare.
    const still = window.setInterval(() => {
      if (motion.matches && !document.hidden && !isBursting(ghostSignals, performance.now())) {
        accentAt = 0;
        draw(performance.now());
      }
    }, 1000);

    start();
    motion.addEventListener("change", start);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(still);
      motion.removeEventListener("change", start);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <canvas ref={ref} className="bolt-ghosts" aria-hidden="true" />;
}
