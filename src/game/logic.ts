export type Dir = 0 | 1 | 2 | 3;

export const VX = [0, 1, 0, -1] as const;
export const VY = [-1, 0, 1, 0] as const;

export type Arrow = { id: number; x: number; y: number; dir: Dir };

export type Board = { w: number; h: number; arrows: Arrow[] };

export type Spec = {
  w: number;
  h: number;
  count: number;
  seed: number;
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

export function canExit(board: Board, arrow: Arrow) {
  const occ = new Set(board.arrows.map((a) => key(a.x, a.y)));
  return pathClear(arrow.x, arrow.y, arrow.dir, board.w, board.h, occ);
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
  return generate(spec.w, spec.h, spec.count, spec.seed >>> 0, maxFree);
}

export function campaignSpec(level: number): Spec {
  if (level <= 1) return { w: 3, h: 3, count: 4, seed: -1 };
  if (level === 2) return { w: 4, h: 3, count: 6, seed: -2 };
  const size = Math.min(8, 4 + Math.floor((level - 3) / 3));
  const fill = Math.min(0.62, 0.4 + (level - 3) * 0.01);
  const count = Math.min(size * size - 2, Math.max(6, Math.round(size * size * fill)));
  return { w: size, h: size, count, seed: hash32(`bolt-camp-v1:${level}`) };
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

export function isSolvable(board: Board) {
  const b = cloneBoard(board);
  let guard = 0;
  while (b.arrows.length && guard++ < 400) {
    const free = b.arrows.find((a) => canExit(b, a));
    if (!free) return false;
    b.arrows = b.arrows.filter((a) => a.id !== free.id);
  }
  return b.arrows.length === 0;
}

export function encodeSpec(spec: Spec): string | null {
  if (spec.seed < 0) return null;
  if (spec.w < 3 || spec.h < 3 || spec.w > 10 || spec.h > 10) return null;
  let n = BigInt(spec.seed >>> 0);
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
  if (w < 3 || h < 3 || w > 10 || h > 10) return null;
  if (count < 1 || count > w * h) return null;
  return { w, h, count, seed };
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
