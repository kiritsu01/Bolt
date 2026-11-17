import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  Coins,
  Lock,
  ShoppingBag,
  Flame,
  Lightbulb,
  Play,
  RotateCcw,
  Share2,
  Star,
  Timer,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { playMiss, playUi, resumeAudio, setSoundEnabled, unlockAudio } from "@/game/audio";
import { drawArrow, drawBoard, fitCanvas, layoutBoard, readPalette, type Palette } from "@/game/draw";
import { copy, type Lang } from "@/game/i18n";
import { emojiRow, shareMessage } from "@/game/share";
import { CHAPTERS } from "@/game/chapters";
import { ARROW_STYLES, THEMES, applyTheme, coinsFor, themeById, type ArrowStyle, type ThemeId } from "@/game/cosmetics";
import {
  campaignSpec,
  chapterIndex,
  CHAPTER_SIZE,
  dailySpec,
  decodeSpec,
  encodeSpec,
  freeArrows,
  rushSpec,
  starsFor,
  todayKey,
  type Spec,
} from "@/game/logic";
import { loadSave, noteDay, writeSave, type Save, defaultSave } from "@/game/save";
import { freshSim, step, tapCell, useHint, useUndo, type Mode, type Sim } from "@/game/sim";

type Phase = "home" | "levels" | "play" | "shop";
type Modal = null | "clear" | "over";
type Hud = {
  left: number;
  combo: number;
  mistakes: number;
  time: number;
  score: number;
  coach: boolean;
  canUndo: boolean;
  stuck: boolean;
};
type Result = {
  stars: number;
  mistakes: number;
  ms: number;
  score: number;
  code: string | null;
  log: number[];
  maxCombo: number;
  /** Monete guadagnate con questa partita. */
  coins: number;
};
type Meta = { mode: Mode; level: number; spec: Spec };

const FALLBACK: Palette = {
  fg: "#f3efe4",
  accent: "#ff4d1c",
  surface: "#1a211c",
  line: "#2c362f",
  muted: "#9aa396",
  bg: "#101412",
};

const CONFETTI_COLORS = ["var(--color-accent)", "var(--color-fg)", "var(--color-muted)"];

