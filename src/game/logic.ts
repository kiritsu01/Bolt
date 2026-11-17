export type Dir = 0 | 1 | 2 | 3;

export const VX = [0, 1, 0, -1] as const;
export const VY = [-1, 0, 1, 0] as const;

/**
 * Una freccia. Campi opzionali per le meccaniche dei capitoli:
 * - lock: bloccata, si libera quando esce una freccia adiacente (capitolo 2);
 * - spin: ruota di 90° in senso orario quando esce una freccia adiacente (capitolo 3);
 * - hp: tocchi che servono per farla uscire, 2 per le frecce doppie (capitolo 4).
 */
export type Arrow = { id: number; x: number; y: number; dir: Dir; lock?: boolean; spin?: boolean; hp?: number };

/** Meccanica di un livello: 0 base, 1 bloccate, 2 rotanti, 3 doppie. */
export type Mech = 0 | 1 | 2 | 3;

export type Board = { w: number; h: number; arrows: Arrow[] };

export type Spec = {
  w: number;
  h: number;
  count: number;
  seed: number;
  mech?: Mech;
};

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const FIXED: Record<number, Board> = {
  [-1]: {
    w: 3,
    h: 3,
    arrows: [
      { id: 1, x: 1, y: 0, dir: 0 },
      { id: 2, x: 2, y: 1, dir: 1 },
      { id: 3, x: 1, y: 2, dir: 2 },
      { id: 4, x: 0, y: 1, dir: 3 },
    ],
  },
  [-2]: {
    w: 4,
    h: 3,
    arrows: [
      { id: 1, x: 0, y: 1, dir: 1 },
      { id: 2, x: 1, y: 1, dir: 1 },
      { id: 3, x: 2, y: 1, dir: 1 },
      { id: 4, x: 3, y: 1, dir: 1 },
      { id: 5, x: 1, y: 0, dir: 0 },
      { id: 6, x: 2, y: 2, dir: 2 },
    ],
  },
};

export function key(x: number, y: number) {
  return y * 32 + x;
}

export function inBounds(x: number, y: number, w: number, h: number) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

export function hash32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cloneBoard(board: Board): Board {
  return {
    w: board.w,
    h: board.h,
    arrows: board.arrows.map((a) => ({ ...a })),
  };
}

export function pathClear(
  x: number,
  y: number,
  dir: Dir,
  w: number,
  h: number,
  occ: Set<number>,
) {
  let cx = x + VX[dir];
  let cy = y + VY[dir];
  while (inBounds(cx, cy, w, h)) {
    if (occ.has(key(cx, cy))) return false;
    cx += VX[dir];
    cy += VY[dir];
  }
  return true;
}

/** Corsia libera fino al bordo (non considera il lucchetto). */
export function laneClear(board: Board, arrow: Arrow) {
  const occ = new Set(board.arrows.map((a) => key(a.x, a.y)));
  return pathClear(arrow.x, arrow.y, arrow.dir, board.w, board.h, occ);
}

/** La freccia può essere toccata con successo: corsia libera e nessun lucchetto. */
export function canExit(board: Board, arrow: Arrow) {
  return !arrow.lock && laneClear(board, arrow);
}

