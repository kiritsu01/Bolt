import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import {
  Check,
  Pencil,
  User,
  Copy,
  MessageCircle,
  Swords,
  ChevronRight,
  Crown,
  Download,
  UserPlus,
  Users,
  Trash2,
  X,
  Tv,
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
import { playBuy, playCalm, playCoin, playFanfare, playWhoosh, playMiss, playStar, playUi, playWin, resumeAudio, setSoundEnabled, unlockAudio } from "@/game/audio";
import { coinSteps } from "@/game/celebrate";
import { celebrationFor, rushCelebration, type Celebration } from "@/game/celebrate";
import { HAPTIC, vibrate } from "@/game/haptics";
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
  hintArrow,
  rushSpec,
  starsFor,
  todayKey,
  type Spec,
} from "@/game/logic";
import { loadSave, noteDay, writeSave, type Save, defaultSave } from "@/game/save";
import { freshSim, hintShowing, step, tapCell, useHint, useUndo, type Mode, type Sim } from "@/game/sim";
import { hintsLeft, msUntilMidnight, spendHint } from "@/game/hints";
import { showRewardedAd } from "@/game/ads";
import { installMode, onPwaChange, promptInstall } from "@/game/pwa";
import {
  MAX_NAME,
  cleanName,
  decodeFriend,
  encodeFriend,
  encodeVersus,
  mergeFriend,
  nudge,
  ranking,
  versusWinner,
  type Friend,
  type Versus,
} from "@/game/friends";
import { formatClock } from "@/game/share";
import {
  addChallenge,
  challengeFromLink,
  doneChallenges,
  pendingChallenges,
  tally,
  type Tally,
  type Challenge,
  resolveChallenge,
  type Score,
} from "@/game/challenges";

/** Il risultato migliore tra due: meno errori, a parità il tempo più basso. */
function better(old: Score | undefined, next: Score): Score {
  if (!old) return { ms: Math.round(next.ms), mistakes: next.mistakes };
  if (next.mistakes < old.mistakes || (next.mistakes === old.mistakes && next.ms < old.ms))
    return { ms: Math.round(next.ms), mistakes: next.mistakes };
  return old;
}

/** "2026-11-17" -> "17/11". */
function shortDay(date: string) {
  const [, m, d] = date.split("-");
  return m && d ? `${d}/${m}` : date;
}

type Phase = "home" | "levels" | "play" | "shop" | "friends" | "challenges" | "profile";
type Modal = null | "clear" | "over" | "hints";
type Hud = {
  left: number;
  combo: number;
  mistakes: number;
  time: number;
  score: number;
  coach: boolean;
  canUndo: boolean;
  stuck: boolean;
  /** Serie viva (entro la finestra di tempo), per il contatore che pulsa. */
  hot: boolean;
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
  /** Confronto con chi ha mandato la Sfida di oggi. */
  versus?: Versus & { key: string; winner: "me" | "other" | "tie" };
};
type Meta ={ mode: Mode; level: number; spec: Spec };

