import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Board,
  applyTap,
  campaignSpec,
  canExit,
  chapterIndex,
  decodeSpec,
  encodeSpec,
  hintArrow,
  isSolvable,
  makeBoard,
  mechForLevel,
  solve,
} from "../src/game/logic";

const level = (n: number) => makeBoard(campaignSpec(n));

test("capitoli da 15 livelli con la meccanica giusta", () => {
  assert.equal(chapterIndex(1), 0);
  assert.equal(chapterIndex(15), 0);
  assert.equal(chapterIndex(16), 1);
  assert.equal(chapterIndex(31), 2);
  assert.equal(chapterIndex(46), 3);
  assert.equal(chapterIndex(200), 4);
  assert.equal(mechForLevel(10), 0);
  assert.equal(mechForLevel(20), 1);
  assert.equal(mechForLevel(40), 2);
  assert.equal(mechForLevel(50), 3);
  assert.ok([1, 2, 3].includes(mechForLevel(70)));
});

test("ogni livello generato (1-120) è risolvibile e ha la sua meccanica", () => {
  for (let n = 1; n <= 120; n++) {
    const b = level(n);
    assert.ok(isSolvable(b), `livello ${n} non risolvibile`);
    const mech = mechForLevel(n);
    if (n <= 15) assert.ok(b.arrows.every((a) => !a.lock && !a.spin && !a.hp), `livello ${n}`);
    if (mech === 1 && n > 15) assert.ok(b.arrows.some((a) => a.lock), `livello ${n} senza bloccate`);
    if (mech === 2 && n > 15) assert.ok(b.arrows.some((a) => a.spin), `livello ${n} senza rotanti`);
    if (mech === 3 && n > 15) assert.ok(b.arrows.some((a) => a.hp === 2), `livello ${n} senza doppie`);
    assert.ok(b.arrows.some((a) => canExit(b, a)), `livello ${n}: nessuna mossa iniziale`);
  }
});

test("i livelli di prima restano identici (salvataggi e stelle valgono ancora)", () => {
  const spec = campaignSpec(9);
  assert.equal(spec.mech, undefined);
  assert.equal(spec.w, 6);
});

test("freccia bloccata: errore finché non esce una vicina", () => {
  const b: Board = {
    w: 3,
    h: 1,
    arrows: [
      { id: 1, x: 0, y: 0, dir: 0 },
      { id: 2, x: 1, y: 0, dir: 0, lock: true },
    ],
  };
  assert.equal(applyTap(b, b.arrows[1]!).kind, "miss");
  const r = applyTap(b, b.arrows[0]!);
  assert.equal(r.kind, "exit");
  if (r.kind !== "exit") return;
  assert.deepEqual(r.unlocked, [2]);
  assert.equal(r.board.arrows[0]!.lock, false);
  assert.equal(applyTap(r.board, r.board.arrows[0]!).kind, "exit");
});

test("freccia rotante: gira di 90° in senso orario quando esce una vicina", () => {
  const b: Board = {
    w: 3,
    h: 3,
    arrows: [
      { id: 1, x: 1, y: 0, dir: 0 },
      { id: 2, x: 1, y: 1, dir: 3, spin: true },
      { id: 3, x: 2, y: 2, dir: 1, spin: true },
    ],
  };
  const r = applyTap(b, b.arrows[0]!);
  assert.equal(r.kind, "exit");
  if (r.kind !== "exit") return;
  assert.deepEqual(r.turned, [2]);
  assert.equal(r.board.arrows.find((a) => a.id === 2)!.dir, 0);
  assert.equal(r.board.arrows.find((a) => a.id === 3)!.dir, 1, "non adiacente: non ruota");
});

test("il risolutore trova le trappole delle rotanti", () => {
  // La rotante (id 2) guarda a sinistra, dove la freccia 1 la blocca.
  const ok: Board = {
    w: 2,
    h: 2,
    arrows: [
      { id: 1, x: 0, y: 0, dir: 2 },
      { id: 2, x: 1, y: 0, dir: 3, spin: true },
    ],
  };
  // 1 scende ed esce; la 2 ruota da sinistra a su ed esce.
  assert.deepEqual(solve(ok), [1, 2]);
  // Due frecce che si guardano in faccia (con una terza in mezzo): nessuna soluzione.
  const dead: Board = {
    w: 1,
    h: 3,
    arrows: [
      { id: 1, x: 0, y: 0, dir: 2 },
      { id: 2, x: 0, y: 1, dir: 2 },
      { id: 3, x: 0, y: 2, dir: 0 },
    ],
  };
  assert.equal(isSolvable(dead), false);
});

test("freccia doppia: il primo tocco la incrina, il secondo la fa uscire", () => {
  const b: Board = { w: 2, h: 1, arrows: [{ id: 1, x: 0, y: 0, dir: 0, hp: 2 }] };
  const r1 = applyTap(b, b.arrows[0]!);
  assert.equal(r1.kind, "hit");
  if (r1.kind !== "hit") return;
  assert.equal(r1.board.arrows[0]!.hp, 1);
  assert.equal(applyTap(r1.board, r1.board.arrows[0]!).kind, "exit");
});

test("l'indizio non porta mai in un vicolo cieco", () => {
  for (let n = 31; n <= 45; n++) {
    let b = level(n);
    let guard = 0;
    while (b.arrows.length && guard++ < 200) {
      const pick = hintArrow(b);
      assert.ok(pick, `livello ${n}: nessun indizio`);
      const r = applyTap(b, pick!);
      assert.notEqual(r.kind, "miss");
      if (r.kind !== "miss") b = r.board;
    }
    assert.equal(b.arrows.length, 0, `livello ${n} non svuotato seguendo gli indizi`);
  }
});

test("il codice sfida porta con sé la meccanica", () => {
  for (const n of [20, 40, 55, 70]) {
    const spec = campaignSpec(n);
    const back = decodeSpec(encodeSpec(spec));
    assert.deepEqual(back, spec);
    assert.deepEqual(makeBoard(back!), makeBoard(spec));
  }
  // I codici vecchi (senza meccanica) restano validi.
  const old = campaignSpec(12);
  assert.deepEqual(decodeSpec(encodeSpec(old)), old);
});