export function adjacent(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/**
 * Fa uscire una freccia: la toglie, libera le bloccate adiacenti e ruota di 90°
 * (senso orario) le rotanti adiacenti. Restituisce una nuova griglia.
 */
export function applyExit(board: Board, arrow: Arrow): Board {
  const arrows: Arrow[] = [];
  for (const a of board.arrows) {
    if (a.id === arrow.id) continue;
    if (adjacent(a, arrow) && (a.lock || a.spin)) {
      const next = { ...a };
      if (next.lock) next.lock = false;
      if (next.spin) next.dir = ((next.dir + 1) % 4) as Dir;
      arrows.push(next);
    } else arrows.push(a);
  }
  return { w: board.w, h: board.h, arrows };
}

export type TapResult =
  | { kind: "miss" }
  | { kind: "hit"; board: Board }
  | { kind: "exit"; board: Board; turned: number[]; unlocked: number[] };

/** Effetto di un tocco: errore, colpo su una freccia doppia o uscita. */
export function applyTap(board: Board, arrow: Arrow): TapResult {
  if (!canExit(board, arrow)) return { kind: "miss" };
  if ((arrow.hp ?? 1) > 1) {
    return {
      kind: "hit",
      board: {
        ...board,
        arrows: board.arrows.map((a) => (a.id === arrow.id ? { ...a, hp: (a.hp ?? 1) - 1 } : a)),
      },
    };
  }
  const near = board.arrows.filter((a) => a.id !== arrow.id && adjacent(a, arrow));
  return {
    kind: "exit",
    board: applyExit(board, arrow),
    turned: near.filter((a) => a.spin).map((a) => a.id),
    unlocked: near.filter((a) => a.lock).map((a) => a.id),
  };
}

export function freeArrows(board: Board) {
  return board.arrows.filter((a) => canExit(board, a));
}

export function exitLen(x: number, y: number, dir: Dir, w: number, h: number) {
  if (dir === 0) return y + 1;
  if (dir === 2) return h - y;
  if (dir === 3) return x + 1;
  return w - x;
}

function wouldBlock(
  ax: number,
  ay: number,
  dir: Dir,
  nx: number,
  ny: number,
  occ: Set<number>,
  w: number,
  h: number,
) {
  let cx = ax + VX[dir];
  let cy = ay + VY[dir];
  while (inBounds(cx, cy, w, h)) {
    if (cx === nx && cy === ny) return true;
    if (occ.has(key(cx, cy))) return false;
    cx += VX[dir];
    cy += VY[dir];
  }
  return false;
}

export function generate(w: number, h: number, count: number, seed: number, maxFree = 2): Board {
  const rng = mulberry32(seed || 1);
  const occ = new Set<number>();
  const arrows: Arrow[] = [];
  let id = 1;
  const target = Math.min(count, w * h - 1);
  const keys = Math.max(1, Math.min(maxFree, 3));

  const candidates = () => {
    const opts: Array<{ x: number; y: number; dir: Dir; blocks: number; len: number }> = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (occ.has(key(x, y))) continue;
        for (const dir of [0, 1, 2, 3] as Dir[]) {
          if (!pathClear(x, y, dir, w, h, occ)) continue;
          let blocks = 0;
          for (const a of arrows) {
            if (wouldBlock(a.x, a.y, a.dir, x, y, occ, w, h)) blocks++;
          }
          opts.push({ x, y, dir, blocks, len: exitLen(x, y, dir, w, h) });
        }
      }
    }
    return opts;
  };

  const place = (pick: { x: number; y: number; dir: Dir }) => {
    occ.add(key(pick.x, pick.y));
    arrows.push({ id: id++, x: pick.x, y: pick.y, dir: pick.dir });
  };

  const score = (o: { blocks: number; len: number }) => o.blocks * 10 + Math.min(o.len, 6);
  const pickFrom = (pool: Array<{ x: number; y: number; dir: Dir; blocks: number; len: number }>, slack: number) => {
    let best = -1;
    for (const o of pool) best = Math.max(best, score(o));
    const top = pool.filter((o) => score(o) >= best - slack);
    return top[Math.floor(rng() * top.length)]!;
  };

  let guard = 0;
  while (arrows.length < target && guard++ < w * h) {
    const long = candidates().filter((o) => o.len >= 2);
    if (!long.length) break;
    place(pickFrom(long, 2));
  }

  let keysLeft = keys;
  while (keysLeft > 0 && arrows.length < w * h - 1) {
    const pool = candidates();
    if (!pool.length) break;
    const blocking = pool.filter((o) => o.blocks > 0);
    place(pickFrom(blocking.length ? blocking : pool, 0));
    keysLeft -= 1;
  }

  let squeeze = 0;
  while (squeeze++ < w * h) {
    if (freeArrows({ w, h, arrows }).length <= maxFree) break;
    const blockers = candidates().filter((o) => o.blocks >= 2);
    if (!blockers.length) break;
    place(pickFrom(blockers, 0));
  }

  const blocksSomeone = (arrow: Arrow) => {
    for (const other of arrows) {
      if (other.id === arrow.id) continue;
      if (wouldBlock(other.x, other.y, other.dir, arrow.x, arrow.y, occ, w, h)) return true;
    }
    return false;
  };

  let cull = 0;
  while (cull++ < w * h && freeArrows({ w, h, arrows }).length > maxFree) {
    const loose = freeArrows({ w, h, arrows }).filter((a) => !blocksSomeone(a));
    if (!loose.length) break;
    loose.sort((a, b) => b.id - a.id);
    const drop = loose[0]!;
    occ.delete(key(drop.x, drop.y));
    const idx = arrows.findIndex((a) => a.id === drop.id);
    if (idx >= 0) arrows.splice(idx, 1);
  }

  return { w, h, arrows };
}

export function makeBoard(spec: Spec): Board {
  const fixed = FIXED[spec.seed];
  if (fixed) return cloneBoard(fixed);
  const maxFree = spec.w <= 4 ? 3 : spec.count < 16 ? 3 : 2;
  const base = generate(spec.w, spec.h, spec.count, spec.seed >>> 0, maxFree);
  return spec.mech ? decorate(base, spec.mech, spec.seed >>> 0) : base;
}

/** Livelli per capitolo. */
export const CHAPTER_SIZE = 15;
/** Capitoli con una meccanica propria (dal quinto in poi le meccaniche si alternano). */
export const CHAPTER_COUNT = 5;

