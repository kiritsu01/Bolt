import { playExit, playHit, playMiss, playUnlock } from "./audio";
import { HAPTIC, vibrate } from "./haptics";
import {
  type Arrow,
  type Board,
  type Dir,
  type Spec,
  VX,
  VY,
  applyTap,
  canExit,
  exitLen,
  hintArrow,
  makeBoard,
  rayCells,
  rushSpec,
} from "./logic";
import { crossTime, flyDuration } from "./motion";

export type Mode = "campaign" | "daily" | "rush" | "challenge";

export type Layout = { ox: number; oy: number; cell: number };

export type Flyer = {
  id: number;
  x: number;
  y: number;
  dir: Dir;
  age: number;
  dur: number;
  dist: number;
  combo: number;
  /** Momento (tempo normalizzato) in cui passa il bordo: lì nascono le scintille. */
  cross: number;
  crossed: boolean;
};

/** Onda morbida che parte dalla casella da cui è uscita una freccia. */
export type Ring = { x: number; y: number; age: number; dur: number; accent: boolean };

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  dur: number;
  size: number;
  accent: boolean;
};

export type Floater = { x: number; y: number; text: string; age: number; dur: number };

export type Flash = {
  cells: Array<{ x: number; y: number; block: boolean }>;
  bad: boolean;
  age: number;
  dur: number;
};

export type Sim = {
  mode: Mode;
  level: number;
  spec: Spec;
  board: Board;
  flyers: Flyer[];
  rings: Ring[];
  bumpers: Array<{ id: number; age: number; dur: number }>;
  particles: Particle[];
  floaters: Floater[];
  flashes: Flash[];
  trauma: number;
  hintId: number | null;
  combo: number;
  lastExit: number;
  mistakes: number;
  hintsUsed: number;
  undos: number;
  /** Istantanee della griglia prima di ogni tocco riuscito (per Annulla). */
  undo: Array<{ arrows: Arrow[]; exited: number | null }>;
  /** Animazioni brevi: rotazioni (spin), sblocchi (lock), colpi sulle doppie (hit). */
  pulses: Array<{ id: number; kind: "spin" | "lock" | "hit"; age: number; dur: number }>;
  /** Nessuna freccia può uscire ma la griglia non è vuota (possibile con le rotanti). */
  stuck: boolean;
  /** Spazzata luminosa sulla griglia appena svuotata. */
  sweep: { age: number; dur: number } | null;
  /** Fine partita in attesa: il pannello arriva dopo la spazzata. */
  clearPending: boolean;
  finishedAt: number;
  timeLeft: number;
  deadline: number;
  paused: boolean;
  score: number;
  clears: number;
  runSeed: number;
  over: boolean;
  resolved: boolean;
  startedAt: number;
  coach: boolean;
  reduce: boolean;
  layout: Layout;
  hudAcc: number;
  /** Registro delle mosse per la condivisione: 0 errore, 1 uscita, 2 uscita in combo (x3 o più). */
  log: number[];
  maxCombo: number;
};

export type Emit = {
  hud: (sim: Sim) => void;
  clear: (sim: Sim) => void;
  over: (sim: Sim) => void;
  bank: (sim: Sim) => void;
};


export function freshSim(args: {
  mode: Mode;
  level: number;
  spec: Spec;
  reduce: boolean;
  runSeed?: number;
}): Sim {
  return {
    mode: args.mode,
    level: args.level,
    spec: args.spec,
    board: makeBoard(args.spec),
    flyers: [],
    rings: [],
    bumpers: [],
    particles: [],
    floaters: [],
    flashes: [],
    trauma: 0,
    hintId: null,
    combo: 0,
    lastExit: 0,
    mistakes: 0,
    hintsUsed: 0,
    undos: 0,
    undo: [],
    pulses: [],
    stuck: false,
    sweep: null,
    clearPending: false,
    finishedAt: 0,
    timeLeft: 45,
    deadline: 0,
    paused: false,
    score: 0,
    clears: 0,
    runSeed: args.runSeed ?? (Math.floor(Math.random() * 1e9) >>> 0),
    over: false,
    resolved: false,
    startedAt: performance.now(),
    coach: args.mode === "campaign" && (args.level <= 2 || (args.level > 15 && (args.level - 1) % 15 === 0)),
    reduce: args.reduce,
    layout: { ox: 16, oy: 16, cell: 56 },
    hudAcc: 0,
    log: [],
    maxCombo: 0,
  };
}

