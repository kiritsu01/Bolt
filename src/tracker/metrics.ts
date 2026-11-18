/**
 * Calcoli del Tracker a partire dai dati grezzi delle funzioni SQL (supabase/tracker.sql).
 * Tutto puro e testato: l'app si limita a mostrare il risultato.
 */

/** Medie di riferimento dei giochi puzzle per la ritenzione (giorno 1, 7, 30). */
export const PUZZLE_BENCH = { d1: 0.31, d7: 0.11, d30: 0.05 } as const;

export type Summary = {
  active_cur: number;
  active_prev: number;
  d1_size_cur: number;
  d1_back_cur: number;
  d1_size_prev: number;
  d1_back_prev: number;
  rating_sum_cur: number;
  rating_n_cur: number;
  rating_sum_prev: number;
  rating_n_prev: number;
  invited_new_cur: number;
  invited_new_prev: number;
};

export type Trend = "up" | "down" | "flat" | "none";

export type Kpi = {
  id: "active" | "d1" | "rating" | "viral";
  value: number | null;
  prev: number | null;
  /** Variazione rispetto alla settimana prima (assoluta). */
  change: number | null;
  trend: Trend;
};

export const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** Freccia su/giù: "flat" se la variazione è sotto la soglia, "none" se manca un termine di paragone. */
export function trend(cur: number | null, prev: number | null, threshold = 0.0001): Trend {
  if (cur === null || prev === null) return "none";
  const d = cur - prev;
  if (Math.abs(d) <= threshold) return "flat";
  return d > 0 ? "up" : "down";
}

function kpi(id: Kpi["id"], value: number | null, prev: number | null, threshold?: number): Kpi {
  return { id, value, prev, change: value !== null && prev !== null ? value - prev : null, trend: trend(value, prev, threshold) };
}

/**
 * I 4 numeri chiave della scheda Oggi (ultimi 7 giorni contro i 7 precedenti):
 * attivi, ritenzione G1, valutazione media, coefficiente virale (nuovi arrivati da un invito / attivi).
 */
export function kpis(s: Summary): Kpi[] {
  return [
    kpi("active", s.active_cur, s.active_prev, 0),
    kpi("d1", ratio(s.d1_back_cur, s.d1_size_cur), ratio(s.d1_back_prev, s.d1_size_prev), 0.005),
    kpi("rating", ratio(s.rating_sum_cur, s.rating_n_cur), ratio(s.rating_sum_prev, s.rating_n_prev), 0.05),
    kpi("viral", ratio(s.invited_new_cur, s.active_cur), ratio(s.invited_new_prev, s.active_prev), 0.005),
  ];
}

export type Cohort = { day: string; size: number; d1: number; d7: number; d1_ready: boolean; d7_ready: boolean };

/** Ritenzione media pesata sulle coorti già misurabili (null se nessuna). */
export function retentionAverages(cohorts: Cohort[]) {
  let s1 = 0;
  let b1 = 0;
  let s7 = 0;
  let b7 = 0;
  for (const c of cohorts) {
    if (c.d1_ready) {
      s1 += c.size;
      b1 += c.d1;
    }
    if (c.d7_ready) {
      s7 += c.size;
      b7 += c.d7;
    }
  }
  return { d1: ratio(b1, s1), d7: ratio(b7, s7) };
}

/** Colore della cella: confronto con la media dei puzzle (buono / nella media / sotto). */
export function retentionTone(rate: number | null, bench: number): "good" | "ok" | "low" | "na" {
  if (rate === null) return "na";
  if (rate >= bench * 1.1) return "good";
  if (rate >= bench * 0.8) return "ok";
  return "low";
}

export type LevelRow = {
  level: number;
  players: number;
  starts: number;
  ends: number;
  quits: number;
  avg_mistakes: number | null;
  avg_ms: number | null;
  avg_hints: number | null;
  avg_stars: number | null;
};

export type FunnelStep = LevelRow & {
  /** Quanti giocatori arrivati al livello precedente sono arrivati a questo (0..1). */
  reach: number | null;
  /** Partite finite su partite iniziate (0..1). */
  completion: number | null;
  /** Il livello dove si perde più gente. */
  worst: boolean;
};