/** Indice del capitolo (0 = primo) di un livello. */
export function chapterIndex(level: number) {
  return Math.min(CHAPTER_COUNT - 1, Math.floor((Math.max(1, level) - 1) / CHAPTER_SIZE));
}

/** Meccanica di un livello della campagna. */
export function mechForLevel(level: number): Mech {
  const ch = chapterIndex(level);
  if (ch < 4) return ch as Mech;
  return ((level % 3) + 1) as Mech;
}

export function campaignSpec(level: number): Spec {
  if (level <= 1) return { w: 3, h: 3, count: 4, seed: -1 };
  if (level === 2) return { w: 4, h: 3, count: 6, seed: -2 };
  const seed = hash32(`bolt-camp-v1:${level}`);
  if (level <= CHAPTER_SIZE) {
    // Primo capitolo: identico alla versione originale (stessi livelli, stesse stelle).
    const size = Math.min(8, 4 + Math.floor((level - 3) / 3));
    const fill = Math.min(0.62, 0.4 + (level - 3) * 0.01);
    const count = Math.min(size * size - 2, Math.max(6, Math.round(size * size * fill)));
    return { w: size, h: size, count, seed };
  }
  // Dal secondo capitolo: si riparte da griglie piccole per imparare la meccanica nuova.
  const i = (level - 1) % CHAPTER_SIZE;
  const late = chapterIndex(level) >= 4 ? 1 : 0;
  const size = Math.min(8, 5 + Math.floor(i / 4) + late);
  const fill = Math.min(0.6, 0.42 + i * 0.012 + late * 0.04);
  const count = Math.min(size * size - 2, Math.max(6, Math.round(size * size * fill)));
  return { w: size, h: size, count, seed, mech: mechForLevel(level) };
}

/** Ordine di uscita trovato togliendo sempre la prima freccia libera (griglie senza meccaniche). */
export function greedyOrder(board: Board): Arrow[] {
  let b = cloneBoard(board);
  const order: Arrow[] = [];
  let guard = 0;
  while (b.arrows.length && guard++ < 400) {
    const free = b.arrows.find((a) => canExit(b, a));
    if (!free) break;
    order.push(free);
    b = applyExit(b, free);
  }
  return order;
}

/**
 * Aggiunge la meccanica del capitolo a una griglia base risolvibile, partendo da un ordine
 * di uscita valido, così il livello resta risolvibile per costruzione:
 * - bloccate: solo frecce con un vicino che esce prima di loro;
 * - rotanti: la direzione iniziale è girata all'indietro di tante volte quanti vicini escono prima;
 * - doppie: qualsiasi freccia (serve solo un tocco in più).
 */
export function decorate(base: Board, mech: Mech, seed: number): Board {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0 || 7);
  const order = greedyOrder(base);
  if (order.length !== base.arrows.length) return base;
  const rank = new Map(order.map((a, i) => [a.id, i]));
  const earlier = (a: Arrow) =>
    base.arrows.filter((o) => adjacent(o, a) && rank.get(o.id)! < rank.get(a.id)!).length;
  const shuffle = <T,>(list: T[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
    return list;
  };
  const n = base.arrows.length;
  const board = cloneBoard(base);
  if (mech === 3) {
    const picks = shuffle([...board.arrows]).slice(0, Math.max(1, Math.round(n * 0.3)));
    for (const a of picks) a.hp = 2;
    return board;
  }
  if (mech === 1) {
    const pool = shuffle(board.arrows.filter((a) => earlier(a) > 0));
    for (const a of pool.slice(0, Math.max(1, Math.round(n * 0.32)))) a.lock = true;
    return board;
  }
  const pool = shuffle(board.arrows.filter((a) => earlier(a) > 0));
  let picks = pool.slice(0, Math.min(7, Math.max(1, Math.round(n * 0.25))));
  while (picks.length) {
    const out = cloneBoard(base);
    for (const a of out.arrows) {
      if (!picks.some((p) => p.id === a.id)) continue;
      a.spin = true;
      a.dir = (((a.dir - earlier(a)) % 4) + 4) % 4 as Dir;
    }
    if (isSolvable(out)) return out;
    picks = picks.slice(0, -1);
  }
  return base;
}

export function dailySpec(date: string): Spec {
  return { w: 6, h: 6, count: 22, seed: hash32(`bolt-daily-v1:${date}`) };
}

export function rushSpec(index: number, runSeed: number): Spec {
  const size = Math.min(7, 4 + Math.floor(index / 2));
  const fill = Math.min(0.62, 0.4 + index * 0.03);
  const count = Math.min(size * size - 2, Math.max(6, Math.round(size * size * fill)));
  return { w: size, h: size, count, seed: (runSeed + index * 997) >>> 0 };
}