function burst(sim: Sim, cx: number, cy: number, big: boolean) {
  const { ox, oy, cell } = sim.layout;
  const x = ox + cx * cell;
  const y = oy + cy * cell;
  const n = big ? 28 : 8;
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = (big ? 80 : 40) + Math.random() * (big ? 180 : 90);
    sim.particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      age: 0,
      dur: 0.4 + Math.random() * 0.35,
      size: 2 + Math.random() * (big ? 4 : 3),
      accent: Math.random() > 0.45,
    });
  }
}

/** Scintille quando la freccia passa il bordo: poche, morbide, spinte nella direzione del volo. */
function spawnExit(sim: Sim, f: Flyer) {
  const { ox, oy, cell } = sim.layout;
  const distPx = (f.dist - 0.5) * cell;
  const x = ox + (f.x + 0.5) * cell + VX[f.dir] * distPx;
  const y = oy + (f.y + 0.5) * cell + VY[f.dir] * distPx;
  const n = sim.reduce ? 0 : 6 + Math.min(f.combo, 6);
  for (let i = 0; i < n; i++) {
    // Ventaglio stretto attorno alla direzione di uscita.
    const base = Math.atan2(VY[f.dir], VX[f.dir]);
    const ang = base + (Math.random() - 0.5) * 1.6;
    const sp = 60 + Math.random() * 140;
    sim.particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      age: 0,
      dur: 0.35 + Math.random() * 0.3,
      size: 2 + Math.random() * 2.5,
      accent: f.combo > 2 || Math.random() > 0.6,
    });
  }
}

function cellBurst(sim: Sim, arrow: Arrow, n: number, accent: boolean) {
  const { ox, oy, cell } = sim.layout;
  const x = ox + (arrow.x + 0.5) * cell;
  const y = oy + (arrow.y + 0.5) * cell;
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 80;
    sim.particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      age: 0,
      dur: 0.3 + Math.random() * 0.2,
      size: 2 + Math.random() * 2.5,
      accent,
    });
  }
}

