import { VX, VY, type Dir } from "./logic";
import type { Sim } from "./sim";

export type Palette = {
  fg: string;
  accent: string;
  surface: string;
  line: string;
  muted: string;
  bg: string;
};

const ROT = [-Math.PI / 2, 0, Math.PI / 2, Math.PI] as const;

export function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const g = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    fg: g("--color-fg", "#f3efe4"),
    accent: g("--color-accent", "#ff4d1c"),
    surface: g("--color-surface", "#1a211c"),
    line: g("--color-line", "#2c362f"),
    muted: g("--color-muted", "#9aa396"),
    bg: g("--color-bg", "#101412"),
  };
}

export function fitCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export function layoutBoard(sim: Sim, w: number, h: number) {
  const pad = 14;
  const cell = Math.max(8, Math.min((w - pad * 2) / sim.board.w, (h - pad * 2) / sim.board.h));
  const bw = cell * sim.board.w;
  const bh = cell * sim.board.h;
  sim.layout = { ox: (w - bw) / 2, oy: (h - bh) / 2, cell };
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  dir: Dir,
  fill: string,
  stretch: number,
  alpha: number,
) {
  const s = cell * 0.72;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ROT[dir]);
  ctx.scale(stretch, 1 / stretch);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  const head = s * 0.5;
  const neck = s * 0.06;
  const tail = -s * 0.44;
  const shaft = s * 0.16;
  const headH = s * 0.38;
  ctx.moveTo(tail, -shaft);
  ctx.lineTo(neck, -shaft);
  ctx.lineTo(neck, -headH);
  ctx.lineTo(head, 0);
  ctx.lineTo(neck, headH);
  ctx.lineTo(neck, shaft);
  ctx.lineTo(tail, shaft);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2.5, cell * 0.07);
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

export function drawBoard(ctx: CanvasRenderingContext2D, sim: Sim, palette: Palette, now: number, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  const { ox, oy, cell } = sim.layout;
  if (cell < 4) return;
  const bw = cell * sim.board.w;
  const bh = cell * sim.board.h;
  const shake = sim.trauma * sim.trauma;
  const sx = shake ? (Math.sin(now * 0.05) + Math.sin(now * 0.013)) * 5 * shake : 0;
  const sy = shake ? (Math.cos(now * 0.04) + Math.sin(now * 0.017)) * 5 * shake : 0;

  ctx.save();
  ctx.translate(sx, sy);

  const radius = Math.min(24, cell * 0.4);
  ctx.fillStyle = palette.surface;
  ctx.beginPath();
  ctx.roundRect(ox - 10, oy - 10, bw + 20, bh + 20, radius);
  ctx.fill();

  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  for (let i = 1; i < sim.board.w; i++) {
    ctx.beginPath();
    ctx.moveTo(ox + i * cell, oy + 6);
    ctx.lineTo(ox + i * cell, oy + bh - 6);
    ctx.stroke();
  }
  for (let i = 1; i < sim.board.h; i++) {
    ctx.beginPath();
    ctx.moveTo(ox + 6, oy + i * cell);
    ctx.lineTo(ox + bw - 6, oy + i * cell);
    ctx.stroke();
  }

  for (const flash of sim.flashes) {
    const a = 1 - flash.age / flash.dur;
    for (const c of flash.cells) {
      ctx.globalAlpha = (c.block ? 0.5 : 0.18) * a;
      ctx.fillStyle = flash.bad ? palette.accent : palette.fg;
      const inset = c.block ? 5 : 8;
      ctx.beginPath();
      ctx.roundRect(
        ox + c.x * cell + inset,
        oy + c.y * cell + inset,
        cell - inset * 2,
        cell - inset * 2,
        6,
      );
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  if (sim.hintId != null) {
    const hinted = sim.board.arrows.find((a) => a.id === sim.hintId);
    if (hinted) {
      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 140));
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(ox + hinted.x * cell + 4, oy + hinted.y * cell + 4, cell - 8, cell - 8, 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  for (const arrow of sim.board.arrows) {
    const bump = sim.bumpers.find((b) => b.id === arrow.id);
    let oxb = 0;
    let oyb = 0;
    let stretch = 1;
    if (bump) {
      const t = bump.age / bump.dur;
      const mag = Math.sin(t * Math.PI) * cell * 0.2;
      oxb = VX[arrow.dir] * mag;
      oyb = VY[arrow.dir] * mag;
      stretch = 1 - 0.14 * Math.sin(t * Math.PI);
    } else if (!sim.reduce) {
      stretch = 1 + Math.sin(now / 380 + arrow.id) * 0.018;
    }
    const hinted = arrow.id === sim.hintId;
    drawArrow(
      ctx,
      ox + (arrow.x + 0.5) * cell + oxb,
      oy + (arrow.y + 0.5) * cell + oyb,
      cell,
      arrow.dir,
      hinted ? palette.accent : palette.fg,
      Math.max(0.7, stretch),
      1,
    );
  }

  for (const f of sim.flyers) {
    const t = Math.min(1, f.age / f.dur);
    const eased = t * t;
    const distPx = f.dist * cell * eased;
    const stretch = 1 + (sim.reduce ? 0 : 0.45 * t);
    drawArrow(
      ctx,
      ox + (f.x + 0.5) * cell + VX[f.dir] * distPx,
      oy + (f.y + 0.5) * cell + VY[f.dir] * distPx,
      cell,
      f.dir,
      f.combo > 2 ? palette.accent : palette.fg,
      stretch,
      1 - t * 0.15,
    );
  }

  for (const p of sim.particles) {
    const a = 1 - p.age / p.dur;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = p.accent ? palette.accent : palette.fg;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  ctx.font = `800 ${Math.max(14, cell * 0.38)}px "Bricolage Grotesque", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const f of sim.floaters) {
    if (!f.text) continue;
    const a = 1 - f.age / f.dur;
    const rise = (f.age / f.dur) * cell * 0.7;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = palette.accent;
    ctx.fillText(f.text, ox + f.x * cell, oy + f.y * cell - rise);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