/** Un'uscita è "sicura" se non fa ruotare nessuno: allora farla subito non può mai nuocere. */
function safeExit(board: Board, arrow: Arrow) {
  return !board.arrows.some((o) => o.spin && adjacent(o, arrow));
}

function stateKey(board: Board) {
  return board.arrows
    .map((a) => `${a.id}.${a.dir}${a.lock ? "L" : ""}`)
    .sort()
    .join(",");
}

/**
 * Cerca un ordine di uscite che svuota la griglia. Le uscite sicure si fanno subito
 * (senza rotanti la ricerca è lineare); si esplorano le alternative solo quando un'uscita
 * fa ruotare qualche freccia. Le frecce doppie non cambiano la risolvibilità.
 * Restituisce gli id nell'ordine, oppure null se non c'è soluzione (o il budget finisce).
 */
export function solve(board: Board, budget = 60000): number[] | null {
  const seen = new Set<string>();
  let nodes = 0;
  const rec = (start: Board): number[] | null => {
    if (++nodes > budget) return null;
    let b = start;
    const path: number[] = [];
    for (;;) {
      const safe = b.arrows.find((a) => canExit(b, a) && safeExit(b, a));
      if (!safe) break;
      path.push(safe.id);
      b = applyExit(b, safe);
    }
    if (!b.arrows.length) return path;
    const k = stateKey(b);
    if (seen.has(k)) return null;
    seen.add(k);
    for (const m of b.arrows) {
      if (!canExit(b, m)) continue;
      const rest = rec(applyExit(b, m));
      if (rest) return [...path, m.id, ...rest];
      if (nodes > budget) return null;
    }
    return null;
  };
  return rec(cloneBoard(board));
}

export function isSolvable(board: Board) {
  return solve(board) !== null;
}

/** Freccia da suggerire: può uscire e lascia la griglia ancora risolvibile. */
export function hintArrow(board: Board): Arrow | null {
  const free = board.arrows.filter((a) => canExit(board, a));
  if (!free.length) return null;
  const doubles = free.filter((a) => (a.hp ?? 1) > 1);
  const pool = [...doubles, ...free.filter((a) => (a.hp ?? 1) <= 1)];
  for (const a of pool) {
    if ((a.hp ?? 1) > 1 || safeExit(board, a)) return a;
    if (isSolvable(applyExit(board, a))) return a;
  }
  return free[0]!;
}

export function encodeSpec(spec: Spec): string | null {
  if (spec.seed < 0) return null;
  if (spec.w < 3 || spec.h < 3 || spec.w > 10 || spec.h > 10) return null;
  let n = BigInt(spec.mech ?? 0);
  n = (n << 32n) | BigInt(spec.seed >>> 0);
  n = (n << 4n) | BigInt(spec.w);
  n = (n << 4n) | BigInt(spec.h);
  n = (n << 8n) | BigInt(Math.max(0, Math.min(255, spec.count)));
  let s = "";
  for (let i = 0; i < 10; i++) {
    s = ALPH[Number(n & 31n)] + s;
    n >>= 5n;
  }
  return s;
}

export function decodeSpec(code: string | undefined | null): Spec | null {
  if (!code) return null;
  const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, "");
  if (clean.length !== 10) return null;
  let n = 0n;
  for (const ch of clean) {
    const i = ALPH.indexOf(ch);
    if (i < 0) return null;
    n = (n << 5n) | BigInt(i);
  }
  const count = Number(n & 255n);
  n >>= 8n;
  const h = Number(n & 15n);
  n >>= 4n;
  const w = Number(n & 15n);
  n >>= 4n;
  const seed = Number(n & 0xffffffffn);
  n >>= 32n;
  const mech = Number(n & 3n) as Mech;
  if (w < 3 || h < 3 || w > 10 || h > 10) return null;
  if (count < 1 || count > w * h) return null;
  return mech ? { w, h, count, seed, mech } : { w, h, count, seed };
}

export function rayCells(board: Board, arrow: Arrow) {
  const occ = new Map(board.arrows.map((a) => [key(a.x, a.y), a]));
  const cells: Array<{ x: number; y: number; block: boolean }> = [];
  let cx = arrow.x + VX[arrow.dir];
  let cy = arrow.y + VY[arrow.dir];
  while (inBounds(cx, cy, board.w, board.h)) {
    const hit = occ.get(key(cx, cy));
    cells.push({ x: cx, y: cy, block: Boolean(hit) });
    if (hit) break;
    cx += VX[arrow.dir];
    cy += VY[arrow.dir];
  }
  return cells;
}

export function starsFor(mistakes: number, hints: number, undos: number) {
  const penalty = mistakes + hints + undos;
  if (penalty <= 0) return 3;
  if (penalty <= 2) return 2;
  return 1;
}

export function todayKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function yesterdayKey(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() - 1);
  return todayKey(dt);
}