export function tapArrow(sim: Sim, arrow: Arrow, now: number) {
  if (sim.over || sim.resolved) return;
  if (!sim.board.arrows.some((a) => a.id === arrow.id)) return;
  const res = applyTap(sim.board, arrow);
  const cells = arrow.lock ? [{ x: arrow.x, y: arrow.y, block: true }] : rayCells(sim.board, arrow);
  const ok = res.kind !== "miss";
  sim.flashes.push({ cells, bad: !ok, age: 0, dur: ok ? 0.26 : 0.34 });
  if (res.kind === "miss") {
    sim.mistakes += 1;
    sim.combo = 0;
    sim.log.push(0);
    sim.bumpers.push({ id: arrow.id, age: 0, dur: sim.reduce ? 0.08 : 0.18 });
    if (!sim.reduce) sim.trauma = Math.min(1, sim.trauma + 0.26);
    playMiss();
    vibrate(HAPTIC.miss);
    return;
  }
  sim.undo.push({ arrows: sim.board.arrows, exited: res.kind === "exit" ? arrow.id : null });
  sim.board = res.board;
  sim.coach = false;
  if (res.kind === "hit") {
    // Freccia doppia: primo tocco. Tiene viva la combo senza aumentarla.
    if (sim.combo > 0) sim.lastExit = now;
    sim.pulses.push({ id: arrow.id, kind: "hit", age: 0, dur: 0.3 });
    cellBurst(sim, arrow, 10, true);
    playHit();
    vibrate(6);
    return;
  }
  const combo = now - sim.lastExit < 1400 && sim.lastExit > 0 ? sim.combo + 1 : 1;
  sim.combo = combo;
  sim.maxCombo = Math.max(sim.maxCombo, combo);
  sim.log.push(combo >= 3 ? 2 : 1);
  sim.lastExit = now;
  sim.hintId = sim.hintId === arrow.id ? null : sim.hintId;
  for (const id of res.turned) sim.pulses.push({ id, kind: "spin", age: 0, dur: sim.reduce ? 0.01 : 0.2 });
  for (const id of res.unlocked) {
    sim.pulses.push({ id, kind: "lock", age: 0, dur: 0.35 });
    const a = res.board.arrows.find((o) => o.id === id);
    if (a) cellBurst(sim, a, 6, true);
  }
  if (res.turned.length) sim.hintId = null;
  const dist = exitLen(arrow.x, arrow.y, arrow.dir, sim.board.w, sim.board.h);
  sim.flyers.push({
    id: arrow.id,
    x: arrow.x,
    y: arrow.y,
    dir: arrow.dir,
    age: 0,
    dur: flyDuration(dist, sim.reduce),
    dist,
    combo,
    cross: crossTime(dist, sim.reduce),
    crossed: false,
  });
  if (!sim.reduce) sim.rings.push({ x: arrow.x, y: arrow.y, age: 0, dur: 0.42, accent: combo > 2 });
  if (sim.mode === "rush") sim.score += 100 * combo;
  sim.floaters.push({
    x: arrow.x + 0.5,
    y: arrow.y + 0.5,
    text: combo > 1 ? `x${combo}` : "",
    age: 0,
    dur: 0.65,
  });
  playExit(combo);
  if (res.unlocked.length) playUnlock();
  vibrate(combo >= 5 ? HAPTIC.tapHot : HAPTIC.tap);
}

export function tapCell(sim: Sim, x: number, y: number, now: number) {
  const arrow = sim.board.arrows.find((a) => a.x === x && a.y === y);
  if (!arrow) return false;
  tapArrow(sim, arrow, now);
  return true;
}

/** C'è già un indizio acceso su una freccia ancora in griglia. */
export function hintShowing(sim: Sim) {
  return sim.hintId != null && sim.board.arrows.some((a) => a.id === sim.hintId);
}

export function useHint(sim: Sim) {
  if (sim.over || sim.resolved || sim.mode === "rush") return false;
  if (hintShowing(sim)) return false;
  const pick = hintArrow(sim.board);
  if (!pick) return false;
  sim.hintId = pick.id;
  sim.hintsUsed += 1;
  return true;
}

export function useUndo(sim: Sim) {
  if (sim.over || sim.resolved || sim.mode === "rush") return;
  const snap = sim.undo.pop();
  if (!snap) return;
  sim.board = { ...sim.board, arrows: snap.arrows };
  if (snap.exited != null) sim.flyers = sim.flyers.filter((f) => f.id !== snap.exited);
  sim.pulses = [];
  sim.hintId = null;
  sim.undos += 1;
  sim.combo = 0;
}

