import type { ArrowStyle } from "./cosmetics";
import { VX, VY, type Dir } from "./logic";
import type { Sim } from "./sim";

export type Palette = {
  fg: string;
  accent: string;
  surface: string;
  line: string;
  muted: string;
  bg: string;
  /** Stile delle frecce scelto nel negozio. */
  arrow?: ArrowStyle;
};

const ROT = [-Math.PI / 2, 0, Math.PI / 2, Math.PI] as const;

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

export function readPalette(el: Element = document.documentElement): Palette {
  const s = getComputedStyle(el);
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

const PIXEL_ARROW = ["..X..", "..XX.", "XXXXX", "..XX.", "..X.."];

export function drawArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  dir: Dir,
  fill: string,
  stretch: number,
  alpha: number,
  turn = 0,
  style: ArrowStyle = "classic",
  ink = "#101412",
) {
  const s = cell * 0.72;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ROT[dir] + turn);
  ctx.scale(stretch, 1 / stretch);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (style === "chevron") {
    ctx.lineWidth = Math.max(3, cell * 0.12);
    for (const off of [-s * 0.26, s * 0.08]) {
      ctx.beginPath();
      ctx.moveTo(off - s * 0.16, -s * 0.32);
      ctx.lineTo(off + s * 0.16, 0);
      ctx.lineTo(off - s * 0.16, s * 0.32);
      ctx.stroke();
    }
  } else if (style === "dart") {
    ctx.lineWidth = Math.max(2, cell * 0.05);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, 0);
    ctx.lineTo(-s * 0.44, -s * 0.36);
    ctx.lineTo(-s * 0.2, 0);
    ctx.lineTo(-s * 0.44, s * 0.36);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  } else if (style === "round") {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(2.5, cell * 0.09);
    ctx.beginPath();
    ctx.moveTo(-s * 0.24, 0);
    ctx.lineTo(s * 0.2, 0);
    ctx.moveTo(s * 0.02, -s * 0.2);
    ctx.lineTo(s * 0.24, 0);
    ctx.lineTo(s * 0.02, s * 0.2);
    ctx.stroke();
  } else if (style === "pixel") {
    const p = s / 5;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if (PIXEL_ARROW[y]![x] !== "X") continue;
        ctx.fillRect(-s / 2 + x * p, -s / 2 + y * p, p + 0.5, p + 0.5);
      }
    }
  } else {
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
    ctx.lineWidth = Math.max(2.5, cell * 0.07);
    ctx.stroke();
    ctx.fill();
  }
  ctx.restore();
}

