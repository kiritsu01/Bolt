import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Code2,
  Lightbulb,
  LogOut,
  Minus,
  Plus,
  RefreshCw,
  Rocket,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  AuthError,
  api,
  currentSession,
  sendLogin,
  signOut,
  takeSessionFromUrl,
  verifyCode,
  type BuildInfo,
  type Breakdown,
  type ErrorRow,
  type Feedback,
  type Growth,
  type LiveEvent,
  type RoadItem,
  type Session,
  type Sources,
  type VersionRow,
} from "./api";
import { Bars, Empty, LineChart, StackBars, type Marker } from "./charts";
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
  viralCoefficient,
  type Cohort,
  type DailyRow,
  type Kpi,
  type LevelRow,
  type Release,
  type Summary,
} from "./metrics";

type Tab = "oggi" | "giocatori" | "crescita" | "sviluppo" | "idee";
type Period = 1 | 7 | 30;

const TABS: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "oggi", label: "Oggi", icon: <Activity className="size-5" /> },
  { id: "giocatori", label: "Giocatori", icon: <Users className="size-5" /> },
  { id: "crescita", label: "Crescita", icon: <TrendingUp className="size-5" /> },
  { id: "sviluppo", label: "Sviluppo", icon: <Code2 className="size-5" /> },
  { id: "idee", label: "Idee", icon: <Lightbulb className="size-5" /> },
];

const C = { a: "#ff7a3d", b: "#7ce8ff", c: "#ff5ca8", d: "#b9a6ff", e: "#ffd166" };

const QUESTION_LABELS: Record<string, string> = {
  fav_chapter: "Capitolo preferito",
  mode_pref: "Livelli o duelli",
  play_time: "Quando gioca",
  would_buy: "Comprerebbe extra",
  discovery: "Come ha conosciuto BOLT",
};

const EVENT_LABELS: Record<string, string> = {
  app_open: "apre il gioco",
  session_end: "chiude",
  level_start: "inizia un livello",
  level_end: "finisce un livello",
  level_quit: "abbandona",
  daily_played: "gioca la Sfida di oggi",
  rush_end: "finisce un Rush",
  duel_created: "crea un duello",
  duel_accepted: "accetta un duello",
  duel_finished: "finisce un duello",
  duel_rematch: "chiede la rivincita",
  challenge_shared: "condivide una sfida",
  challenge_opened: "apre una sfida",
  invite_shared: "invita un amico",
  friend_invite_opened: "apre un invito",
  shop_purchase: "compra nel negozio",
  pwa_installed: "installa l'app",
  js_error: "errore JS",
  perf: "prestazioni",
  feedback: "valuta il gioco",
  pref: "risponde a una domanda",
};

/** Carica dati asincroni con stato di caricamento ed errore; ricarica quando cambiano le dipendenze. */
function useData<T>(load: () => Promise<T>, deps: unknown[], onAuth: () => void) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof AuthError) onAuth();
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((n) => n + 1) };
}