export function step(sim: Sim, dt: number, now: number, emit: Emit) {
  if (sim.mode === "rush") {
    const hidden = typeof document !== "undefined" && document.hidden;
    if (hidden && !sim.paused) {
      sim.paused = true;
      if (sim.deadline) sim.timeLeft = Math.max(0, (sim.deadline - now) / 1000);
      sim.deadline = 0;
    } else if (!hidden && sim.paused && !sim.over) {
      sim.paused = false;
      sim.deadline = now + sim.timeLeft * 1000;
    }
  }

  if (sim.reduce) sim.trauma = 0;
  else sim.trauma = Math.max(0, sim.trauma - dt * 1.7);

  for (const f of sim.flyers) {
    f.age += dt;
    if (!f.crossed && f.age / f.dur >= f.cross) {
      f.crossed = true;
      spawnExit(sim, f);
    }
  }
  if (sim.flyers.some((f) => f.age >= f.dur)) sim.flyers = sim.flyers.filter((f) => f.age < f.dur);
  for (const r of sim.rings) r.age += dt;
  if (sim.rings.length) sim.rings = sim.rings.filter((r) => r.age < r.dur);
  for (const b of sim.bumpers) b.age += dt;
  sim.bumpers = sim.bumpers.filter((b) => b.age < b.dur);
  for (const p of sim.particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Attrito leggero: le scintille rallentano con grazia invece di cadere.
    const drag = Math.exp(-3.2 * dt);
    p.vx *= drag;
    p.vy *= drag;
  }
  sim.particles = sim.particles.filter((p) => p.age < p.dur);
  for (const f of sim.floaters) f.age += dt;
  sim.floaters = sim.floaters.filter((f) => f.age < f.dur);
  for (const f of sim.flashes) f.age += dt;
  sim.flashes = sim.flashes.filter((f) => f.age < f.dur);
  for (const p of sim.pulses) p.age += dt;
  sim.pulses = sim.pulses.filter((p) => p.age < p.dur);
  sim.stuck =
    sim.board.arrows.length > 0 && sim.flyers.length === 0 && !sim.board.arrows.some((a) => canExit(sim.board, a));

  const quiet = sim.board.arrows.length === 0 && sim.flyers.length === 0;
  if (quiet && !sim.over && !sim.resolved) {
    if (sim.mode === "rush") {
      sim.clears += 1;
      sim.score += 400 * sim.clears;
      const remain = sim.deadline ? Math.max(0, sim.deadline - now) : sim.timeLeft * 1000;
      sim.deadline = now + Math.min(60000, remain + 3000);
      sim.timeLeft = Math.max(0, (sim.deadline - now) / 1000);
      const spec = rushSpec(sim.clears, sim.runSeed);
      sim.spec = spec;
      sim.board = makeBoard(spec);
      sim.undo = [];
      sim.pulses = [];
      sim.hintId = null;
      sim.mistakes = 0;
      burst(sim, spec.w / 2, spec.h / 2, true);
      sim.sweep = { age: 0, dur: sim.reduce ? 0.3 : 0.55 };
      sim.floaters.push({ x: spec.w / 2, y: 0.4, text: "+3s", age: 0, dur: 0.75 });
      playExit(8);
      emit.bank(sim);
      emit.hud(sim);
    } else {
      sim.resolved = true;
      sim.finishedAt = now;
      sim.clearPending = true;
      sim.sweep = { age: 0, dur: sim.reduce ? 0.35 : 0.7 };
      burst(sim, (sim.board.w || sim.spec.w) / 2, (sim.board.h || sim.spec.h) / 2, true);
      // Suoni e vibrazioni di fine partita li decide il pannello: si festeggiano solo i successi veri.
    }
  }

  if (sim.sweep) {
    sim.sweep.age += dt;
    if (sim.clearPending && sim.sweep.age >= sim.sweep.dur * 0.8) {
      sim.clearPending = false;
      emit.clear(sim);
    }
    if (sim.sweep.age >= sim.sweep.dur) sim.sweep = null;
  }

  if (sim.mode === "rush" && !sim.paused && !sim.over && sim.flyers.length === 0 && sim.deadline) {
    sim.timeLeft = Math.max(0, (sim.deadline - now) / 1000);
    if (now >= sim.deadline) {
      sim.over = true;
      sim.timeLeft = 0;
      emit.over(sim);
    }
  }

  sim.hudAcc += dt;
  if (sim.hudAcc > 0.12) {
    sim.hudAcc = 0;
    emit.hud(sim);
  }
}