/** Imbuto dei livelli: dove mollano. */
export function funnel(rows: LevelRow[]): FunnelStep[] {
  const sorted = [...rows].sort((a, b) => a.level - b.level);
  const steps: FunnelStep[] = sorted.map((r, i) => {
    const prev = i > 0 ? sorted[i - 1]! : null;
    const reach = prev && prev.level === r.level - 1 && prev.players > 0 ? Math.min(1, r.players / prev.players) : null;
    return { ...r, reach, completion: ratio(r.ends, r.starts), worst: false };
  });
  let worst: FunnelStep | null = null;
  for (const s of steps) {
    if (s.reach === null || s.players + 0 < 1) continue;
    if (!worst || s.reach < worst.reach!) worst = s;
  }
  if (worst && worst.reach! < 1) worst.worst = true;
  return steps;
}

export type DailyRow = {
  day: string;
  active: number;
  new: number;
  returning: number;
  sessions: number;
  avg_session_s: number;
  errors: number;
  level_ends: number;
};

export type Release = { version: string; date: string; title: string; notes: string };

export type ReleaseImpact = {
  release: Release;
  before: { active: number | null; session: number | null; errorRate: number | null };
  after: { active: number | null; session: number | null; errorRate: number | null };
  /** Ci sono abbastanza giorni dopo il rilascio per un confronto completo. */
  complete: boolean;
};

function dayOf(iso: string) {
  return iso.slice(0, 10);
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Confronto "7 giorni prima vs 7 giorni dopo" per ogni rilascio (giorno del rilascio escluso). */
export function releaseImpact(releases: Release[], daily: DailyRow[]): ReleaseImpact[] {
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const lastDay = daily.length ? daily[daily.length - 1]!.day : "";
  const window = (from: string, to: string) => {
    const rows: DailyRow[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const r = byDay.get(d);
      if (r) rows.push(r);
    }
    const sessions = rows.reduce((n, r) => n + r.sessions, 0);
    const errors = rows.reduce((n, r) => n + r.errors, 0);
    const withSessions = rows.filter((r) => r.avg_session_s > 0);
    return {
      active: avg(rows.map((r) => r.active)),
      session: avg(withSessions.map((r) => r.avg_session_s)),
      errorRate: ratio(errors, sessions),
    };
  };
  return releases.map((release) => {
    const d = dayOf(release.date);
    return {
      release,
      before: window(addDays(d, -7), addDays(d, -1)),
      after: window(addDays(d, 1), addDays(d, 7)),
      complete: lastDay !== "" && addDays(d, 7) <= lastDay,
    };
  });
}

/** Rilasci che cadono dentro una serie giornaliera (per le linee verticali sui grafici). */
export function releasesInRange(releases: Release[], daily: DailyRow[]) {
  if (!daily.length) return [];
  const first = daily[0]!.day;
  const last = daily[daily.length - 1]!.day;
  return releases.filter((r) => dayOf(r.date) >= first && dayOf(r.date) <= last);
}

/** Distribuzione delle valutazioni 1-5 con media. */
export function ratingStats(ratings: Record<string, number>) {
  const dist = [1, 2, 3, 4, 5].map((k) => ({ stars: k, n: Number(ratings[String(k)] ?? 0) }));
  const n = dist.reduce((a, b) => a + b.n, 0);
  const sum = dist.reduce((a, b) => a + b.stars * b.n, 0);
  return { dist, n, avg: ratio(sum, n) };
}

/** Raggruppa le risposte alle domande veloci: per domanda, risposte ordinate con quota. */
export function groupPrefs(rows: Array<{ question: string; answer: string; n: number }>) {
  const map = new Map<string, Array<{ answer: string; n: number }>>();
  for (const r of rows) map.set(r.question, [...(map.get(r.question) ?? []), { answer: r.answer, n: r.n }]);
  return [...map.entries()].map(([question, answers]) => {
    const total = answers.reduce((a, b) => a + b.n, 0);
    return {
      question,
      total,
      answers: answers.sort((a, b) => b.n - a.n).map((a) => ({ ...a, share: ratio(a.n, total) ?? 0 })),
    };
  });
}

/** Coefficiente virale del periodo: nuovi arrivati da un invito diviso giocatori attivi. */
export function viralCoefficient(invitedNew: number, active: number) {
  return ratio(invitedNew, active);
}

export function pct(x: number | null, digits = 0) {
  return x === null ? "–" : `${(x * 100).toFixed(digits)}%`;
}

export function duration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "–";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export function compactBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