export function TrackerApp() {
  const [session, setSession] = useState<Session | null>(() => currentSession());
  const [linkError, setLinkError] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem("tracker-tab") as Tab) || "oggi");
  const [period, setPeriod] = useState<Period>(7);

  useEffect(() => {
    const s = takeSessionFromUrl();
    if (s === "error") setLinkError(true);
    else if (s) setSession(s);
  }, []);

  useEffect(() => {
    if (!session) return;
    api
      .summary()
      .then((s) => setAllowed(s !== null))
      .catch((e) => {
        if (e instanceof AuthError) setSession(null);
        else setAllowed(true); // rete giù: si prova lo stesso, le schede mostrano l'errore
      });
  }, [session]);

  const logout = useCallback(() => {
    void signOut();
    setSession(null);
    setAllowed(null);
  }, []);

  if (!session) return <Login linkError={linkError} onIn={setSession} />;
  if (allowed === false)
    return (
      <Shell>
        <section className="tr-glass tr-center">
          <h1 className="tr-h1">Accesso non autorizzato</h1>
          <p className="tr-muted">L'email {session.email} non è tra quelle ammesse al Tracker.</p>
          <button type="button" className="tr-btn" onClick={logout}>
            <LogOut className="size-4" /> Esci
          </button>
        </section>
      </Shell>
    );

  const pick = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("tracker-tab", t);
    } catch {
      /* nulla */
    }
    window.scrollTo({ top: 0 });
  };

  return (
    <Shell>
      <header className="tr-top">
        <div>
          <p className="tr-kicker">Tracker Razvan</p>
          <h1 className="tr-h1">{TABS.find((t) => t.id === tab)!.label}</h1>
        </div>
        <button type="button" className="tr-icon-btn" aria-label="Esci" onClick={logout}>
          <LogOut className="size-5" />
        </button>
      </header>
      <div className="tr-period" role="radiogroup" aria-label="Periodo">
        {([1, 7, 30] as Period[]).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={period === p} className={period === p ? "is-on" : ""} onClick={() => setPeriod(p)}>
            {p === 1 ? "Oggi" : `${p} giorni`}
          </button>
        ))}
      </div>
      <main className="tr-main">
        {tab === "oggi" ? <TodayTab onAuth={logout} /> : null}
        {tab === "giocatori" ? <PlayersTab period={period} onAuth={logout} /> : null}
        {tab === "crescita" ? <GrowthTab period={period} onAuth={logout} /> : null}
        {tab === "sviluppo" ? <DevTab period={period} onAuth={logout} /> : null}
        {tab === "idee" ? <IdeasTab period={period} onAuth={logout} /> : null}
      </main>
      <nav className="tr-tabs" aria-label="Schede">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? "is-on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => pick(t.id)}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="tr-shell">
      <div className="tr-sky" aria-hidden="true">
        <i className="tr-blob is-a" />
        <i className="tr-blob is-b" />
        <i className="tr-blob is-c" />
      </div>
      {children}
    </div>
  );
}

// --- Accesso ---------------------------------------------------------------------------

function Login({ linkError, onIn }: { linkError: boolean; onIn: (s: Session) => void }) {
  const [email, setEmail] = useState(() => localStorage.getItem("tracker-email") ?? "");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(linkError ? "Il link è scaduto o già usato: chiedine uno nuovo." : "");

  async function send() {
    setBusy(true);
    setMsg("");
    try {
      localStorage.setItem("tracker-email", email.trim());
    } catch {
      /* nulla */
    }
    const ok = await sendLogin(email.trim()).catch(() => false);
    setBusy(false);
    if (ok) setSent(true);
    else setMsg("Non riesco a mandare l'email. Controlla l'indirizzo (deve essere quello autorizzato) e la rete.");
  }

  async function check() {
    setBusy(true);
    const s = await verifyCode(email.trim(), code.trim()).catch(() => null);
    setBusy(false);
    if (s) onIn(s);
    else setMsg("Codice non valido o scaduto.");
  }

  return (
    <Shell>
      <section className="tr-glass tr-login">
        <TrackerMark />
        <h1 className="tr-h1">Tracker Razvan</h1>
        <p className="tr-muted">Il centro di controllo di BOLT.</p>
        {!sent ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email.includes("@")) void send();
            }}
          >
            <input
              className="tr-input"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="La tua email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email"
            />
            <button type="submit" className="tr-btn is-primary" disabled={busy || !email.includes("@")}>
              {busy ? "Invio…" : "Mandami il link"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().length >= 6) void check();
            }}
          >
            <p className="tr-muted">
              Ti ho scritto a <b>{email}</b>. Tocca il link nell'email, oppure scrivi qui il codice (utile se usi l'app installata su iPhone).
            </p>
            <input
              className="tr-input tr-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Codice"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              aria-label="Codice"
            />
            <button type="submit" className="tr-btn is-primary" disabled={busy || code.trim().length < 6}>
              {busy ? "Controllo…" : "Entra"}
            </button>
            <button type="button" className="tr-btn is-quiet" onClick={() => setSent(false)}>
              Cambia email
            </button>
          </form>
        )}
        {msg ? <p className="tr-error">{msg}</p> : null}
      </section>
    </Shell>
  );
}

function TrackerMark() {
  return (
    <svg className="tr-mark" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="trg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#ff5ca8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#trg)" />
      <rect x="14" y="34" width="8" height="16" rx="3" fill="#fff" opacity=".9" />
      <rect x="28" y="24" width="8" height="26" rx="3" fill="#fff" opacity=".9" />
      <rect x="42" y="14" width="8" height="36" rx="3" fill="#ffd166" />
    </svg>
  );
}