/** Lucchetto piccolo nell'angolo in alto a destra della casella. */
function drawLock(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, palette: Palette, open: number) {
  const r = Math.max(7, cell * 0.17);
  const cx = x + cell - r - 3;
  const cy = y + r + 3;
  ctx.save();
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const bw = r * 0.95;
  const bh = r * 0.7;
  ctx.fillStyle = palette.bg;
  ctx.beginPath();
  ctx.roundRect(cx - bw / 2, cy - bh * 0.15, bw, bh, 1.5);
  ctx.fill();
  ctx.strokeStyle = palette.bg;
  ctx.lineWidth = Math.max(1.4, r * 0.18);
  ctx.beginPath();
  ctx.arc(cx, cy - bh * 0.15 - open * r * 0.35, bw * 0.32, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
}

/** Anello con freccetta: indica che la freccia ruota di 90° in senso orario. */
function drawSpinRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number, palette: Palette, phase: number) {
  const r = cell * 0.43;
  const start = -Math.PI * 0.85 + phase;
  const end = start + Math.PI * 0.55;
  ctx.save();
  ctx.strokeStyle = palette.accent;
  ctx.fillStyle = palette.accent;
  ctx.lineWidth = Math.max(2, cell * 0.045);
  ctx.lineCap = "round";
  for (const off of [0, Math.PI]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, start + off, end + off);
    ctx.stroke();
    const tip = end + off;
    const tx = cx + Math.cos(tip) * r;
    const ty = cy + Math.sin(tip) * r;
    const hs = Math.max(4, cell * 0.08);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(tip + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(hs, 0);
    ctx.lineTo(-hs * 0.6, -hs * 0.8);
    ctx.lineTo(-hs * 0.6, hs * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Guscio della freccia doppia: cornice piena finché non viene colpita. */
function drawShell(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, palette: Palette, crack: number) {
  ctx.save();
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = Math.max(2.5, cell * 0.06);
  ctx.globalAlpha = 1 - crack;
  const inset = 4 + crack * 6;
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2, Math.min(12, cell * 0.22));
  ctx.stroke();
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
    const cx = ox + (arrow.x + 0.5) * cell + oxb;
    const cy = oy + (arrow.y + 0.5) * cell + oyb;
    const spinPulse = sim.pulses.find((p) => p.id === arrow.id && p.kind === "spin");
    const turn = spinPulse ? -(1 - easeOut(spinPulse.age / spinPulse.dur)) * (Math.PI / 2) : 0;
    const hitPulse = sim.pulses.find((p) => p.id === arrow.id && p.kind === "hit");
    const lockPulse = sim.pulses.find((p) => p.id === arrow.id && p.kind === "lock");
    if ((arrow.hp ?? 1) > 1) drawShell(ctx, ox + arrow.x * cell, oy + arrow.y * cell, cell, palette, 0);
    else if (hitPulse) drawShell(ctx, ox + arrow.x * cell, oy + arrow.y * cell, cell, palette, hitPulse.age / hitPulse.dur);
    if (arrow.spin) drawSpinRing(ctx, cx, cy, cell, palette, turn + (sim.reduce ? 0 : now / 2400));
    drawArrow(
      ctx,
      cx,
      cy,
      cell,
      arrow.dir,
      hinted ? palette.accent : palette.fg,
      Math.max(0.7, stretch),
      arrow.lock ? 0.42 : 1,
      turn,
      palette.arrow,
      palette.bg,
    );
    if (arrow.lock) drawLock(ctx, ox + arrow.x * cell, oy + arrow.y * cell, cell, palette, 0);
    else if (lockPulse) {
      ctx.save();
      ctx.globalAlpha = 1 - lockPulse.age / lockPulse.dur;
      drawLock(ctx, ox + arrow.x * cell, oy + arrow.y * cell, cell, palette, lockPulse.age / lockPulse.dur);
      ctx.restore();
    }
  }

  // Scia delle frecce che escono (spenta con prefers-reduced-motion).
  if (!sim.reduce) {
    for (const f of sim.flyers) {
      const t = Math.min(1, f.age / f.dur);
      const head = f.dist * cell * t * t;
      const tail = Math.max(0, head - cell * (1.2 + Math.min(f.combo, 8) * 0.25));
      if (head - tail < 1) continue;
      const sx0 = ox + (f.x + 0.5) * cell;
      const sy0 = oy + (f.y + 0.5) * cell;
      const x1 = sx0 + VX[f.dir] * tail;
      const y1 = sy0 + VY[f.dir] * tail;
      const x2 = sx0 + VX[f.dir] * head;
      const y2 = sy0 + VY[f.dir] * head;
      const color = f.combo > 2 ? palette.accent : palette.fg;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, color);
      ctx.save();
      ctx.globalAlpha = 0.55 * (1 - t * 0.6);
      ctx.strokeStyle = grad;
      ctx.lineCap = "round";
      ctx.lineWidth = cell * (f.combo > 2 ? 0.34 : 0.26);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }
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
      0,
      palette.arrow,
      palette.bg,
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

  if (sim.sweep) drawSweep(ctx, sim, palette, ox, oy, bw, bh, radius);
  ctx.restore();
}

/**
 * Spazzata luminosa quando la griglia si svuota: una banda di luce attraversa la tavola in diagonale.
 * Con prefers-reduced-motion la banda non si muove: la tavola si illumina e si spegne piano.
 */
function drawSweep(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  palette: Palette,
  ox: number,
  oy: number,
  bw: number,
  bh: number,
  radius: number,
) {
  const sweep = sim.sweep!;
  const t = Math.min(1, sweep.age / sweep.dur);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ox - 10, oy - 10, bw + 20, bh + 20, radius);
  ctx.clip();
  if (sim.reduce) {
    ctx.globalAlpha = 0.22 * Math.sin(t * Math.PI);
    ctx.fillStyle = palette.accent;
    ctx.fillRect(ox - 10, oy - 10, bw + 20, bh + 20);
    ctx.restore();
    return;
  }
  const span = bw + bh;
  const pos = -span * 0.35 + t * span * 1.7;
  const band = Math.max(40, span * 0.22);
  const x0 = ox + pos;
  const grad = ctx.createLinearGradient(x0 - band, oy, x0 + band, oy + band * 0.6);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.45, palette.accent);
  grad.addColorStop(0.5, palette.fg);
  grad.addColorStop(0.55, palette.accent);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = 0.8 * (1 - t * 0.5);
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(ox + bw / 2, oy + bh / 2);
  ctx.rotate(-0.35);
  ctx.translate(-(ox + bw / 2), -(oy + bh / 2));
  ctx.fillStyle = grad;
  ctx.fillRect(ox - span, oy - span, bw + span * 2, bh + span * 2);
  ctx.restore();
}
