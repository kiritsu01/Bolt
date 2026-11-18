import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUZZLE_BENCH,
  compactBytes,
  duration,
  funnel,
  groupPrefs,
  kpis,
  pct,
  ratingStats,
  releaseImpact,
  releasesInRange,
  retentionAverages,
  retentionTone,
  trend,
  viralCoefficient,
  type DailyRow,
  type Summary,
} from "../src/tracker/metrics";

const summary: Summary = {
  active_cur: 40,
  active_prev: 25,
  d1_size_cur: 20,
  d1_back_cur: 7,
  d1_size_prev: 10,
  d1_back_prev: 4,
  rating_sum_cur: 18,
  rating_n_cur: 4,
  rating_sum_prev: 0,
  rating_n_prev: 0,
  invited_new_cur: 6,
  invited_new_prev: 5,
};

test("numeri chiave con freccia rispetto alla settimana prima", () => {
  const [active, d1, rating, viral] = kpis(summary);
  assert.deepEqual([active!.value, active!.prev, active!.change, active!.trend], [40, 25, 15, "up"]);
  assert.equal(d1!.value, 0.35);
  assert.equal(d1!.prev, 0.4);
  assert.equal(d1!.trend, "down");
  assert.equal(rating!.value, 4.5);
  assert.equal(rating!.prev, null);
  assert.equal(rating!.trend, "none", "senza dati della settimana prima niente freccia");
  assert.equal(viral!.value, 6 / 40);
  assert.equal(viral!.trend, "down", "0,15 contro 0,20");
});

test("freccia piatta sotto la soglia", () => {
  assert.equal(trend(0.351, 0.35, 0.005), "flat");
  assert.equal(trend(5, 5, 0), "flat");
  assert.equal(trend(null, 3), "none");
});

test("ritenzione per coorte: medie pesate solo sulle coorti già misurabili, confronto con i puzzle", () => {
  const cohorts = [
    { day: "2026-11-18", size: 50, d1: 0, d7: 0, d1_ready: false, d7_ready: false },
    { day: "2026-11-17", size: 10, d1: 4, d7: 0, d1_ready: true, d7_ready: false },
    { day: "2026-11-10", size: 30, d1: 9, d7: 3, d1_ready: true, d7_ready: true },
  ];
  const r = retentionAverages(cohorts);
  assert.equal(r.d1, 13 / 40);
  assert.equal(r.d7, 3 / 30);
  assert.equal(retentionTone(0.4, PUZZLE_BENCH.d1), "good");
  assert.equal(retentionTone(0.28, PUZZLE_BENCH.d1), "ok");
  assert.equal(retentionTone(0.1, PUZZLE_BENCH.d1), "low");
  assert.equal(retentionTone(null, PUZZLE_BENCH.d7), "na");
  assert.deepEqual(retentionAverages([]), { d1: null, d7: null });
});

test("imbuto dei livelli: arrivo dal livello prima, completamento, livello peggiore", () => {
  const row = (level: number, players: number, starts: number, ends: number) => ({
    level,
    players,
    starts,
    ends,
    quits: starts - ends,
    avg_mistakes: 1,
    avg_ms: 30000,
    avg_hints: 0,
    avg_stars: 2.5,
  });
  const f = funnel([row(3, 80, 90, 85), row(1, 100, 110, 100), row(2, 95, 100, 98), row(4, 40, 60, 30)]);
  assert.deepEqual(
    f.map((s) => s.level),
    [1, 2, 3, 4],
  );
  assert.equal(f[0]!.reach, null);
  assert.equal(f[1]!.reach, 0.95);
  assert.equal(f[3]!.reach, 0.5);
  assert.equal(f[3]!.completion, 0.5);
  assert.deepEqual(
    f.filter((s) => s.worst).map((s) => s.level),
    [4],
    "si molla soprattutto al livello 4",
  );
});

test("rilasci: confronto 7 giorni prima vs dopo e linee sui grafici", () => {
  const daily: DailyRow[] = [];
  for (let i = 0; i < 20; i++) {
    const day = new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
    const after = i > 9;
    daily.push({ day, active: after ? 20 : 10, new: 1, returning: 0, sessions: 10, avg_session_s: after ? 300 : 200, errors: after ? 0 : 2, level_ends: 5 });
  }
  const releases = [
    { version: "abc1234", date: "2026-11-10T18:00:00+01:00", title: "Effetti", notes: "" },
    { version: "def5678", date: "2026-11-19T09:00:00+01:00", title: "Duello", notes: "" },
    { version: "old0000", date: "2026-10-01T09:00:00+01:00", title: "Vecchio", notes: "" },
  ];
  const [r] = releaseImpact(releases, daily);
  assert.equal(r!.before.active, 10);
  assert.equal(r!.after.active, 20);
  assert.equal(r!.before.session, 200);
  assert.equal(r!.after.session, 300);
  assert.equal(r!.before.errorRate, 0.2);
  assert.equal(r!.after.errorRate, 0);
  assert.equal(r!.complete, true);
  assert.equal(releaseImpact(releases, daily)[1]!.complete, false, "troppo recente");
  assert.deepEqual(
    releasesInRange(releases, daily).map((x) => x.version),
    ["abc1234", "def5678"],
  );
});

test("valutazioni, risposte alle domande, coefficiente virale e formati", () => {
  const r = ratingStats({ "5": 3, "4": 1, "2": 1 });
  assert.equal(r.n, 5);
  assert.equal(r.avg, (15 + 4 + 2) / 5);
  assert.equal(r.dist.length, 5);
  const g = groupPrefs([
    { question: "mode_pref", answer: "Livelli", n: 2 },
    { question: "mode_pref", answer: "Duelli", n: 6 },
    { question: "play_time", answer: "Sera", n: 1 },
  ]);
  assert.equal(g[0]!.answers[0]!.answer, "Duelli");
  assert.equal(g[0]!.answers[0]!.share, 0.75);
  assert.equal(viralCoefficient(3, 30), 0.1);
  assert.equal(viralCoefficient(3, 0), null);
  assert.equal(pct(0.314), "31%");
  assert.equal(pct(null), "–");
  assert.equal(duration(125), "2m 05s");
  assert.equal(duration(42), "42s");
  assert.equal(compactBytes(512_000), "500 KB");
});