const FALLBACK: Palette = {
  fg: "#fff6e8",
  accent: "#ff5a1f",
  surface: "#1e1a45",
  line: "#2f2a63",
  muted: "#aba5d6",
  bg: "#120f2e",
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

export function BoltApp({ code, friendCode, versusCode }: { code?: string; friendCode?: string; versusCode?: string }) {
  const challenge = useMemo(() => decodeSpec(code), [code]);
  // Sfida dal link (?c=&v=): vale solo se la griglia è proprio quella del livello o della Sfida di quel giorno.
  const linkChallenge = useMemo(() => challengeFromLink(code, versusCode), [code, versusCode]);
  /** Sfida ricevuta che si sta giocando (chiave in save.challenges). */
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [save, setSave] = useState<Save>(defaultSave);
  const [saveReady, setSaveReady] = useState(false);
  /** Richiesta del nome prima di un invito o di una condivisione (null = nessuna). */
  const [askName, setAskName] = useState<null | ((name: string) => void)>(null);
  const friendDoneRef = useRef(false);
  /** Record del Rush all'inizio della partita: serve a capire se il punteggio finale è davvero un record. */
  const bestAtStartRef = useRef(0);
  /** Quanto festeggiare la partita appena chiusa (solo i successi veri). */
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  /** Il conteggio delle stelle è finito: possono partire le monete. */
  const [starsDone, setStarsDone] = useState(false);
  /** Ultimo tocco su Rivincita (per far ripartire l'animazione delle spade). */
  const [strike, setStrike] = useState(0);
  /** Pannello di benvenuto quando si apre il link di un amico (invito o sfida). */
  const [arrival, setArrival] = useState<{ friend: Friend | null; challenge: Challenge | null } | null>(null);
  /** Pannello di condivisione aperto (testo completo, link, titolo). */
  const [shareSheet, setShareSheet] = useState<{ text: string; url: string; title: string } | null>(null);
  /** Amico per cui è stato chiesto di confermare la rimozione. */
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
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
    hot: false,
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
    (window as unknown as { __bolt?: unknown }).__bolt = {
      sim: () => simRef.current,
      freeArrows,
      hintArrow,
      /** Tocca la freccia suggerita dal risolutore (per i test automatici). */
      autoTap: () => {
        const sim = simRef.current;
        const pick = sim ? hintArrow(sim.board) : null;
        if (sim && pick) {
          tapCell(sim, pick.x, pick.y, performance.now());
          publish(sim);
        }
        return Boolean(pick);
      },
    };
  }

  const lang: Lang = save.lang;
  const t = copy[lang];
  // Si ridisegna a mezzanotte (e al ritorno sulla pagina) per ricaricare gli indizi e cambiare la Sfida di oggi.
  const [, setDayTick] = useState(0);
  useEffect(() => {
    let id = 0;
    const arm = () => {
      window.clearTimeout(id);
      id = window.setTimeout(() => {
        setDayTick((n) => n + 1);
        arm();
      }, msUntilMidnight() + 500);
    };
    const onVis = () => {
      if (document.hidden) return;
      setDayTick((n) => n + 1);
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  // Invito non invadente ad aggiungere BOLT alla Home: solo in home, dopo il terzo livello, finché non lo si chiude.
  const [pwaMode, setPwaMode] = useState<"prompt" | "ios" | "none">("none");
  useEffect(() => {
    const sync = () => setPwaMode(installMode());
    sync();
    return onPwaChange(sync);
  }, []);
  const showInstall = pwaMode !== "none" && !save.installDismissed && save.clears >= 3;

  const today = todayKey();
  const hintStock = hintsLeft(save, today);
  const dailyBest = save.daily[today];
  const totalStars = Object.values(save.stars).reduce((sum, n) => sum + n, 0);
  // Amici sulla mappa: chi è su ogni livello (più amici sullo stesso livello vengono impilati).
  const friendsByLevel = useMemo(() => {
    const map = new Map<number, Friend[]>();
    for (const f of save.friends) map.set(f.level, [...(map.get(f.level) ?? []), f]);
    return map;
  }, [save.friends]);
  const topFriendLevel = save.friends.reduce((m, f) => Math.max(m, f.level), 0);
  const homeNudge = nudge(save.unlocked, save.friends);
  const pendingList = pendingChallenges(save.challenges);
  const doneList = doneChallenges(save.challenges);
  const pendingCount = pendingList.length;
  const tallies = tally(save.challenges);
  // Record del profilo: tutto ricavato dal salvataggio, nessun dato nuovo da conservare.
  const bestDaily = Object.values(save.daily).reduce<{ ms: number; mistakes: number } | null>(
    (best, d) => (!best || d.mistakes < best.mistakes || (d.mistakes === best.mistakes && d.ms < best.ms) ? d : best),
    null,
  );
  const levelsDone = Math.max(0, save.unlocked - 1);
  const perfect = Object.values(save.stars).filter((n) => n >= 3).length;
  const wins = tallies.reduce((n, r) => n + r.wins, 0);
  const losses = tallies.reduce((n, r) => n + r.losses, 0);
  const profileStats = [
    { label: t.levelReached, value: `${save.unlocked}` },
    { label: t.chapter, value: t.chapters[chapterIndex(save.unlocked)]!.name },
    { label: t.levelsDone, value: `${levelsDone}` },
    { label: t.stars, value: `${totalStars}` },
    { label: t.perfectLevels, value: `${perfect}` },
    { label: t.streak, value: `${save.streak}` },
    { label: t.bestRush, value: `${save.bestRush}` },
    {
      label: t.bestDaily,
      value: bestDaily ? `${formatClock(bestDaily.ms / 1000)} · ${bestDaily.mistakes} ${t.errShort}` : "–",
    },
    { label: t.dailiesPlayed, value: `${Object.keys(save.daily).length}` },
    { label: t.challengesRecord, value: `${wins} - ${losses}` },
    { label: t.friends, value: `${save.friends.length}` },
    { label: t.coins, value: `${save.coins}` },
  ];

  useEffect(() => {
    let loaded = loadSave();
    // Link amico (?f=): si salva l'amico una volta sola e si toglie il parametro dall'indirizzo.
    let arrivalFriend: Friend | null = null;
    if (friendCode && !friendDoneRef.current) {
      friendDoneRef.current = true;
      const tl = copy[loaded.lang];
      const incoming = decodeFriend(friendCode);
      if (!incoming) setToast(tl.friendBad);
      else {
        const merged = mergeFriend(loaded.friends, incoming, loaded.playerId);
        if (merged.status === "self") setToast(tl.friendSelf);
        else if (merged.status === "full") setToast(tl.friendsFull);
        else {
          const known = merged.friends.find((f) => f.id === incoming.id)!;
          arrivalFriend = known;
          if (merged.status !== "same") {
            loaded = { ...loaded, friends: merged.friends };
            writeSave(loaded);
          }
        }
      }
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("f");
        window.history.replaceState(null, "", url.toString());
      } catch {
        /* indirizzo non modificabile: pazienza */
      }
    }
    // Benvenuto ben visibile per chi apre il link di un amico (prima era solo un messaggio di 2 secondi).
    const fromOther = linkChallenge && linkChallenge.from.id !== loaded.playerId ? linkChallenge : null;
    if (arrivalFriend || fromOther) setArrival({ friend: arrivalFriend, challenge: fromOther });
    // Sfida dal link: finisce nell'elenco "Da giocare" (senza doppioni, massimo 30).
    if (linkChallenge) {
      const list = addChallenge(loaded.challenges, linkChallenge, loaded.playerId);
      if (list !== loaded.challenges) {
        loaded = { ...loaded, challenges: list };
        writeSave(loaded);
      }
    }
    setSave(loaded);
    setSaveReady(true);
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
      hot: sim.combo >= 2 && sim.heat > 0.05,
    });
  };

  hudRef.current = publish;

  clearRef.current = (sim) => {
    const stars =
      sim.mode === "campaign" && sim.level <= 2
        ? 3
        : starsFor(sim.mistakes, sim.hintsUsed, sim.undos);
    const ms = Math.max(500, Math.round((sim.finishedAt || performance.now()) - sim.startedAt));
    // Sfida ricevuta appena giocata: dall'elenco, oppure (Sfida di oggi) quella di oggi ancora da fare.
    const played =
      sim.mode === "challenge" && activeKey
        ? save.challenges.find((c) => c.key === activeKey)
        : sim.mode === "daily"
          ? pendingChallenges(save.challenges).find((c) => c.level === 0 && c.date === today)
          : undefined;
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
      versus: played
        ? {
            key: played.key,
            name: played.from.name,
            id: played.from.id || undefined,
            level: played.level,
            date: played.date,
            ...played.theirs,
            winner: versusWinner({ ms, mistakes: sim.mistakes }, played.theirs),
          }
        : undefined,
    });
    setModal("clear");
    const party = celebrationFor({
      stars,
      versus: played ? versusWinner({ ms, mistakes: sim.mistakes }, played.theirs) : undefined,
    });
    setCelebration(party);
    // Festa e accordo di vittoria arrivano DOPO il conteggio delle stelle (StarReveal);
    // una fine neutra suona subito una nota calma.
    if (party.sound === "calm") playCalm();
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
          bests: { ...next.bests, [key]: better(next.bests[key], { ms, mistakes: sim.mistakes }) },
        };
      }
      if (played) next = { ...next, challenges: resolveChallenge(next.challenges, played.key, { ms, mistakes: sim.mistakes }) };
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
    // Si confronta con il record di inizio partita (durante il Rush il record viene già aggiornato).
    const party = rushCelebration(sim.score, bestAtStartRef.current);
    setCelebration(party);
    if (party.confetti) {
      setConfetti(Date.now());
      setToast(t.newRecord);
      playWin();
      vibrate(HAPTIC.win);
    } else playCalm();
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
        requestHint();
      } else if (e.code === "KeyR") {
        e.preventDefault();
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function begin(mode: Mode, spec: Spec, level: number, challengeKey: string | null = null) {
    unlockAudio();
    bestAtStartRef.current = save.bestRush;
    setCelebration(null);
    setStarsDone(false);
    setActiveKey(challengeKey);
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
    const newChapter = ch > 0 && !save.seenChapters.includes(ch);
    setIntro(newChapter ? ch : null);
    if (newChapter) {
      // Capitolo nuovo: fanfara breve e vibrazione (successo vero: lo si è raggiunto giocando).
      playFanfare();
      vibrate(HAPTIC.chapter);
    }
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
    begin(current.mode, current.spec, current.level, current.mode === "challenge" ? activeKey : null);
  }

  function goHome() {
    playUi();
    setPhase("home");
    setModal(null);
  }

  function share(kind: "level" | "daily" | "rush" | "challenge") {
    // Ogni link condiviso porta il tuo nome (link amico), più il risultato da battere quando la griglia
    // è condivisibile: per questo serve sempre un nome (chiesto la prima volta).
    withName((name) => void shareNow(kind, name));
  }

  /** Livello e giorno della griglia appena giocata, per costruire il link di sfida (null = non condivisibile). */
  function challengeTarget(kind: "level" | "daily" | "rush" | "challenge") {
    const sim = simRef.current;
    if (kind === "daily") return { level: 0, date: today };
    if (kind === "level" && sim && sim.level >= 3) return { level: sim.level, date: today };
    if (kind === "challenge" && result?.versus)
      return { level: result.versus.level ?? 0, date: result.versus.level ? today : result.versus.date };
    return null;
  }

  /** Link di sfida: griglia (?c=), risultato da battere (?v=) e link amico (?f=). Riusa i codici di friends.ts. */
  function challengeLink(name: string, target: { level: number; date: string }, score: Score) {
    const code = encodeSpec(target.level ? campaignSpec(target.level) : dailySpec(target.date));
    const params = new URLSearchParams();
    if (code) params.set("c", code);
    params.set(
      "v",
      encodeVersus({
        name,
        id: save.playerId,
        level: target.level,
        date: target.date,
        ms: Math.max(500, Math.round(score.ms)),
        mistakes: Math.min(999, score.mistakes),
      }),
    );
    params.set("f", encodeFriend(meAsFriend(name)));
    return `${baseUrl()}?${params.toString()}`;
  }

  async function shareNow(kind: "level" | "daily" | "rush" | "challenge", name?: string) {
    unlockAudio();
    const sim = simRef.current;
    const spec = sim?.spec;
    const shareCode = kind === "rush" ? null : spec ? encodeSpec(spec) : result?.code ?? null;
    const target = challengeTarget(kind);
    let url: string;
    if (name && result && target) url = challengeLink(name, target, result);
    else {
      // Griglia non condivisibile (livelli 1-2, Rush): resta comunque il link amico con il tuo nome.
      const params = new URLSearchParams();
      if (shareCode) params.set("c", shareCode);
      if (name) params.set("f", encodeFriend(meAsFriend(name)));
      const query = params.toString();
      url = `${baseUrl()}${query ? `?${query}` : ""}`;
    }
    const rematch = Boolean(name && result?.versus && target);
    const full = (rematch ? `${t.rematchText(result!.versus!.name)}\n` : "") + shareMessage(lang, {
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
    deliver(full, url, kind === "rush" ? t.shareResult : t.share);
  }

  /** Condivide un testo: navigator.share dove c'è, altrimenti copia negli appunti. */
  /**
   * Mostra il pannello di condivisione con il link in vista e tasti espliciti
   * (Condividi dove il browser lo permette, Copia link, WhatsApp): funziona ovunque, anche su computer.
   */
  function deliver(text: string, url: string, title: string) {
    setShareSheet({ text, url, title });
  }

  /** Il giocatore come "amico", per i link e per la classifica. */
  function meAsFriend(name = save.playerName): Friend {
    return { id: save.playerId, name: name || "?", level: save.unlocked, stars: totalStars, streak: save.streak, date: today };
  }

  function baseUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  /** Esegue `then` dopo essersi assicurati che il giocatore abbia un nome (chiesto la prima volta). */
  function withName(then: (name: string) => void) {
    unlockAudio();
    playUi();
    if (save.playerName) then(save.playerName);
    else setAskName(() => then);
  }

  function invite() {
    withName((name) => {
      const me = meAsFriend(name);
      const url = `${baseUrl()}?f=${encodeFriend(me)}`;
      deliver(`${t.inviteText(name, me.level, me.stars)}\n${url}`, url, t.invite);
    });
  }

  function openChallenges() {
    unlockAudio();
    playUi();
    setPhase("challenges");
  }

  /** Sfida libera: un livello già completato, condiviso con il miglior risultato salvato. */
  function freeChallenge(level: number) {
    const best = save.bests[String(level)];
    if (!best) {
      setToast(t.freeNoBest);
      begin("campaign", campaignSpec(level), level);
      return;
    }
    withName((name) => {
      const url = challengeLink(name, { level, date: today }, best);
      deliver(`${t.freeShareText(name, level, formatClock(best.ms / 1000), best.mistakes)}\n${url}`, url, t.freeTitle);
    });
  }

  function playChallenge(ch: Challenge) {
    const spec = decodeSpec(ch.code);
    if (spec) begin("challenge", spec, 0, ch.key);
  }

  /** Rimozione in due tocchi: il primo chiede conferma, il secondo rimuove. */
  function removeFriend(id: string) {
    unlockAudio();
    playUi();
    if (pendingRemove !== id) {
      setPendingRemove(id);
      return;
    }
    setPendingRemove(null);
    const gone = save.friends.find((f) => f.id === id);
    if (gone) setToast(t.removed(gone.name));
    setSave((prev) => {
      const next = { ...prev, friends: prev.friends.filter((f) => f.id !== id) };
      writeSave(next);
      return next;
    });
  }

  function openProfile() {
    unlockAudio();
    playUi();
    setPhase("profile");
  }

  /** Scegli o cambia il nome: compare negli inviti, nelle sfide e sulla mappa degli amici. */
  function editName() {
    unlockAudio();
    playUi();
    setAskName(() => (name: string) => setToast(t.nameSaved(name)));
  }

  function saveName(raw: string) {
    const name = cleanName(raw);
    if (!name) return;
    const then = askName;
    setAskName(null);
    setSave((prev) => {
      const next = { ...prev, playerName: name };
      writeSave(next);
      return next;
    });
    then?.(name);
  }

  function requestHint() {
    const sim = simRef.current;
    if (!sim || sim.mode === "rush" || sim.resolved || modalRef.current || intro != null) return;
    unlockAudio();
    if (hintShowing(sim)) return;
    if (hintStock <= 0) {
      playUi();
      setModal("hints");
      return;
    }
    if (!useHint(sim)) return;
    playUi();
    publish(sim);
    setSave((prev) => {
      const next = spendHint(prev, today);
      writeSave(next);
      return next;
    });
  }

  async function watchAdForHint() {
    setModal(null);
    const watched = await showRewardedAd(t.ad);
    const sim = simRef.current;
    if (!watched) {
      setToast(t.adFail);
      return;
    }
    if (sim && !sim.resolved && useHint(sim)) {
      playUi();
      publish(sim);
    }
  }

  function dismissInstall() {
    setSave((prev) => {
      const next = { ...prev, installDismissed: true };
      writeSave(next);
      return next;
    });
  }

  async function install() {
    unlockAudio();
    playUi();
    const ok = await promptInstall();
    if (ok) dismissInstall();
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
    if (!owned) {
      setToast(t.bought);
      playBuy();
    }
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
      {/* Sfondo vivo: luci colorate che si muovono piano (solo transform, fluido anche sui telefoni economici). */}
      <div className="bolt-bg" aria-hidden="true">
        <i className="bolt-glow is-a" />
        <i className="bolt-glow is-b" />
        <i className="bolt-glow is-c" />
      </div>
      {phase === "home" ? (
        <div className="safe-top safe-bot flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex items-center justify-between gap-2 py-3">
            <button
              type="button"
              onClick={openProfile}
              className="bolt-profile-chip"
              aria-label={`${t.profile}: ${save.playerName || t.chooseName}`}
            >
              <span
                className="bolt-avatar is-chip"
                style={{ background: save.playerName ? avatarColor(save.playerId) : "var(--color-line)" }}
                aria-hidden="true"
              >
                {save.playerName ? [...save.playerName][0]?.toUpperCase() : <User className="size-4" />}
              </span>
              <span className="truncate">{save.playerName || t.chooseName}</span>
            </button>
            <div className="flex flex-none items-center gap-2">
              <button
                type="button"
                onClick={openShop}
                aria-label={`${t.shop}: ${save.coins} ${t.coins}`}
                className="bolt-coin-pill"
              >
                <Coins className="size-4 text-accent" />
                <CoinCount value={save.coins} ready={saveReady} />
              </button>
              <button
                type="button"
                onClick={toggleLang}
                aria-label={t.lang}
                title={t.lang}
                className="size-11 rounded-full bg-surface text-sm font-semibold text-fg"
              >
                {t.langShort}
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
            <p className="mb-2 text-xs font-medium tracking-widest text-muted uppercase">{t.kicker}</p>
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

          {homeNudge ? (
            <button
              type="button"
              className={homeNudge.kind === "ahead" ? "bolt-nudge is-ahead" : "bolt-nudge"}
              onClick={() => {
                playUi();
                setPendingRemove(null);
                setPhase("friends");
              }}
            >
              {homeNudge.kind === "ahead" ? <Crown className="size-4" /> : <Users className="size-4" />}
              <span className="min-w-0 flex-1 text-pretty">
                {homeNudge.kind === "behind"
                  ? t.nudgeBehind(homeNudge.name, homeNudge.gap)
                  : homeNudge.kind === "tied"
                    ? t.nudgeTied(homeNudge.name)
                    : t.nudgeAhead}
              </span>
              <ChevronRight className="size-4" />
            </button>
          ) : null}

          <div className="mt-6 flex flex-col gap-3">
            {linkChallenge ? (
              <p className="bolt-versus-invite text-sm text-pretty">
                {t.versusInvite(
                  linkChallenge.from.name,
                  t.challengeWhat(linkChallenge.level, shortDay(linkChallenge.date)),
                  formatClock(linkChallenge.theirs.ms / 1000),
                  linkChallenge.theirs.mistakes,
                )}
              </p>
            ) : null}
            {challenge ? (
              <button
                type="button"
                onClick={() => begin("challenge", challenge, 0, linkChallenge?.key ?? null)}
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
              <button
                type="button"
                onClick={() => {
                  playUi();
                  setPendingRemove(null);
                  setPhase("friends");
                }}
                className="h-11 text-sm font-semibold text-muted"
              >
                <Users className="size-4" />
                {t.friends}
                {save.friends.length ? <span className="tabular-nums">{save.friends.length}</span> : null}
              </button>
            </div>
            <div className="bolt-home-pair">
              <button
                type="button"
                onClick={openChallenges}
                aria-label={pendingCount ? `${t.challengesTitle}: ${t.pendingBadge(pendingCount)}` : t.challengesTitle}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface font-display text-base font-semibold"
              >
                <Swords className="size-4 text-accent" />
                {t.challengesTitle}
                {pendingCount ? <span className="bolt-badge">{pendingCount}</span> : null}
              </button>
              <button
                type="button"
                onClick={invite}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface font-display text-base font-semibold"
              >
                <UserPlus className="size-4 text-accent" />
                {t.invite}
              </button>
            </div>
          </div>

          {showInstall ? (
            <aside className="bolt-install bolt-rise" aria-label={t.installTitle}>
              <img src="./icons/icon-192.png" alt="" width={44} height={44} className="bolt-install-icon" />
              <div className="min-w-0 flex-1">
                <p className="font-display font-extrabold">{t.installTitle}</p>
                <p className="text-sm text-pretty text-muted">{pwaMode === "ios" ? t.installIos : t.installText}</p>
              </div>
              {pwaMode === "prompt" ? (
                <button type="button" onClick={() => void install()} className="bolt-install-add">
                  <Download className="size-4" />
                  {t.install}
                </button>
              ) : null}
              <button type="button" onClick={dismissInstall} aria-label={t.dismiss} className="bolt-install-close">
                <X className="size-4" />
              </button>
            </aside>
          ) : null}

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
              const last =
                ch.last ?? Math.max(ch.first + CHAPTER_SIZE - 1, Math.ceil((Math.max(save.unlocked, topFriendLevel) + 1) / 5) * 5);
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
                      const here = friendsByLevel.get(level);
                      return (
                        <div key={level} className="bolt-level-cell">
                        <button
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
                        {here ? <FriendStack friends={here} label={t.friendsOnLevel(here.map((f) => f.name).join(", "))} /> : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {phase === "friends" ? (
        <div className="safe-top safe-bot flex min-h-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-2">
            <IconButton label={t.back} onClick={goHome}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <h2 className="font-display text-xl font-extrabold">{t.friends}</h2>
            <button type="button" onClick={invite} className="bolt-coin-pill ml-auto" aria-label={t.invite}>
              <UserPlus className="size-4 text-accent" />
              <span className="text-sm">{t.invite}</span>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            {save.friends.length ? (
              <>
                <ol className="bolt-friend-list">
                  {ranking(meAsFriend(save.playerName || t.you), save.friends).map((row, i) => (
                    <li key={row.me ? "me" : row.id} className={row.me ? "bolt-friend-row is-me" : "bolt-friend-row"}>
                      <span className="bolt-friend-rank tabular-nums">{i + 1}</span>
                      <span className="bolt-avatar is-big" style={{ background: avatarColor(row.id) }} aria-hidden="true">
                        {[...row.name][0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display font-extrabold">
                          {row.name}
                          {row.me ? <span className="bolt-me-tag">{t.you}</span> : null}
                        </p>
                        <p className="bolt-friend-stats text-sm text-muted tabular-nums">
                          <span>
                            <Star className="size-3.5 fill-accent text-accent" />
                            {row.stars}
                          </span>
                          <span>
                            <Flame className="size-3.5 text-accent" />
                            {row.streak}
                          </span>
                          {row.me ? null : <span className="bolt-friend-date">{t.updatedOn(shortDay(row.date))}</span>}
                        </p>
                        {!row.me && tallies.find((x) => x.id === row.id) ? (
                          <TallyLine row={tallies.find((x) => x.id === row.id)!} t={t} small />
                        ) : null}
                      </div>
                      <p className="bolt-friend-level tabular-nums">
                        <span>{t.levelShort}</span>
                        {row.level}
                      </p>
                      {row.me ? (
                        <span className="bolt-friend-remove-spacer" aria-hidden="true" />
                      ) : (
                        <button
                          type="button"
                          className={pendingRemove === row.id ? "bolt-friend-remove is-confirm" : "bolt-friend-remove"}
                          aria-label={t.remove(row.name)}
                          onClick={() => removeFriend(row.id)}
                        >
                          {pendingRemove === row.id ? t.confirmRemove : <Trash2 className="size-4" />}
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-center text-sm text-pretty text-muted">{t.friendsHint}</p>
              </>
            ) : (
              <div className="bolt-friends-empty">
                <Users className="size-8 text-accent" />
                <p className="text-pretty text-muted">{t.friendsEmpty}</p>
                <button
                  type="button"
                  onClick={invite}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-6 font-display font-extrabold text-accent-ink"
                >
                  <UserPlus className="size-4" />
                  {t.invite}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {phase === "challenges" ? (
        <div className="safe-top safe-bot flex min-h-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-2">
            <IconButton label={t.back} onClick={goHome}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <h2 className="font-display text-xl font-extrabold">{t.challengesTitle}</h2>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            {tallies.length ? (
              <>
                <h3 className="bolt-shop-title mt-0">{t.tallyTitle}</h3>
                <ul className="bolt-tally-list">
                  {tallies.map((row) => (
                    <li key={row.key}>
                      <TallyLine row={row} t={t} />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <h3 className="bolt-shop-title">
              {t.toPlay}
              {pendingCount ? <span className="bolt-badge ml-2">{pendingCount}</span> : null}
            </h3>
            {pendingList.length ? (
              <ul className="bolt-friend-list">
                {pendingList.map((ch) => (
                  <li key={ch.key} className="bolt-friend-row">
                    <span className="bolt-avatar is-big" style={{ background: avatarColor(ch.from.id || ch.from.name) }} aria-hidden="true">
                      {[...ch.from.name][0]?.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-extrabold">{ch.from.name}</p>
                      <p className="text-sm text-muted">{t.challengeLabel(ch.level, shortDay(ch.date))}</p>
                      <p className="text-sm tabular-nums">
                        <span className="text-muted">{t.toBeat} </span>
                        {formatClock(ch.theirs.ms / 1000)} · {ch.theirs.mistakes} {t.errShort}
                      </p>
                    </div>
                    <button type="button" className="bolt-row-play" onClick={() => playChallenge(ch)}>
                      <Play className="size-4 fill-current" />
                      {t.play}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-pretty text-muted">{t.noPending}</p>
            )}

            <h3 className="bolt-shop-title">{t.freeTitle}</h3>
            {save.unlocked > 3 ? (
              <>
                <p className="text-sm text-pretty text-muted">{t.freeText}</p>
                <div className="bolt-free-grid mt-3">
                  {Array.from({ length: save.unlocked - 3 }, (_, k) => save.unlocked - 1 - k).map((level) => {
                    const best = save.bests[String(level)];
                    return (
                      <button
                        key={level}
                        type="button"
                        className={best ? "bolt-level" : "bolt-level is-nobest"}
                        onClick={() => freeChallenge(level)}
                        aria-label={`${t.continue} ${level}${best ? `: ${formatClock(best.ms / 1000)}` : ""}`}
                      >
                        <span className="font-display text-lg font-extrabold tabular-nums">{level}</span>
                        <span className="bolt-free-best tabular-nums">{best ? formatClock(best.ms / 1000) : "–"}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-pretty text-muted">{t.freeNone}</p>
            )}

            <h3 className="bolt-shop-title">{t.played}</h3>
            {doneList.length ? (
              <ul className="bolt-friend-list">
                {doneList.map((ch) => (
                  <li key={ch.key} className="bolt-friend-row">
                    <span className="bolt-avatar is-big" style={{ background: avatarColor(ch.from.id || ch.from.name) }} aria-hidden="true">
                      {[...ch.from.name][0]?.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-extrabold">{ch.from.name}</p>
                      <p className="text-sm text-muted">{t.challengeLabel(ch.level, shortDay(ch.date))}</p>
                      <p className="bolt-score-pair text-sm tabular-nums">
                        <span>
                          {t.you} {formatClock(ch.mine!.ms / 1000)} · {ch.mine!.mistakes} {t.errShort}
                        </span>
                        <span className="text-muted">
                          {ch.from.name} {formatClock(ch.theirs.ms / 1000)} · {ch.theirs.mistakes} {t.errShort}
                        </span>
                      </p>
                    </div>
                    <span className={`bolt-outcome is-${ch.outcome}`}>
                      {ch.outcome === "win" ? t.won : ch.outcome === "loss" ? t.lost : t.tiedShort}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-pretty text-muted">{t.noDone}</p>
            )}
          </div>
        </div>
      ) : null}

      {phase === "profile" ? (
        <div className="safe-top safe-bot flex min-h-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-2">
            <IconButton label={t.back} onClick={goHome}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <h2 className="font-display text-xl font-extrabold">{t.profile}</h2>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            <section className="bolt-profile-card">
              <span
                className="bolt-avatar is-hero"
                style={{ background: save.playerName ? avatarColor(save.playerId) : "var(--color-line)" }}
                aria-hidden="true"
              >
                {save.playerName ? [...save.playerName][0]?.toUpperCase() : <User className="size-7" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-widest text-muted uppercase">{t.seenAs}</p>
                <p className="truncate font-display text-3xl font-extrabold">{save.playerName || t.noNameYet}</p>
                <p className="mt-1 text-sm text-muted tabular-nums">
                  {t.playerCode} <strong className="text-fg tracking-widest">{save.playerId}</strong>
                </p>
              </div>
            </section>
            <div className="bolt-home-pair mt-3">
              <button
                type="button"
                onClick={editName}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface font-display text-base font-semibold"
              >
                <Pencil className="size-4 text-accent" />
                {save.playerName ? t.editName : t.chooseName}
              </button>
              <button
                type="button"
                onClick={invite}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-display text-base font-extrabold text-accent-ink"
              >
                <UserPlus className="size-4" />
                {t.invite}
              </button>
            </div>

            <h3 className="bolt-shop-title">{t.recordsTitle}</h3>
            <div className="bolt-record-grid">
              {profileStats.map((row) => (
                <div key={row.label} className="bolt-record">
                  <span className="bolt-record-label">{row.label}</span>
                  <span className="bolt-record-value tabular-nums">{row.value}</span>
                </div>
              ))}
            </div>
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
              <CoinCount value={save.coins} ready={saveReady} />
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
                  : t.mistakesN(hud.mistakes)}
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
            <IconButton label={save.sound ? t.soundOn : t.soundOff} onClick={toggleSound}>
              {save.sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            </IconButton>
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
              <div className="scrim bolt-sheet-wrap">
                <div className="bolt-rise bolt-sheet rounded-card bg-surface p-6">
                  {modal === "clear" && result ? (
                    <>
                      {/* Il titolo è il protagonista solo quando c'è festa; sconfitte e pari restano sobrie. */}
                      <p
                        className={
                          celebration?.confetti
                            ? "bolt-result-title is-party"
                            : "text-center text-xs font-semibold tracking-widest text-muted uppercase"
                        }
                      >
                        {celebration
                          ? { perfect: t.perfect, clear: t.clear, done: t.titleDone, won: t.titleWon }[celebration.title]
                          : result.stars === 3
                            ? t.perfect
                            : t.clear}
                      </p>
                      <StarReveal
                        key={result.ms}
                        stars={result.stars}
                        sounds={celebration?.starSounds ?? true}
                        quiet={celebration?.title === "done"}
                        onDone={() => {
                          setStarsDone(true);
                          if (celebration?.confetti) setConfetti(Date.now());
                          if (celebration?.sound === "win") {
                            playWin();
                            vibrate(HAPTIC.win);
                          }
                        }}
                      />
                      <p className="mt-3 text-center text-sm text-muted tabular-nums">
                        {t.mistakesN(result.mistakes)} · {Math.max(1, Math.round(result.ms / 1000))}s
                      </p>
                      {result.coins > 0 ? <EarnedCoins amount={result.coins} label={t.earned} start={starsDone} /> : null}
                      {result.versus ? (
                        <div className="bolt-versus" aria-live="polite">
                          <p className="bolt-versus-title">{t.versusTitle(result.versus.name)}</p>
                          <div className="bolt-versus-grid tabular-nums">
                            <div className={result.versus.winner === "me" ? "is-win" : undefined}>
                              <span>{t.you}</span>
                              <strong>{formatClock(result.ms / 1000)}</strong>
                              <span>
                                {t.mistakesN(result.mistakes)}
                              </span>
                            </div>
                            <div className={result.versus.winner === "other" ? "is-win" : undefined}>
                              <span className="truncate">{result.versus.name}</span>
                              <strong>{formatClock(result.versus.ms / 1000)}</strong>
                              <span>
                                {t.mistakesN(result.versus.mistakes)}
                              </span>
                            </div>
                          </div>
                          <p className={`bolt-versus-verdict is-${result.versus.winner}`}>
                            {result.versus.winner === "me"
                              ? t.youWin
                              : result.versus.winner === "other"
                                ? t.theyWin(result.versus.name)
                                : t.tie}
                          </p>
                        </div>
                      ) : null}
                      {result.log.length ? (
                        <p className="bolt-emoji-row mt-2 text-center" aria-hidden="true">
                          {emojiRow(result.log)}
                        </p>
                      ) : null}
                      {result.log.length ? (
                        <p className="bolt-legend">
                          <span>
                            <i className="is-combo" aria-hidden="true" />
                            {t.legendCombo}
                          </span>
                          <span>
                            <i className="is-plain" aria-hidden="true" />
                            {t.legendPlain}
                          </span>
                          <span>
                            <i className="is-miss" aria-hidden="true" />
                            {t.legendMiss}
                          </span>
                        </p>
                      ) : null}
                      {result.code ? (
                        <div className="mt-2 text-center">
                          <p className="bolt-code-label">{t.challengeCode}</p>
                          <p className="font-display text-lg font-extrabold tracking-widest">{result.code}</p>
                        </div>
                      ) : null}
                      <div className="bolt-sheet-actions mt-5 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (result.versus) {
                              // Rivincita: le spade "colpiscono" con un colpo d'aria.
                              unlockAudio();
                              playWhoosh();
                              vibrate(HAPTIC.tapHot);
                              setStrike(Date.now());
                            }
                            void share(meta.mode === "daily" ? "daily" : meta.mode === "challenge" ? "challenge" : "level");
                          }}
                          className={`flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-display font-extrabold text-accent-ink ${result.versus && result.versus.winner !== "me" ? "bolt-rematch-call" : ""}`}
                        >
                          {result.versus ? (
                            <span key={strike} className={strike ? "bolt-strike" : undefined}>
                              <Swords className="size-4" />
                            </span>
                          ) : (
                            <Share2 className="size-4" />
                          )}
                          {result.versus ? t.rematch : t.share}
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
                  {modal === "hints" ? (
                    <>
                      <p className="text-center font-display text-2xl font-extrabold">{t.hintsOut}</p>
                      <p className="mt-2 text-center text-sm text-pretty text-muted">{t.hintsRefill}</p>
                      <div className="bolt-sheet-actions mt-5 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => void watchAdForHint()}
                          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-2 font-display font-extrabold text-accent-ink"
                        >
                          <Tv className="size-4" />
                          {t.watchAd}
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal(null)}
                          className="h-11 text-sm font-semibold text-muted"
                        >
                          {t.cancel}
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
                      {result.coins > 0 ? <EarnedCoins amount={result.coins} label={t.earned} start /> : null}
                      <div className="bolt-sheet-actions mt-5 flex flex-col gap-2">
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
                  onClick={requestHint}
                  aria-label={hintStock > 0 ? `${t.hint}: ${hintStock} ${t.hintsLeftLabel}` : `${t.hint}: ${t.watchAd}`}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-semibold"
                >
                  {hintStock > 0 ? <Lightbulb className="size-4" /> : <Tv className="size-4" />}
                  {t.hint}
                  <span className={hintStock > 0 ? "bolt-badge" : "bolt-badge is-ad"}>{hintStock > 0 ? hintStock : "+1"}</span>
                </button>
              </>
            )}
            {hud.hot && hud.combo >= 2 ? (
              <p
                key={hud.combo}
                className={hud.combo >= 6 ? "bolt-combo-chip is-gold" : "bolt-combo-chip"}
                aria-label={`${t.combo} x${hud.combo}`}
              >
                x{hud.combo}
              </p>
            ) : (
              <p className="min-w-16 text-right text-sm text-muted tabular-nums">
                {hud.left} {t.arrows}
              </p>
            )}
          </footer>
        </div>
      ) : null}

      {intro != null && phase === "play" ? (
        <button type="button" className="bolt-intro" onClick={closeIntro} autoFocus>
          <span className="bolt-intro-kicker">
            {t.chapter} {intro + 1} · {t.newMechanic}
          </span>
          <MechIllustration mech={intro} />
          <span className="bolt-intro-title" aria-label={t.chapters[intro]!.name}>
            {[...t.chapters[intro]!.name].map((ch, i) => (
              <span key={i} className="bolt-intro-letter" style={{ animationDelay: `${180 + i * 45}ms` }} aria-hidden="true">
                {ch === " " ? "\u00a0" : ch}
              </span>
            ))}
          </span>
          <span className="bolt-intro-text">{t.chapters[intro]!.intro}</span>
          <span className="bolt-intro-cta">{t.tapToStart}</span>
        </button>
      ) : null}

      {askName ? (
        <NameSheet
          t={t}
          initial={save.playerName}
          onSave={saveName}
          onCancel={() => setAskName(null)}
        />
      ) : null}

      {arrival && phase === "home" ? (
        <div className="scrim bolt-sheet-wrap bolt-sheet-top" onClick={(e) => e.target === e.currentTarget && setArrival(null)}>
          <div
            className="bolt-rise bolt-sheet rounded-card bg-surface p-6 text-center"
            role="dialog"
            aria-modal="true"
            aria-label={arrival.friend?.name ?? arrival.challenge?.from.name}
          >
            {(() => {
              const name = arrival.friend?.name ?? arrival.challenge!.from.name;
              const id = arrival.friend?.id ?? arrival.challenge!.from.id;
              const ch = arrival.challenge;
              return (
                <>
                  <span className="bolt-avatar is-hero mx-auto" style={{ background: avatarColor(id || name) }} aria-hidden="true">
                    {[...name][0]?.toUpperCase()}
                  </span>
                  <p className="mt-3 text-xs font-semibold tracking-widest text-muted uppercase">
                    {ch ? t.arrivalChallenge : t.arrivalInvite}
                  </p>
                  <p className="mt-1 font-display text-3xl font-extrabold break-words">{name}</p>
                  {arrival.friend ? (
                    <p className="mt-1 text-sm text-muted tabular-nums">
                      {t.friendAt(arrival.friend.name, arrival.friend.level)} · {arrival.friend.stars}★
                    </p>
                  ) : null}
                  <p className="mt-3 text-sm text-pretty">{arrival.friend ? t.arrivalAdded : ""}</p>
                  {ch ? (
                    <p className="bolt-versus-invite mt-3 text-sm text-pretty">
                      {t.versusInvite(name, t.challengeWhat(ch.level, shortDay(ch.date)), formatClock(ch.theirs.ms / 1000), ch.theirs.mistakes)}
                    </p>
                  ) : null}
                  <div className="mt-5 flex flex-col gap-2">
                    {ch ? (
                      <button
                        type="button"
                        onClick={() => {
                          setArrival(null);
                          playChallenge(ch);
                        }}
                        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-display font-extrabold text-accent-ink"
                      >
                        <Play className="size-4 fill-current" />
                        {t.playChallenge}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setArrival(null);
                          setPendingRemove(null);
                          setPhase("friends");
                        }}
                        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-display font-extrabold text-accent-ink"
                      >
                        <Users className="size-4" />
                        {t.seeFriends}
                      </button>
                    )}
                    <button type="button" onClick={() => setArrival(null)} className="h-11 text-sm font-semibold text-muted">
                      {t.dismiss}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {shareSheet ? <ShareSheet t={t} {...shareSheet} onClose={() => setShareSheet(null)} onToast={setToast} /> : null}

      {toast ? (
        <p className="bolt-toast absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">
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

/** "Tu 3 - 2 Giulia": bilancio delle sfide concluse contro un amico. */
function TallyLine({ row, t, small = false }: { row: Tally; t: (typeof copy)[Lang]; small?: boolean }) {
  const lead = row.wins > row.losses ? "is-ahead" : row.wins < row.losses ? "is-behind" : "";
  return (
    <p className={`bolt-tally ${lead} ${small ? "is-small" : ""}`}>
      <span className="bolt-tally-score tabular-nums">{t.tallyLine(row.wins, row.losses, row.name)}</span>
      {row.ties ? <span className="bolt-tally-ties">{t.tallyTies(row.ties)}</span> : null}
    </p>
  );
}

/** Cerchietti con l'iniziale degli amici fermi su un livello: impilati se sono più di uno. */
function FriendStack({ friends, label }: { friends: Friend[]; label: string }) {
  const shown = friends.slice(0, 3);
  const extra = friends.length - shown.length;
  return (
    <span className="bolt-friend-stack" role="img" aria-label={label} title={label}>
      {shown.map((f) => (
        <span key={f.id} className="bolt-avatar" style={{ background: avatarColor(f.id) }}>
          {[...f.name][0]?.toUpperCase()}
        </span>
      ))}
      {extra > 0 ? <span className="bolt-avatar is-more">+{extra}</span> : null}
    </span>
  );
}

const AVATAR_COLORS = ["#ff4d1c", "#2ec4b6", "#a78bfa", "#ffc93c", "#ff5c8a", "#38bdf8", "#84e05f"];
function avatarColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Pannello di condivisione: link sempre visibile e tasti Condividi / Copia link / WhatsApp. */
function ShareSheet({
  t,
  title,
  text,
  url,
  onClose,
  onToast,
}: {
  t: (typeof copy)[Lang];
  title: string;
  text: string;
  url: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function nativeShare() {
    try {
      await navigator.share({ title: "BOLT", text });
      onClose();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) onToast(t.shareFail);
    }
  }

  async function copyLink() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Ripiego per browser senza appunti asincroni: si seleziona il link e si copia.
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.select();
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
      }
    }
    if (ok) {
      setCopied(true);
      onToast(t.copiedLink);
    } else {
      inputRef.current?.select();
      onToast(t.shareFail);
    }
  }

  return (
    <div className="scrim bolt-sheet-wrap bolt-sheet-top" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bolt-rise bolt-sheet rounded-card bg-surface p-6" role="dialog" aria-modal="true" aria-label={title}>
        <p className="text-center font-display text-2xl font-extrabold">{title}</p>
        <p className="mt-2 text-center text-sm text-pretty text-muted">{t.shareHint}</p>
        <input
          ref={inputRef}
          className="bolt-input bolt-link-input mt-4"
          value={url}
          readOnly
          aria-label={t.shareLinkLabel}
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="mt-4 flex flex-col gap-2">
          {canShare ? (
            <button
              type="button"
              onClick={() => void nativeShare()}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-display font-extrabold text-accent-ink"
            >
              <Share2 className="size-4" />
              {t.shareNative}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void copyLink()}
            className={
              canShare
                ? "flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-bg font-display font-semibold"
                : "flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-display font-extrabold text-accent-ink"
            }
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t.copiedLink : t.copyLink}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-bg font-display font-semibold"
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
          <button type="button" onClick={onClose} className="h-11 text-sm font-semibold text-muted">
            {t.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}

function NameSheet({
  t,
  initial,
  onSave,
  onCancel,
}: {
  t: (typeof copy)[Lang];
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const valid = cleanName(value).length > 0;
  return (
    <div className="scrim bolt-sheet-wrap bolt-sheet-top">
      <form
        className="bolt-rise bolt-sheet rounded-card bg-surface p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave(value);
        }}
      >
        <p className="text-center font-display text-2xl font-extrabold">{t.askNameTitle}</p>
        <p className="mt-2 text-center text-sm text-pretty text-muted">{t.askNameText}</p>
        <input
          className="bolt-input mt-4"
          value={value}
          onChange={(e) => setValue([...e.target.value].slice(0, MAX_NAME).join(""))}
          maxLength={MAX_NAME * 2}
          placeholder={t.namePlaceholder}
          aria-label={t.namePlaceholder}
          autoFocus
          autoComplete="nickname"
          enterKeyHint="done"
        />
        <div className="bolt-sheet-actions mt-4 flex flex-col gap-2">
          <button
            type="submit"
            disabled={!valid}
            className="h-12 rounded-2xl bg-accent font-display font-extrabold text-accent-ink disabled:opacity-40"
          >
            {t.saveName}
          </button>
          <button type="button" onClick={onCancel} className="h-11 text-sm font-semibold text-muted">
            {t.cancel}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Stelle contate una alla volta: ognuna "atterra" con un piccolo rimbalzo e una nota che sale
 * (do, mi, sol; la terza con l'accordo). Le stelle non guadagnate restano grigie e mute.
 */
function StarReveal({
  stars,
  sounds,
  quiet = false,
  onDone,
}: {
  stars: number;
  sounds: boolean;
  /** Sfida persa o pari: stelle mostrate in tono neutro, senza bagliore né rimbalzo. */
  quiet?: boolean;
  onDone: () => void;
}) {
  const [shown, setShown] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const timers: number[] = [];
    for (let i = 0; i < 3; i++) {
      timers.push(
        window.setTimeout(() => {
          setShown(i + 1);
          if (i < stars && sounds) {
            playStar(i);
            vibrate(HAPTIC.star);
          }
        }, STAR_START_MS + i * STAR_STEP_MS),
      );
    }
    timers.push(window.setTimeout(() => doneRef.current(), STAR_START_MS + 2 * STAR_STEP_MS + 260));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [stars, sounds]);
  return (
    <div className={quiet ? "bolt-stars is-quiet" : "bolt-stars"} role="img" aria-label={`${stars} / 3`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < shown ? (i < stars ? "bolt-star is-on" : "bolt-star is-off") : "bolt-star"}>
          <Star className={i < stars && i < shown ? "size-9 fill-accent text-accent" : "size-9 text-line"} />
        </span>
      ))}
    </div>
  );
}

const STAR_START_MS = 280;
const STAR_STEP_MS = 360;

/** Monete guadagnate: il numero conta a scatti con un "tic" per moneta (al massimo 12 tic). */
/**
 * Contatore monete: quando il valore cambia conta fino al nuovo numero (mezzo secondo)
 * con un piccolo rimbalzo, così si "vede" il guadagno tornando in home o comprando.
 */
let lastCoinsShown: number | null = null;

function CoinCount({ value, ready }: { value: number; ready: boolean }) {
  // Si parte dall'ultimo valore mostrato (anche se il contatore è stato smontato durante la partita).
  const [shown, setShown] = useState(lastCoinsShown ?? value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    // Prima che il salvataggio sia caricato il valore è quello iniziale: niente animazione.
    if (!ready) {
      setShown(value);
      return;
    }
    const from = lastCoinsShown ?? value;
    lastCoinsShown = value;
    if (from === value) {
      setShown(value);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(value);
      return;
    }
    setBump(Date.now());
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 500);
      const e = 1 - (1 - k) ** 3;
      setShown(Math.round(from + (value - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ready]);
  return (
    <span key={bump} className={bump ? "tabular-nums bolt-coin-bump" : "tabular-nums"}>
      {shown}
    </span>
  );
}

function EarnedCoins({ amount, label, start }: { amount: number; label: string; start: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    const steps = coinSteps(amount);
    const timers = steps.map((value, i) =>
      window.setTimeout(() => {
        setN(value);
        playCoin(i);
      }, i * 70),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [amount, start]);
  return (
    <p className={start ? "bolt-earned is-counting" : "bolt-earned is-waiting"} aria-label={`+${amount} ${label}`}>
      <Coins className="size-4" />+{n} {label}
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