// --- Elementi comuni -----------------------------------------------------------------------

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="tr-glass tr-card">
      <header className="tr-card-head">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function State({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) return <p className="tr-empty">Carico…</p>;
  if (error)
    return (
      <p className="tr-error">
        Non riesco a leggere i dati ({error.slice(0, 80)}).{" "}
        <button type="button" className="tr-link" onClick={onRetry}>
          Riprova
        </button>
      </p>
    );
  return null;
}

function Arrow({ k }: { k: Kpi }) {
  if (k.trend === "up") return <ArrowUp className="size-4" />;
  if (k.trend === "down") return <ArrowDown className="size-4" />;
  if (k.trend === "flat") return <ArrowRight className="size-4" />;
  return <Minus className="size-4" />;
}

const KPI_INFO: Record<Kpi["id"], { label: string; fmt: (v: number | null) => string; sub: string }> = {
  active: { label: "Attivi 7 giorni", fmt: (v) => (v === null ? "–" : String(v)), sub: "giocatori diversi" },
  d1: { label: "Ritenzione G1", fmt: (v) => pct(v), sub: `media puzzle ${pct(PUZZLE_BENCH.d1)}` },
  rating: { label: "Valutazione", fmt: (v) => (v === null ? "–" : `${v.toFixed(1)} ★`), sub: "media su 5" },
  viral: { label: "Coefficiente virale", fmt: (v) => (v === null ? "–" : v.toFixed(2)), sub: "nuovi da inviti / attivi" },
};

// --- Oggi ---------------------------------------------------------------------------------