/** Coriandoli generati una volta per celebrazione: posizioni fisse finché `burstKey` non cambia. */
function Confetti({ burstKey }: { burstKey: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: `${burstKey}-${i}`,
        left: Math.random() * 100,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        delay: Math.random() * 250,
        dur: 1300 + Math.random() * 900,
        dx: (Math.random() - 0.5) * 160,
        rot: (Math.random() - 0.5) * 900,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [burstKey],
  );
  return (
    <div className="bolt-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <i
          key={p.id}
          style={
            {
              left: `${p.left}%`,
              width: p.w,
              height: p.h,
              background: p.color,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.dur}ms`,
              "--dx": `${p.dx}px`,
              "--rot": `${p.rot}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function formatTime(t: number) {
  if (t >= 10) return String(Math.ceil(t));
  return t.toFixed(1);
}

export function BoltApp({ code }: { code?: string }) {
  const challenge = useMemo(() => decodeSpec(code), [code]);
  const [save, setSave] = useState<Save>(defaultSave);
  const [phase, setPhase] = useState<Phase>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [hud, setHud] = useState<Hud>({
    left: 0,
    combo: 0,
    mistakes: 0,
    time: 45,
    score: 0,
    coach: false,
    canUndo: false,
    stuck: false,
  });
  /** Capitolo di cui mostrare la schermata di presentazione (null = nessuna). */
  const [intro, setIntro] = useState<number | null>(null);

  const [hype, setHype] = useState<{ key: number; combo: number; word: string } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const lastHypeRef = useRef(0);

  const simRef = useRef<Sim | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentChapterRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteRef = useRef<Palette>(FALLBACK);
  const modalRef = useRef<Modal>(null);
  const hudRef = useRef<(sim: Sim) => void>(() => {});
  const clearRef = useRef<(sim: Sim) => void>(() => {});
  const overRef = useRef<(sim: Sim) => void>(() => {});
  const bankRef = useRef<(sim: Sim) => void>(() => {});
  modalRef.current = modal;

  // Solo per i test automatici (build --mode e2e): nella build normale questo blocco non esiste.
  if (import.meta.env.MODE === "e2e") {
    (window as unknown as { __bolt?: unknown }).__bolt = { sim: () => simRef.current, freeArrows };
  }

  const lang: Lang = save.lang;
  const t = copy[lang];
  const today = todayKey();
  const dailyBest = save.daily[today];
  const totalStars = Object.values(save.stars).reduce((sum, n) => sum + n, 0);

  useEffect(() => {
    const loaded = loadSave();
    setSave(loaded);
    setSoundEnabled(loaded.sound);
    document.documentElement.lang = loaded.lang;
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) resumeAudio();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Scritta grande a ogni traguardo di combo (x5, x10, x15...).
  useEffect(() => {
    if (hud.combo < 5) {
      lastHypeRef.current = 0;
      return;
    }
    const milestone = Math.floor(hud.combo / 5) * 5;
    if (milestone <= lastHypeRef.current) return;
    lastHypeRef.current = milestone;
    const words = copy[save.lang].hype;
    const word = words[Math.min(milestone / 5 - 1, words.length - 1)];
    setHype({ key: Date.now(), combo: milestone, word });
  }, [hud.combo, save.lang]);

  useEffect(() => {
    if (!hype) return;
    const id = window.setTimeout(() => setHype(null), 1150);
    return () => window.clearTimeout(id);
  }, [hype]);

  useEffect(() => {
    if (!confetti) return;
    const id = window.setTimeout(() => setConfetti(0), 2600);
    return () => window.clearTimeout(id);
  }, [confetti]);

  const publish = (sim: Sim) => {
    setHud({
      left: sim.board.arrows.length,
      combo: sim.combo,
      mistakes: sim.mistakes,
      time: sim.timeLeft,
      score: sim.score,
      coach: sim.coach,
      canUndo: sim.undo.length > 0 && !sim.resolved,
      stuck: sim.stuck && !sim.resolved,
    });
  };

  hudRef.current = publish;

  clearRef.current = (sim) => {
    const stars =
      sim.mode === "campaign" && sim.level <= 2
        ? 3
        : starsFor(sim.mistakes, sim.hintsUsed, sim.undos);
    const ms = performance.now() - sim.startedAt;
    const earned =
      sim.mode === "campaign"
        ? coinsFor.stars(stars, save.stars[String(sim.level)] ?? 0)
        : sim.mode === "daily"
          ? coinsFor.daily(!save.daily[today])
          : 0;
    setResult({
      stars,
      mistakes: sim.mistakes,
      ms,
      score: sim.score,
      code: encodeSpec(sim.spec),
      log: [...sim.log],
      maxCombo: sim.maxCombo,
      coins: earned,
    });
    setModal("clear");
    if (stars === 3) setConfetti(Date.now());
    publish(sim);
    setSave((prev) => {
      let next = noteDay({ ...prev, clears: prev.clears + 1 });
      if (sim.mode === "campaign") {
        const key = String(sim.level);
        next = {
          ...next,
          coins: next.coins + coinsFor.stars(stars, next.stars[key] ?? 0),
          unlocked: Math.max(next.unlocked, sim.level + 1),
          stars: { ...next.stars, [key]: Math.max(next.stars[key] ?? 0, stars) },
        };
      }
      if (sim.mode === "daily") {
        const old = next.daily[today];
        next = { ...next, coins: next.coins + coinsFor.daily(!old) };
        if (!old || sim.mistakes < old.mistakes || (sim.mistakes === old.mistakes && ms < old.ms)) {
          next = { ...next, daily: { ...next.daily, [today]: { mistakes: sim.mistakes, ms } } };
        }
      }
      writeSave(next);
      return next;
    });
  };

  overRef.current = (sim) => {
    setResult({
      stars: 0,
      mistakes: sim.mistakes,
      ms: 0,
      score: sim.score,
      code: null,
      log: [...sim.log],
      maxCombo: sim.maxCombo,
      coins: coinsFor.rush(sim.score),
    });
    setModal("over");
    if (sim.score > 0 && sim.score >= save.bestRush) {
      setConfetti(Date.now());
      setToast(t.newRecord);
    }
    publish(sim);
    setSave((prev) => {
      const next = noteDay({
        ...prev,
        bestRush: Math.max(prev.bestRush, sim.score),
        coins: prev.coins + coinsFor.rush(sim.score),
      });
      writeSave(next);
      return next;
    });
  };

  bankRef.current = (sim) => {
    publish(sim);
    setSave((prev) => {
      if (sim.score <= prev.bestRush) return prev;
      const next = { ...prev, bestRush: sim.score };
      writeSave(next);
      return next;
    });
  };

  // Colore d'accento del capitolo: in partita (campagna) e nella sua presentazione.
  const chapterNow = meta?.mode === "campaign" ? chapterIndex(meta.level) : null;
  const accent =
    intro != null ? CHAPTERS[intro]!.accent : phase === "play" && chapterNow != null ? CHAPTERS[chapterNow]!.accent : null;

  useEffect(() => {
    applyTheme(save.theme);
  }, [save.theme]);

  useEffect(() => {
    paletteRef.current = { ...readPalette(rootRef.current ?? undefined), arrow: save.arrowStyle };
  }, [phase, accent, save.theme, save.arrowStyle]);

  useEffect(() => {
    if (phase !== "levels") return;
    currentChapterRef.current?.scrollIntoView({ block: "start" });
  }, [phase]);

  useEffect(() => {
    if (phase !== "play") return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const sim = simRef.current;
      const canvas = canvasRef.current;
      if (sim && canvas) {
        const fit = fitCanvas(canvas);
        if (fit) {
          layoutBoard(sim, fit.w, fit.h);
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          step(sim, dt, now, {
            hud: (s) => hudRef.current(s),
            clear: (s) => clearRef.current(s),
            over: (s) => overRef.current(s),
            bank: (s) => bankRef.current(s),
          });
          layoutBoard(sim, fit.w, fit.h);
          drawBoard(fit.ctx, sim, paletteRef.current, now, fit.w, fit.h);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const sim = simRef.current;
      if (e.code === "Escape") {
        setPhase("home");
        setModal(null);
        return;
      }
      if (phase !== "play" || !sim || modalRef.current || intro != null) return;
      if (e.code === "KeyZ") {
        useUndo(sim);
        publish(sim);
      } else if (e.code === "KeyH") {
        useHint(sim);
        publish(sim);
      } else if (e.code === "KeyR") {
        e.preventDefault();
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function begin(mode: Mode, spec: Spec, level: number) {
    unlockAudio();
    playUi();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sim = freshSim({
      mode,
      level,
      spec,
      reduce,
      runSeed: mode === "rush" ? spec.seed >>> 0 : undefined,
    });
    simRef.current = sim;
    setMeta({ mode, level, spec });
    const ch = mode === "campaign" ? chapterIndex(level) : 0;
    setIntro(ch > 0 && !save.seenChapters.includes(ch) ? ch : null);
    setResult(null);
    setModal(null);
    publish(sim);
    setPhase("play");
  }

  function restart() {
    const current = simRef.current;
    if (!current) return;
    if (current.mode === "rush") {
      const runSeed = Math.floor(Math.random() * 1e9) >>> 0;
      begin("rush", rushSpec(0, runSeed), 0);
      return;
    }
    begin(current.mode, current.spec, current.level);
  }

  function goHome() {
    playUi();
    setPhase("home");
    setModal(null);
  }

  async function share(kind: "level" | "daily" | "rush" | "challenge") {
    unlockAudio();
    const sim = simRef.current;
    const spec = sim?.spec;
    const shareCode = kind === "rush" ? null : spec ? encodeSpec(spec) : result?.code ?? null;
    const url = `${window.location.origin}${window.location.pathname}${shareCode ? `?c=${shareCode}` : ""}`;
    const full = shareMessage(lang, {
      kind,
      level: sim?.level,
      stars: kind === "level" ? result?.stars : undefined,
      mistakes: result?.mistakes ?? sim?.mistakes,
      maxCombo: result?.maxCombo ?? sim?.maxCombo,
      score: result?.score ?? sim?.score,
      seconds: kind !== "rush" && result ? Math.max(1, result.ms / 1000) : undefined,
      date: kind === "daily" ? today : undefined,
      log: result?.log ?? sim?.log,
      url,
    });
    try {
      if (navigator.share) {
        await navigator.share({ title: "BOLT", text: full });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(full);
      setToast(t.copied);
    } catch {
      setToast(shareCode ?? t.shareFail);
    }
  }

  function openShop() {
    unlockAudio();
    playUi();
    setPhase("shop");
  }

  function buyOrUse(kind: "theme" | "arrow", id: string, price: number) {
    unlockAudio();
    const owned =
      kind === "theme" ? save.ownedThemes.includes(id as ThemeId) : save.ownedArrows.includes(id as ArrowStyle);
    if (!owned && save.coins < price) {
      playMiss();
      setToast(t.notEnough);
      return;
    }
    playUi();
    if (!owned) setToast(t.bought);
    setSave((prev) => {
      const has =
        kind === "theme" ? prev.ownedThemes.includes(id as ThemeId) : prev.ownedArrows.includes(id as ArrowStyle);
      if (!has && prev.coins < price) return prev;
      const next: Save =
        kind === "theme"
          ? {
              ...prev,
              coins: has ? prev.coins : prev.coins - price,
              ownedThemes: has ? prev.ownedThemes : [...prev.ownedThemes, id as ThemeId],
              theme: id as ThemeId,
            }
          : {
              ...prev,
              coins: has ? prev.coins : prev.coins - price,
              ownedArrows: has ? prev.ownedArrows : [...prev.ownedArrows, id as ArrowStyle],
              arrowStyle: id as ArrowStyle,
            };
      writeSave(next);
      return next;
    });
  }

  function closeIntro() {
    if (intro == null) return;
    unlockAudio();
    playUi();
    const ch = intro;
    setIntro(null);
    setSave((prev) => {
      if (prev.seenChapters.includes(ch)) return prev;
      const next = { ...prev, seenChapters: [...prev.seenChapters, ch] };
      writeSave(next);
      return next;
    });
  }

  function toggleSound() {
    unlockAudio();
    setSave((prev) => {
      const next = { ...prev, sound: !prev.sound };
      setSoundEnabled(next.sound);
      writeSave(next);
      if (next.sound) playUi();
      return next;
    });
  }

  function toggleLang() {
    setSave((prev) => {
      const next: Save = { ...prev, lang: prev.lang === "it" ? "en" : "it" };
      document.documentElement.lang = next.lang;
      writeSave(next);
      return next;
    });
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    unlockAudio();
    const sim = simRef.current;
    if (!sim || modalRef.current || sim.over || sim.resolved) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { ox, oy, cell } = sim.layout;
    if (cell <= 0) return;
    const x = Math.floor((px - ox) / cell);
    const y = Math.floor((py - oy) / cell);
    if (x < 0 || y < 0 || x >= sim.board.w || y >= sim.board.h) return;
    if (tapCell(sim, x, y, performance.now())) publish(sim);
  };

  return (
    <div
      ref={rootRef}
      className="safe-x relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden"
      style={accent ? ({ "--color-accent": accent } as CSSProperties) : undefined}
    >
      {phase === "home" ? (
        <div className="safe-top safe-bot flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex items-center justify-between py-3">
            <p className="text-xs font-medium tracking-widest text-muted uppercase">{t.kicker}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openShop}
                aria-label={`${t.shop}: ${save.coins} ${t.coins}`}
                className="bolt-coin-pill"
              >
                <Coins className="size-4 text-accent" />
                <span className="tabular-nums">{save.coins}</span>
              </button>
              <button
                type="button"
                onClick={toggleLang}
                className="h-11 rounded-full bg-surface px-3 text-sm font-semibold text-fg"
              >
                {t.lang}
              </button>
              <button
                type="button"
                onClick={toggleSound}
                aria-label={save.sound ? t.soundOn : t.soundOff}
                className="flex size-11 items-center justify-center rounded-full bg-surface text-fg"
              >
                {save.sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
              </button>
            </div>
          </div>

          <div className="pt-4 pb-6">
            <h1 className="font-display text-7xl leading-none font-extrabold tracking-tight">
              BO<span className="text-accent">L</span>T
            </h1>
            <p className="mt-4 max-w-xs text-pretty text-base leading-relaxed text-muted">{t.tagline}</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat icon={<Flame className="size-4 text-accent" />} label={t.streak} value={save.streak} />
            <Stat icon={<Star className="size-4 text-accent" />} label={t.stars} value={totalStars} />
            <Stat icon={<Timer className="size-4 text-accent" />} label={t.record} value={save.bestRush} />
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {challenge ? (
              <button
                type="button"
                onClick={() => begin("challenge", challenge, 0)}
                className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent font-display text-lg font-extrabold text-accent-ink"
              >
                <Play className="size-5 fill-current" />
                {t.playChallenge}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => begin("campaign", campaignSpec(save.unlocked), save.unlocked)}
              className={
                challenge
                  ? "flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface font-display text-base font-semibold"
                  : "flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent font-display text-lg font-extrabold text-accent-ink"
              }
            >
              <Play className="size-5 fill-current" />
              {t.continue} {save.unlocked}
              <span className="bolt-btn-sub">· {t.chapters[chapterIndex(save.unlocked)]!.name}</span>
            </button>
            <button
              type="button"
              onClick={() => begin("daily", dailySpec(today), 0)}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface font-display text-base font-semibold"
            >
              {t.daily}
              {dailyBest ? <span className="text-sm font-medium text-muted">{t.todayDone}</span> : null}
            </button>
            <button
              type="button"
              onClick={() => {
                const runSeed = Math.floor(Math.random() * 1e9) >>> 0;
                begin("rush", rushSpec(0, runSeed), 0);
              }}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface font-display text-base font-semibold"
            >
              <Timer className="size-4" />
              {t.rush}
            </button>
            <div className="bolt-home-links">
              <button
                type="button"
                onClick={() => {
                  playUi();
                  setPhase("levels");
                }}
                className="h-11 text-sm font-semibold text-muted"
              >
                {t.levels}
              </button>
              <button type="button" onClick={openShop} className="h-11 text-sm font-semibold text-muted">
                <ShoppingBag className="size-4" />
                {t.shop}
              </button>
            </div>
          </div>

          <div className="mt-auto pt-8 pb-2">
            <p className="text-xs font-semibold tracking-widest text-muted uppercase">{t.howTitle}</p>
            <ol className="mt-3 flex flex-col gap-2">
              {t.rules.map((rule, i) => (
                <li key={rule} className="flex gap-3 text-sm leading-snug text-fg">
                  <span className="font-display text-accent">{i + 1}</span>
                  <span className="text-pretty">{rule}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-muted">{t.rushHint}</p>
          </div>
        </div>
      ) : null}

      {phase === "levels" ? (
        <div className="safe-top safe-bot flex min-h-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-2">
            <IconButton label={t.back} onClick={goHome}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <h2 className="font-display text-xl font-extrabold">{t.levels}</h2>
            <p className="ml-auto flex items-center gap-1 text-sm text-muted tabular-nums">
              <Star className="size-4 fill-accent text-accent" />
              {totalStars}
            </p>
          </header>
          <div className="bolt-map min-h-0 flex-1 overflow-y-auto pb-4">
            {CHAPTERS.map((ch) => {
              const info = t.chapters[ch.index]!;
              const last = ch.last ?? Math.max(ch.first + CHAPTER_SIZE - 1, Math.ceil((save.unlocked + 1) / 5) * 5);
              const levels = Array.from({ length: last - ch.first + 1 }, (_, k) => ch.first + k);
              const open = save.unlocked >= ch.first;
              const earned = levels.reduce((sum, l) => sum + (save.stars[String(l)] ?? 0), 0);
              const current = chapterIndex(save.unlocked) === ch.index;
              return (
                <section
                  key={ch.index}
                  ref={current ? currentChapterRef : undefined}
                  className={open ? "bolt-chapter" : "bolt-chapter is-locked"}
                  style={ch.accent ? ({ "--color-accent": ch.accent } as CSSProperties) : undefined}
                >
                  <div className="bolt-chapter-head">
                    <span className="bolt-chapter-node">{open ? ch.index + 1 : <Lock className="size-4" />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold tracking-widest text-muted uppercase">
                        {t.chapter} {ch.index + 1} · {ch.last ? `${ch.first}–${ch.last}` : `${ch.first}+ ${t.endless}`}
                      </p>
                      <h3 className="truncate font-display text-xl font-extrabold">{info.name}</h3>
                      <p className="text-sm text-muted">{info.short}</p>
                    </div>
                    <p className="flex items-center gap-1 text-sm text-muted tabular-nums">
                      <Star className="size-4 fill-accent text-accent" />
                      {earned}
                      {ch.last ? `/${levels.length * 3}` : ""}
                    </p>
                  </div>
                  <div className="bolt-level-grid">
                    {levels.map((level) => {
                      const locked = level > save.unlocked;
                      const stars = save.stars[String(level)] ?? 0;
                      return (
                        <button
                          key={level}
                          type="button"
                          disabled={locked}
                          onClick={() => begin("campaign", campaignSpec(level), level)}
                          className={
                            level === save.unlocked
                              ? "bolt-level is-current"
                              : "bolt-level"
                          }
                        >
                          <span className="font-display text-lg font-extrabold tabular-nums">{level}</span>
                          <span className="mt-1 flex gap-1">
                            {[0, 1, 2].map((i) => (
                              <span
                                key={i}
                                className={i < stars ? "size-1.5 rounded-full bg-accent" : "size-1.5 rounded-full bg-line"}
                              />
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {phase === "shop" ? (
        <div className="safe-top safe-bot flex min-h-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-2">
            <IconButton label={t.back} onClick={goHome}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <h2 className="font-display text-xl font-extrabold">{t.shop}</h2>
            <p className="bolt-coin-pill ml-auto" aria-label={`${save.coins} ${t.coins}`}>
              <Coins className="size-4 text-accent" />
              <span className="tabular-nums">{save.coins}</span>
            </p>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            <p className="text-sm text-pretty text-muted">{t.shopNote}</p>
            <h3 className="bolt-shop-title">{t.themesTitle}</h3>
            <div className="bolt-shop-grid">
              {THEMES.map((theme) => {
                const owned = save.ownedThemes.includes(theme.id);
                const active = save.theme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={active ? "bolt-shop-item is-active" : "bolt-shop-item"}
                    onClick={() => buyOrUse("theme", theme.id, theme.price)}
                    aria-pressed={active}
                  >
                    <ThemeSwatch id={theme.id} />
                    <span className="bolt-shop-name">{t.themeNames[theme.id]}</span>
                    <ShopTag owned={owned} active={active} price={theme.price} coins={save.coins} t={t} />
                  </button>
                );
              })}
            </div>
            <h3 className="bolt-shop-title">{t.arrowsTitle}</h3>
            <div className="bolt-shop-grid">
              {ARROW_STYLES.map((style) => {
                const owned = save.ownedArrows.includes(style.id);
                const active = save.arrowStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    className={active ? "bolt-shop-item is-active" : "bolt-shop-item"}
                    onClick={() => buyOrUse("arrow", style.id, style.price)}
                    aria-pressed={active}
                  >
                    <ArrowPreview style={style.id} theme={save.theme} />
                    <span className="bolt-shop-name">{t.arrowNames[style.id]}</span>
                    <ShopTag owned={owned} active={active} price={style.price} coins={save.coins} t={t} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {phase === "play" && meta ? (
        <div className="safe-top safe-bot flex min-h-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-2">
            <IconButton label={t.home} onClick={goHome}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-extrabold">
                {meta.mode === "campaign"
                  ? `${t.continue} ${meta.level}`
                  : meta.mode === "daily"
                    ? t.daily
                    : meta.mode === "rush"
                      ? t.rush
                      : t.challenge}
              </p>
              <p className="text-xs text-muted tabular-nums">
                {meta.mode === "rush"
                  ? `${hud.score} · ${formatTime(hud.time)}s`
                  : `${hud.mistakes} ${t.mistakes}`}
                {hud.combo > 1 ? ` · ${t.combo} x${hud.combo}` : ""}
              </p>
            </div>
            {meta.mode === "rush" ? (
              <p className="font-display text-3xl font-extrabold text-accent tabular-nums">{formatTime(hud.time)}</p>
            ) : (
              <IconButton label={t.retry} onClick={restart}>
                <RotateCcw className="size-5" />
              </IconButton>
            )}
          </header>

          {hud.stuck ? (
            <p className="pb-2 text-center text-sm font-semibold text-pretty text-accent">{t.stuck}</p>
          ) : hud.coach ? (
            <p className="pb-2 text-center text-sm text-pretty text-muted">
              {meta.mode === "campaign" && meta.level > CHAPTER_SIZE
                ? t.chapterCoach[chapterIndex(meta.level)]
                : meta.level === 2 && meta.mode === "campaign"
                  ? t.coach2
                  : t.coach}
            </p>
          ) : null}

          <div className="relative min-h-0 flex-1">
            <canvas
              ref={canvasRef}
              className="board-hit h-full w-full"
              onPointerDown={onPointerDown}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={t.tagline}
              role="img"
            />
            {hype ? (
              <p key={hype.key} className="bolt-hype" aria-live="polite">
                <span className="bolt-hype-combo">x{hype.combo}</span>
                <span className="bolt-hype-word">{hype.word}</span>
              </p>
            ) : null}
            {confetti ? <Confetti burstKey={confetti} /> : null}
            {modal ? (
              <div className="scrim absolute inset-0 z-10 flex items-end p-3">
                <div className="bolt-rise w-full rounded-card bg-surface p-6">
                  {modal === "clear" && result ? (
                    <>
                      <p className="text-center text-xs font-semibold tracking-widest text-muted uppercase">
                        {result.stars === 3 ? t.perfect : t.clear}
                      </p>
                      <div className="mt-3 flex justify-center gap-2">
                        {[1, 2, 3].map((i) => (
                          <Star
                            key={i}
                            className={
                              i <= result.stars
                                ? "bolt-pop size-8 fill-accent text-accent"
                                : "bolt-pop size-8 text-line"
                            }
                            style={{ animationDelay: `${(i - 1) * 80}ms` }}
                          />
                        ))}
                      </div>
                      <p className="mt-3 text-center text-sm text-muted tabular-nums">
                        {result.mistakes} {t.mistakes} · {Math.max(1, Math.round(result.ms / 1000))}s
                      </p>
                      {result.coins > 0 ? <EarnedCoins amount={result.coins} label={t.earned} /> : null}
                      {result.log.length ? (
                        <p className="bolt-emoji-row mt-2 text-center" aria-hidden="true">
                          {emojiRow(result.log)}
                        </p>
                      ) : null}
                      {result.code ? (
                        <p className="mt-2 text-center font-display text-lg font-extrabold tracking-widest">
                          {result.code}
                        </p>
                      ) : null}
                      <div className="mt-5 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void share(
                              meta.mode === "daily" ? "daily" : meta.mode === "challenge" ? "challenge" : "level",
                            )
                          }
                          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-display font-extrabold text-accent-ink"
                        >
                          <Share2 className="size-4" />
                          {t.share}
                        </button>
                        {meta.mode === "campaign" ? (
                          <button
                            type="button"
                            onClick={() => begin("campaign", campaignSpec(meta.level + 1), meta.level + 1)}
                            className="h-12 rounded-2xl border border-line bg-bg font-display font-semibold"
                          >
                            {t.next}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={restart}
                            className="h-12 rounded-2xl border border-line bg-bg font-display font-semibold"
                          >
                            {t.retry}
                          </button>
                        )}
                        <button type="button" onClick={goHome} className="h-11 text-sm font-semibold text-muted">
                          {t.home}
                        </button>
                      </div>
                    </>
                  ) : null}
                  {modal === "over" && result ? (
                    <>
                      <p className="text-center text-xs font-semibold tracking-widest text-muted uppercase">{t.over}</p>
                      <p className="mt-2 text-center font-display text-5xl font-extrabold tabular-nums">{result.score}</p>
                      <p className="mt-1 text-center text-sm text-muted">
                        {t.record} {Math.max(save.bestRush, result.score)}
                      </p>
                      {result.coins > 0 ? <EarnedCoins amount={result.coins} label={t.earned} /> : null}
                      <div className="mt-5 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => void share("rush")}
                          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-display font-extrabold text-accent-ink"
                        >
                          <Share2 className="size-4" />
                          {t.share}
                        </button>
                        <button
                          type="button"
                          onClick={restart}
                          className="h-12 rounded-2xl border border-line bg-bg font-display font-semibold"
                        >
                          {t.again}
                        </button>
                        <button type="button" onClick={goHome} className="h-11 text-sm font-semibold text-muted">
                          {t.home}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <footer className="flex items-center gap-2 py-3">
            {meta.mode === "rush" ? (
              <p className="flex-1 font-display text-2xl font-extrabold tabular-nums">{hud.score}</p>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!hud.canUndo}
                  onClick={() => {
                    const sim = simRef.current;
                    if (!sim) return;
                    unlockAudio();
                    playUi();
                    useUndo(sim);
                    publish(sim);
                  }}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-semibold disabled:opacity-40"
                >
                  <Undo2 className="size-4" />
                  {t.undo}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sim = simRef.current;
                    if (!sim) return;
                    unlockAudio();
                    playUi();
                    useHint(sim);
                    publish(sim);
                  }}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-semibold"
                >
                  <Lightbulb className="size-4" />
                  {t.hint}
                </button>
              </>
            )}
            <p className="min-w-16 text-right text-sm text-muted tabular-nums">
              {hud.left} {t.arrows}
            </p>
          </footer>
        </div>
      ) : null}

      {intro != null && phase === "play" ? (
        <button type="button" className="bolt-intro" onClick={closeIntro} autoFocus>
          <span className="bolt-intro-kicker">
            {t.chapter} {intro + 1} · {t.newMechanic}
          </span>
          <MechIllustration mech={intro} />
          <span className="bolt-intro-title">{t.chapters[intro]!.name}</span>
          <span className="bolt-intro-text">{t.chapters[intro]!.intro}</span>
          <span className="bolt-intro-cta">{t.tapToStart}</span>
        </button>
      ) : null}

      {toast ? (
        <p className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">
          {toast}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-surface px-2 py-3 text-center">
      <div className="flex items-center justify-center gap-1 text-muted">
        {icon}
        <span className="text-xs tracking-wide uppercase">{label}</span>
      </div>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full bg-surface text-fg"
    >
      {children}
    </button>
  );
}

/** Disegno della meccanica per la schermata di presentazione del capitolo. */
function MechIllustration({ mech }: { mech: number }) {
  const arrow = "M14 27h18v-9l14 14-14 14v-9H14z";
  return (
    <svg className="bolt-intro-art" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="16" fill="var(--color-surface)" />
      {mech === 3 ? (
        <rect x="7" y="7" width="50" height="50" rx="12" fill="none" stroke="var(--color-accent)" strokeWidth="3.5" />
      ) : null}
      {mech === 2 || mech === 4 ? (
        <g fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round">
          <path d="M14 20a22 22 0 0 1 22-10" />
          <path d="M50 44a22 22 0 0 1-22 10" />
        </g>
      ) : null}
      <path
        d={arrow}
        transform="translate(0 0)"
        fill="var(--color-fg)"
        opacity={mech === 1 ? 0.45 : 1}
        strokeLinejoin="round"
      />
      {mech === 1 || mech === 4 ? (
        <g>
          <circle cx="48" cy="16" r="10" fill="var(--color-accent)" />
          <rect x="43" y="15" width="10" height="7" rx="1.5" fill="var(--color-bg)" />
          <path d="M45 15v-2a3 3 0 0 1 6 0v2" fill="none" stroke="var(--color-bg)" strokeWidth="2" />
        </g>
      ) : null}
    </svg>
  );
}

function EarnedCoins({ amount, label }: { amount: number; label: string }) {
  return (
    <p className="bolt-earned bolt-pop">
      <Coins className="size-4" />+{amount} {label}
    </p>
  );
}

function ShopTag({
  owned,
  active,
  price,
  coins,
  t,
}: {
  owned: boolean;
  active: boolean;
  price: number;
  coins: number;
  t: (typeof copy)[Lang];
}) {
  if (active)
    return (
      <span className="bolt-shop-tag is-active">
        <Check className="size-4" />
        {t.inUse}
      </span>
    );
  if (owned) return <span className="bolt-shop-tag">{t.use}</span>;
  return (
    <span className={coins >= price ? "bolt-shop-tag is-price" : "bolt-shop-tag is-price is-short"}>
      <Coins className="size-4" />
      {price}
    </span>
  );
}

function ThemeSwatch({ id }: { id: ThemeId }) {
  const c = themeById(id).colors;
  return (
    <svg className="bolt-shop-art" viewBox="0 0 96 56" aria-hidden="true">
      <rect width="96" height="56" rx="12" fill={c.bg} />
      <rect x="10" y="10" width="76" height="36" rx="9" fill={c.surface} stroke={c.line} />
      <path d="M22 24h14v-6l11 10-11 10v-6H22z" fill={c.fg} />
      <path d="M56 24h14v-6l11 10-11 10v-6H56z" fill={c.accent} />
    </svg>
  );
}

function ArrowPreview({ style, theme }: { style: ArrowStyle; theme: ThemeId }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const c = themeById(theme).colors;
    fit.ctx.clearRect(0, 0, fit.w, fit.h);
    const cell = Math.min(fit.h, fit.w / 2.4);
    drawArrow(fit.ctx, fit.w / 2 - cell * 0.6, fit.h / 2, cell, 1, c.fg, 1, 1, 0, style, c.surface);
    drawArrow(fit.ctx, fit.w / 2 + cell * 0.6, fit.h / 2, cell, 0, c.accent, 1, 1, 0, style, c.surface);
  }, [style, theme]);
  return <canvas ref={ref} className="bolt-shop-art" aria-hidden="true" />;
}
