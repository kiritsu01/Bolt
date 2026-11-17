import { playClear, playExit, playMiss } from "./audio";
import {
  type Arrow,
  type Board,
  type Dir,
  type Spec,
  VX,
  VY,
  canExit,
  exitLen,
  freeArrows,
  makeBoard,
  rayCells,
  rushSpec,
} from "./logic";

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
};

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
  undo: Arrow[];
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
};

export type Emit = {
  hud: (sim: Sim) => void;
  clear: (sim: Sim) => void;
  over: (sim: Sim) => void;
  bank: (sim: Sim) => void;
};

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

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
    timeLeft: 45,
    deadline: 0,
    paused: false,
    score: 0,
    clears: 0,
    runSeed: args.runSeed ?? (Math.floor(Math.random() * 1e9) >>> 0),
    over: false,
    resolved: false,
    startedAt: performance.now(),
    coach: args.mode === "campaign" && args.level <= 2,
    reduce: args.reduce,
    layout: { ox: 16, oy: 16, cell: 56 },
    hudAcc: 0,
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

function spawnExit(sim: Sim, f: Flyer) {
  const { ox, oy, cell } = sim.layout;
  const distPx = f.dist * cell;
  const x = ox + (f.x + 0.5) * cell + VX[f.dir] * distPx;
  const y = oy + (f.y + 0.5) * cell + VY[f.dir] * distPx;
  for (let i = 0; i < 8; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 30 + Math.random() * 100;
    sim.particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp + VX[f.dir] * 70,
      vy: Math.sin(ang) * sp + VY[f.dir] * 70,
      age: 0,
      dur: 0.28 + Math.random() * 0.22,
      size: 2 + Math.random() * 3,
      accent: f.combo > 2 || Math.random() > 0.55,
    });
  }
}

export function tapArrow(sim: Sim, arrow: Arrow, now: number) {
  if (sim.over || sim.resolved) return;
  if (!sim.board.arrows.some((a) => a.id === arrow.id)) return;
  const cells = rayCells(sim.board, arrow);
  const ok = canExit(sim.board, arrow);
  sim.flashes.push({ cells, bad: !ok, age: 0, dur: ok ? 0.26 : 0.34 });
  if (!ok) {
    sim.mistakes += 1;
    sim.combo = 0;
    sim.bumpers.push({ id: arrow.id, age: 0, dur: sim.reduce ? 0.08 : 0.18 });
    if (!sim.reduce) sim.trauma = Math.min(1, sim.trauma + 0.42);
    playMiss();
    vibrate([10, 28, 14]);
    return;
  }
  const combo = now - sim.lastExit < 1400 && sim.lastExit > 0 ? sim.combo + 1 : 1;
  sim.combo = combo;
  sim.lastExit = now;
  sim.coach = false;
  sim.hintId = sim.hintId === arrow.id ? null : sim.hintId;
  const dist = exitLen(arrow.x, arrow.y, arrow.dir, sim.board.w, sim.board.h);
  sim.board = {
    ...sim.board,
    arrows: sim.board.arrows.filter((a) => a.id !== arrow.id),
  };
  sim.flyers.push({
    id: arrow.id,
    x: arrow.x,
    y: arrow.y,
    dir: arrow.dir,
    age: 0,
    dur: (sim.reduce ? 0.1 : 0.15) + dist * 0.028,
    dist,
    combo,
  });
  sim.undo.push(arrow);
  if (sim.mode === "rush") sim.score += 100 * combo;
  sim.floaters.push({
    x: arrow.x + 0.5,
    y: arrow.y + 0.5,
    text: combo > 1 ? `x${combo}` : "",
    age: 0,
    dur: 0.65,
  });
  playExit(combo);
  vibrate(combo > 3 ? 16 : 8);
}

export function tapCell(sim: Sim, x: number, y: number, now: number) {
  const arrow = sim.board.arrows.find((a) => a.x === x && a.y === y);
  if (!arrow) return false;
  tapArrow(sim, arrow, now);
  return true;
}

export function useHint(sim: Sim) {
  if (sim.over || sim.resolved || sim.mode === "rush") return;
  const free = freeArrows(sim.board);
  if (!free.length) return;
  const pick = free[Math.floor(Math.random() * free.length)]!;
  sim.hintId = pick.id;
  sim.hintsUsed += 1;
}

export function useUndo(sim: Sim) {
  if (sim.over || sim.resolved || sim.mode === "rush") return;
  const arrow = sim.undo.pop();
  if (!arrow) return;
  if (sim.board.arrows.some((a) => a.x === arrow.x && a.y === arrow.y)) return;
  sim.board = { ...sim.board, arrows: [...sim.board.arrows, arrow] };
  sim.flyers = sim.flyers.filter((f) => f.id !== arrow.id);
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

  for (const f of sim.flyers) f.age += dt;
  const landed = sim.flyers.filter((f) => f.age >= f.dur);
  if (landed.length) {
    for (const f of landed) spawnExit(sim, f);
    sim.flyers = sim.flyers.filter((f) => f.age < f.dur);
  }
  for (const b of sim.bumpers) b.age += dt;
  sim.bumpers = sim.bumpers.filter((b) => b.age < b.dur);
  for (const p of sim.particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 30 * dt;
  }
  sim.particles = sim.particles.filter((p) => p.age < p.dur);
  for (const f of sim.floaters) f.age += dt;
  sim.floaters = sim.floaters.filter((f) => f.age < f.dur);
  for (const f of sim.flashes) f.age += dt;
  sim.flashes = sim.flashes.filter((f) => f.age < f.dur);

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
      sim.hintId = null;
      sim.mistakes = 0;
      burst(sim, spec.w / 2, spec.h / 2, true);
      sim.floaters.push({ x: spec.w / 2, y: 0.4, text: "+3s", age: 0, dur: 0.75 });
      playExit(8);
      emit.bank(sim);
      emit.hud(sim);
    } else {
      sim.resolved = true;
      burst(sim, (sim.board.w || sim.spec.w) / 2, (sim.board.h || sim.spec.h) / 2, true);
      playClear();
      vibrate([12, 40, 20]);
      emit.clear(sim);
    }
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