function TodayTab({ onAuth }: { onAuth: () => void }) {
  const sum = useData(() => api.summary(), [], onAuth);
  const live = useData(() => api.live(), [], onAuth);
  useEffect(() => {
    const id = window.setInterval(() => live.reload(), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ks = sum.data ? kpis(sum.data as Summary) : [];
  return (
    <>
      <div className="tr-kpis">
        {ks.length
          ? ks.map((k) => (
              <div key={k.id} className={`tr-glass tr-kpi is-${k.trend}`}>
                <p className="tr-kpi-label">{KPI_INFO[k.id].label}</p>
                <p className="tr-kpi-value">{KPI_INFO[k.id].fmt(k.value)}</p>
                <p className="tr-kpi-trend">
                  <Arrow k={k} />
                  {k.prev === null ? "nessun confronto" : `prima ${KPI_INFO[k.id].fmt(k.prev)}`}
                </p>
                <p className="tr-kpi-sub">{KPI_INFO[k.id].sub}</p>
              </div>
            ))
          : null}
      </div>
      <State loading={sum.loading} error={sum.error} onRetry={sum.reload} />
      <Card
        title="In diretta · ultimi 50 eventi"
        action={
          <button type="button" className="tr-icon-btn is-small" aria-label="Aggiorna" onClick={live.reload}>
            <RefreshCw className="size-4" />
          </button>
        }
      >
        <State loading={live.loading && !live.data} error={live.error} onRetry={live.reload} />
        {live.data ? <LiveFeed events={live.data} /> : null}
      </Card>
    </>
  );
}

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}g`;
}

function eventDetail(e: LiveEvent) {
  const p = e.props ?? {};
  const bits: string[] = [];
  if (p.level !== undefined) bits.push(`liv. ${p.level}`);
  if (p.stars !== undefined) bits.push(`${p.stars}★`);
  if (p.source && e.name === "app_open") bits.push(String(p.source));
  if (p.device && e.name === "app_open") bits.push(String(p.device));
  if (p.result) bits.push(String(p.result));
  if (p.rating !== undefined) bits.push(`${p.rating}★`);
  if (p.answer) bits.push(String(p.answer));
  if (p.message) bits.push(String(p.message).slice(0, 40));
  if (p.seconds !== undefined) bits.push(duration(Number(p.seconds)));
  return bits.join(" · ");
}

function LiveFeed({ events }: { events: LiveEvent[] }) {
  if (!events.length) return <Empty />;
  return (
    <ol className="tr-feed">
      {events.map((e, i) => (
        <li key={`${e.created_at}-${i}`} className={e.name === "js_error" ? "is-error" : undefined}>
          <span className="tr-feed-dot" style={{ background: `hsl(${parseInt(e.player_id.slice(0, 6), 16) % 360} 80% 65%)` }} />
          <span className="tr-feed-main">
            <b>{EVENT_LABELS[e.name] ?? e.name}</b>
            <small>{eventDetail(e)}</small>
          </span>
          <span className="tr-feed-time">{ago(e.created_at)}</span>
        </li>
      ))}
    </ol>
  );
}

// --- Giocatori -----------------------------------------------------------------------------

const chartDays = (p: Period) => Math.max(p, 7);

function PlayersTab({ period, onAuth }: { period: Period; onAuth: () => void }) {
  const daily = useData(() => api.daily(chartDays(period)), [period], onAuth);
  const cohorts = useData(() => api.cohorts(30), [], onAuth);
  const brk = useData(() => api.breakdown(period), [period], onAuth);
  const rows = (daily.data ?? []) as DailyRow[];
  const days = rows.map((r) => r.day);
  const last = rows.slice(-period);
  const totals = {
    active: last.reduce((n, r) => Math.max(n, r.active), 0),
    newp: last.reduce((n, r) => n + r.new, 0),
    sessions: last.reduce((n, r) => n + r.sessions, 0),
  };
  const withS = last.filter((r) => r.avg_session_s > 0);
  const avgSession = withS.length ? withS.reduce((n, r) => n + r.avg_session_s, 0) / withS.length : null;
  const cs = (cohorts.data ?? []) as Cohort[];
  const avgs = retentionAverages(cs);
  return (
    <>
      <div className="tr-stats">
        <Stat label="Picco attivi/giorno" value={String(totals.active)} />
        <Stat label="Nuovi" value={String(totals.newp)} />
        <Stat label="Sessioni" value={String(totals.sessions)} />
        <Stat label="Durata media" value={duration(avgSession)} />
      </div>
      <Card title="Attivi al giorno">
        <State loading={daily.loading} error={daily.error} onRetry={daily.reload} />
        {rows.length ? <LineChart days={days} series={[{ label: "Attivi", color: C.a, values: rows.map((r) => r.active) }]} /> : null}
      </Card>
      <Card title="Nuovi e di ritorno">
        {rows.length ? (
          <StackBars
            days={days}
            parts={[
              { label: "Nuovi", color: C.b, values: rows.map((r) => r.new) },
              { label: "Di ritorno", color: C.d, values: rows.map((r) => r.returning) },
            ]}
          />
        ) : null}
      </Card>
      <Card title="Sessioni e durata">
        {rows.length ? (
          <LineChart
            days={days}
            series={[
              { label: "Sessioni", color: C.e, values: rows.map((r) => r.sessions) },
              { label: "Durata media (s)", color: C.c, values: rows.map((r) => (r.avg_session_s > 0 ? r.avg_session_s : null)) },
            ]}
          />
        ) : null}
      </Card>
      <Card title="Ritenzione per coorte">
        <State loading={cohorts.loading} error={cohorts.error} onRetry={cohorts.reload} />
        <div className="tr-bench">
          <span>
            G1 <b>{pct(avgs.d1)}</b> <small>puzzle {pct(PUZZLE_BENCH.d1)}</small>
          </span>
          <span>
            G7 <b>{pct(avgs.d7)}</b> <small>puzzle {pct(PUZZLE_BENCH.d7)}</small>
          </span>
          <span>
            G30 <b>–</b> <small>puzzle {pct(PUZZLE_BENCH.d30)}</small>
          </span>
        </div>
        {cs.length ? (
          <table className="tr-table tr-cohorts">
            <thead>
              <tr>
                <th>Primo giorno</th>
                <th>Giocatori</th>
                <th>G1</th>
                <th>G7</th>
              </tr>
            </thead>
            <tbody>
              {cs.map((c) => {
                const r1 = c.d1_ready ? c.d1 / Math.max(1, c.size) : null;
                const r7 = c.d7_ready ? c.d7 / Math.max(1, c.size) : null;
                return (
                  <tr key={c.day}>
                    <td>{c.day.slice(5).split("-").reverse().join("/")}</td>
                    <td>{c.size}</td>
                    <td className={`tone-${retentionTone(r1, PUZZLE_BENCH.d1)}`}>{pct(r1)}</td>
                    <td className={`tone-${retentionTone(r7, PUZZLE_BENCH.d7)}`}>{pct(r7)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : !cohorts.loading ? (
          <Empty />
        ) : null}
      </Card>
      <Card title="Dispositivi">
        <State loading={brk.loading} error={brk.error} onRetry={brk.reload} />
        {brk.data ? <BreakdownView data={brk.data as Breakdown} /> : null}
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tr-glass tr-stat">
      <p>{label}</p>
      <b>{value}</b>
    </div>
  );
}

const BRK_LABELS: Record<string, string> = { device: "Sistema", browser: "Browser", pwa: "App installata", lang: "Lingua" };
const VAL_LABELS: Record<string, string> = { ios: "iPhone/iPad", android: "Android", desktop: "Computer", true: "Sì", false: "No", "?": "n.d." };

function BreakdownView({ data }: { data: Breakdown }) {
  const keys = ["device", "pwa", "browser", "lang"].filter((k) => data[k]?.length);
  if (!keys.length) return <Empty />;
  return (
    <div className="tr-grid2">
      {keys.map((k) => (
        <div key={k}>
          <h3 className="tr-h3">{BRK_LABELS[k]}</h3>
          <Bars items={data[k]!.map((i) => ({ label: VAL_LABELS[i.k] ?? i.k, value: i.n }))} color={C.b} />
        </div>
      ))}
    </div>
  );
}

// --- Crescita ------------------------------------------------------------------------------

function GrowthTab({ period, onAuth }: { period: Period; onAuth: () => void }) {
  const src = useData(() => api.sources(period), [period], onAuth);
  const gr = useData(() => api.growth(period), [period], onAuth);
  const s = src.data as Sources | null;
  const g = gr.data as Growth | null;
  const c = g?.counts ?? {};
  const k = g ? viralCoefficient(g.invited_new, g.active) : null;
  return (
    <>
      <div className="tr-stats">
        <Stat label="Coefficiente virale" value={k === null ? "–" : k.toFixed(2)} />
        <Stat label="Nuovi da inviti" value={String(g?.invited_new ?? "–")} />
        <Stat label="Inviti mandati" value={String(c.invite_shared ?? 0)} />
        <Stat label="Inviti aperti" value={String(c.friend_invite_opened ?? 0)} />
      </div>
      <Card title="Fonti di traffico">
        <State loading={src.loading} error={src.error} onRetry={src.reload} />
        {s ? (
          <Bars
            items={s.sources.map((x) => ({ label: x.source, value: x.players, note: `${x.opens} aperture` }))}
            format={(v) => `${v} nuovi`}
          />
        ) : null}
      </Card>
      {s?.campaigns.length ? (
        <Card title="Campagne (utm_campaign)">
          <Bars items={s.campaigns.map((x) => ({ label: `${x.campaign} · ${x.source}`, value: x.players }))} color={C.c} format={(v) => `${v} nuovi`} />
        </Card>
      ) : null}
      <Card title="Duelli">
        <State loading={gr.loading} error={gr.error} onRetry={gr.reload} />
        <Bars
          items={[
            { label: "Creati", value: c.duel_created ?? 0 },
            { label: "Accettati", value: c.duel_accepted ?? 0 },
            { label: "Finiti", value: c.duel_finished ?? 0 },
            { label: "Rivincite", value: c.duel_rematch ?? 0 },
          ]}
          color={C.d}
        />
        {g && Object.keys(g.duel_results).length ? (
          <p className="tr-muted tr-small">
            Esiti: {Object.entries(g.duel_results).map(([r, n]) => `${r} ${n}`).join(" · ")}
          </p>
        ) : null}
      </Card>
      <Card title="Sfide e inviti">
        <Bars
          items={[
            { label: "Sfide condivise", value: c.challenge_shared ?? 0 },
            { label: "Sfide aperte", value: c.challenge_opened ?? 0 },
            { label: "Inviti mandati", value: c.invite_shared ?? 0 },
            { label: "Inviti aperti", value: c.friend_invite_opened ?? 0 },
            { label: "Sfide di oggi giocate", value: c.daily_played ?? 0 },
          ]}
          color={C.e}
        />
        {g && Object.keys(g.invite_kinds).length ? (
          <p className="tr-muted tr-small">
            Nuovi giocatori arrivati da: {Object.entries(g.invite_kinds).map(([kk, n]) => `${kk} ${n}`).join(" · ")}
          </p>
        ) : null}
      </Card>
    </>
  );
}

// --- Sviluppo ------------------------------------------------------------------------------

function DevTab({ period, onAuth }: { period: Period; onAuth: () => void }) {
  const lv = useData(() => api.levels(Math.max(period, 30)), [period], onAuth);
  const daily = useData(() => api.daily(90), [], onAuth);
  const rel = useData(() => api.releases(), [], onAuth);
  const ver = useData(() => api.versions(90), [], onAuth);
  const err = useData(() => api.errors(Math.max(period, 30)), [period], onAuth);
  const info = useData(() => api.buildInfo(), [], onAuth);
  const [picked, setPicked] = useState<string | null>(null);

  const rows = (daily.data ?? []) as DailyRow[];
  const releases = (rel.data ?? []) as Release[];
  const span = rows.slice(-60);
  const inRange = releasesInRange(releases, span);
  const markers: Marker[] = inRange.map((r) => ({ day: r.date.slice(0, 10), label: r.version, title: `${r.version} · ${r.title}` }));
  const impacts = useMemo(() => releaseImpact(releases.slice(0, 20), rows), [releases, rows]);
  const pickedImpact = impacts.find((i) => i.release.version === picked) ?? null;
  const steps = funnel((lv.data ?? []) as LevelRow[]);
  const b = info.data as BuildInfo | null;

  return (
    <>
      <Card title="Imbuto dei livelli">
        <State loading={lv.loading} error={lv.error} onRetry={lv.reload} />
        {steps.length ? (
          <div className="tr-scroll">
            <table className="tr-table">
              <thead>
                <tr>
                  <th>Liv.</th>
                  <th>Giocatori</th>
                  <th>Arrivano</th>
                  <th>Finiti</th>
                  <th>Errori</th>
                  <th>Tempo</th>
                  <th>Indizi</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.level} className={s.worst ? "is-worst" : undefined}>
                    <td>{s.level}</td>
                    <td>{s.players}</td>
                    <td>{pct(s.reach)}</td>
                    <td>{pct(s.completion)}</td>
                    <td>{s.avg_mistakes ?? "–"}</td>
                    <td>{s.avg_ms ? duration(s.avg_ms / 1000) : "–"}</td>
                    <td>{s.avg_hints ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !lv.loading ? (
          <Empty />
        ) : null}
        {steps.some((s) => s.worst) ? (
          <p className="tr-muted tr-small">In evidenza il livello dove si perdono più giocatori rispetto al precedente.</p>
        ) : null}
      </Card>

      <Card title="Rilasci sul grafico (60 giorni)">
        <State loading={daily.loading} error={daily.error} onRetry={daily.reload} />
        {span.length ? (
          <LineChart
            days={span.map((r) => r.day)}
            series={[
              { label: "Attivi", color: C.a, values: span.map((r) => r.active) },
              { label: "Errori JS", color: C.c, values: span.map((r) => r.errors) },
            ]}
            markers={markers}
            onMarker={(m) => setPicked(m.label)}
          />
        ) : null}
        <p className="tr-muted tr-small">Tocca una linea verticale per vedere il rilascio.</p>
        {pickedImpact ? <ImpactBox impact={pickedImpact} /> : null}
      </Card>

      <Card title="Rilasci: 7 giorni prima e dopo">
        <State loading={rel.loading} error={rel.error} onRetry={rel.reload} />
        {impacts.length ? (
          <ul className="tr-releases">
            {impacts.slice(0, 12).map((im) => (
              <li key={im.release.version}>
                <button type="button" className={picked === im.release.version ? "is-on" : ""} onClick={() => setPicked(im.release.version)}>
                  <span className="tr-rel-ver">
                    <Rocket className="size-4" /> {im.release.version}
                  </span>
                  <span className="tr-rel-title">{im.release.title}</span>
                  <span className="tr-rel-date">{new Date(im.release.date).toLocaleDateString("it-IT")}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : !rel.loading ? (
          <Empty text="Nessun rilascio trovato nella build" />
        ) : null}
      </Card>

      <Card title="Prestazioni per versione">
        <State loading={ver.loading} error={ver.error} onRetry={ver.reload} />
        {(ver.data as VersionRow[] | null)?.length ? (
          <div className="tr-scroll">
            <table className="tr-table">
              <thead>
                <tr>
                  <th>Versione</th>
                  <th>Giocatori</th>
                  <th>Caricamento</th>
                  <th>FPS</th>
                  <th>Errori</th>
                </tr>
              </thead>
              <tbody>
                {(ver.data as VersionRow[]).map((v) => (
                  <tr key={v.version}>
                    <td>{v.version}</td>
                    <td>{v.players}</td>
                    <td>{v.avg_load_ms ? `${(v.avg_load_ms / 1000).toFixed(2)}s` : "–"}</td>
                    <td>{v.avg_fps ?? "–"}</td>
                    <td className={v.errors ? "tone-low" : undefined}>{v.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !ver.loading ? (
          <Empty />
        ) : null}
      </Card>

      <Card title="Errori JS raggruppati">
        <State loading={err.loading} error={err.error} onRetry={err.reload} />
        {(err.data as ErrorRow[] | null)?.length ? (
          <ul className="tr-errors">
            {(err.data as ErrorRow[]).map((e, i) => (
              <li key={i}>
                <b>{e.message}</b>
                <small>
                  {e.where || "?"} · {e.c} volte · {e.players} giocatori · {(e.versions ?? []).join(", ")}
                </small>
              </li>
            ))}
          </ul>
        ) : !err.loading ? (
          <Empty text="Nessun errore: ottimo!" />
        ) : null}
      </Card>

      <Card title="Build pubblicata">
        {b ? (
          <div className="tr-stats is-inline">
            <Stat label="Versione" value={b.version} />
            <Stat label="Test" value={String(b.tests)} />
            <Stat label="Peso del gioco" value={compactBytes(b.bytesGame)} />
            <Stat label="Pubblicata" value={new Date(b.builtAt).toLocaleDateString("it-IT")} />
          </div>
        ) : (
          <Empty text="Informazioni di build non disponibili" />
        )}
      </Card>
    </>
  );
}

function ImpactBox({ impact }: { impact: ReturnType<typeof releaseImpact>[number] }) {
  const row = (label: string, a: number | null, b: number | null, fmt: (v: number | null) => string, higherIsBetter = true) => {
    const better = a !== null && b !== null && (higherIsBetter ? b > a : b < a);
    const worse = a !== null && b !== null && (higherIsBetter ? b < a : b > a);
    return (
      <tr>
        <td>{label}</td>
        <td>{fmt(a)}</td>
        <td className={better ? "tone-good" : worse ? "tone-low" : undefined}>{fmt(b)}</td>
      </tr>
    );
  };
  return (
    <div className="tr-impact">
      <p>
        <b>{impact.release.version}</b> · {impact.release.title}
      </p>
      {impact.release.notes ? <p className="tr-muted tr-small">{impact.release.notes}</p> : null}
      <table className="tr-table">
        <thead>
          <tr>
            <th />
            <th>7g prima</th>
            <th>7g dopo{impact.complete ? "" : " (parziale)"}</th>
          </tr>
        </thead>
        <tbody>
          {row("Attivi/giorno", impact.before.active, impact.after.active, (v) => (v === null ? "–" : v.toFixed(1)))}
          {row("Durata sessione", impact.before.session, impact.after.session, duration)}
          {row("Errori per sessione", impact.before.errorRate, impact.after.errorRate, (v) => (v === null ? "–" : v.toFixed(2)), false)}
        </tbody>
      </table>
    </div>
  );
}

// --- Idee ----------------------------------------------------------------------------------

function IdeasTab({ period, onAuth }: { period: Period; onAuth: () => void }) {
  const fb = useData(() => api.feedback(Math.max(period, 30)), [period], onAuth);
  const f = fb.data as Feedback | null;
  const r = f ? ratingStats(f.ratings) : null;
  const prefs = f ? groupPrefs(f.prefs) : [];
  return (
    <>
      <Card title="Ti piace BOLT?">
        <State loading={fb.loading} error={fb.error} onRetry={fb.reload} />
        {r ? (
          <>
            <p className="tr-big">
              {r.avg === null ? "–" : r.avg.toFixed(1)} <small>★ su {r.n} voti</small>
            </p>
            <Bars items={[...r.dist].reverse().map((d) => ({ label: `${d.stars} ★`, value: d.n }))} color={C.e} />
          </>
        ) : null}
      </Card>
      <Card title="Cosa migliorerebbero">
        {f?.comments.length ? (
          <ul className="tr-comments">
            {f.comments.map((c, i) => (
              <li key={i}>
                <p>“{c.comment}”</p>
                <small>
                  {c.rating ? `${c.rating}★ · ` : ""}
                  {new Date(c.at).toLocaleDateString("it-IT")}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="Ancora nessun commento" />
        )}
      </Card>
      <Card title="Domande veloci">
        {prefs.length ? (
          prefs.map((p) => (
            <div key={p.question} className="tr-pref">
              <h3 className="tr-h3">
                {QUESTION_LABELS[p.question] ?? p.question} <small>· {p.total} risposte</small>
              </h3>
              <Bars items={p.answers.map((a) => ({ label: a.answer, value: a.n, note: pct(a.share) }))} color={C.d} />
            </div>
          ))
        ) : (
          <Empty text="Ancora nessuna risposta" />
        )}
      </Card>
      <Card title="Nomi proposti per il gioco">
        {f?.names.length ? (
          <div className="tr-chips">
            {f.names.map((n, i) => (
              <span key={i} className="tr-chip">
                {n.name}
              </span>
            ))}
          </div>
        ) : (
          <Empty text="Ancora nessun nome" />
        )}
      </Card>
      <Roadmap onAuth={onAuth} />
    </>
  );
}

const STATUS: Array<{ id: RoadItem["status"]; label: string }> = [
  { id: "todo", label: "Da fare" },
  { id: "doing", label: "In corso" },
  { id: "done", label: "Fatto" },
];

function Roadmap({ onAuth }: { onAuth: () => void }) {
  const list = useData(() => api.roadmap(), [], onAuth);
  const [items, setItems] = useState<RoadItem[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  useEffect(() => {
    if (list.data) setItems(list.data as RoadItem[]);
  }, [list.data]);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const pos = Math.max(0, ...items.map((i) => i.position)) + 1;
      const [it] = await api.addRoad({ title: title.trim().slice(0, 120), note: note.trim().slice(0, 1000), status: "todo", position: pos });
      if (it) setItems((xs) => [...xs, it]);
      setTitle("");
      setNote("");
    } catch (e) {
      if (e instanceof AuthError) onAuth();
    }
    setBusy(false);
  }

  async function move(it: RoadItem, status: RoadItem["status"]) {
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, status } : x)));
    try {
      await api.updateRoad(it.id, { status });
    } catch {
      list.reload();
    }
  }

  async function remove(id: number) {
    setConfirmDel(null);
    setItems((xs) => xs.filter((x) => x.id !== id));
    try {
      await api.deleteRoad(id);
    } catch {
      list.reload();
    }
  }

  return (
    <Card title="Roadmap">
      <State loading={list.loading && !items.length} error={list.error} onRetry={list.reload} />
      <form
        className="tr-road-add"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input className="tr-input" placeholder="Nuova idea…" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-label="Titolo" />
        <input className="tr-input" placeholder="Nota (facoltativa)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} aria-label="Nota" />
        <button type="submit" className="tr-btn is-primary" disabled={busy || !title.trim()}>
          <Plus className="size-4" /> Aggiungi
        </button>
      </form>
      {STATUS.map((st) => {
        const col = items.filter((i) => i.status === st.id).sort((a, b) => a.position - b.position || a.id - b.id);
        return (
          <div key={st.id} className={`tr-road-col is-${st.id}`}>
            <h3 className="tr-h3">
              {st.label} <small>{col.length}</small>
            </h3>
            {col.length ? (
              <ul>
                {col.map((it) => (
                  <li key={it.id} className="tr-road-item">
                    <div>
                      <b>{it.title}</b>
                      {it.note ? <small>{it.note}</small> : null}
                    </div>
                    <div className="tr-road-actions">
                      {STATUS.filter((s) => s.id !== it.status).map((s) => (
                        <button key={s.id} type="button" className="tr-pill" onClick={() => void move(it, s.id)}>
                          {s.label}
                        </button>
                      ))}
                      {confirmDel === it.id ? (
                        <button type="button" className="tr-pill is-danger" onClick={() => void remove(it.id)}>
                          Elimina?
                        </button>
                      ) : (
                        <button type="button" className="tr-icon-btn is-small" aria-label={`Elimina ${it.title}`} onClick={() => setConfirmDel(it.id)}>
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tr-empty is-small">Vuoto</p>
            )}
          </div>
        );
      })}
    </Card>
  );
}
