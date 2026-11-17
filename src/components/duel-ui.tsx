import { useEffect, useRef, useState, type ReactNode } from "react";
import { Home, Lock, Play, Share2, Swords, WifiOff, Zap } from "lucide-react";
import { playCount } from "@/game/audio";
import type { copy, Lang } from "@/game/i18n";
import type { DuelView } from "@/duel/session";

type T = (typeof copy)[Lang];

/** Ridisegna il componente a ogni fotogramma finché `active` è vero (conti alla rovescia). */
function useFrame(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      setN((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

/** Schermata a tutta pagina prima della partita: una frase, un'azione principale. */
export function DuelScreen({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="bolt-duel-screen bolt-rise" role="dialog" aria-label={title}>
      <div className="bolt-duel-icon" aria-hidden="true">
        {icon}
      </div>
      <h2 className="bolt-duel-title">{title}</h2>
      {text ? <p className="bolt-duel-text">{text}</p> : null}
      <div className="bolt-duel-actions">{children}</div>
    </div>
  );
}

export function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-display text-lg font-extrabold text-accent-ink"
    >
      {children}
    </button>
  );
}

export function QuietButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="h-11 w-full text-sm font-semibold text-muted">
      {children}
    </button>
  );
}

/** Tutte le schermate del duello prima e fuori dalla partita. */
export function DuelLobby({
  t,
  view,
  hostName,
  backend,
  online,
  onAccept,
  onCancel,
  onResend,
  onDaily,
  onLevel,
}: {
  t: T;
  view: DuelView | null;
  hostName: string;
  backend: "supabase" | "local" | "off";
  online: boolean;
  onAccept: () => void;
  onCancel: () => void;
  onResend: () => void;
  onDaily: () => void;
  onLevel: () => void;
}) {
  if (backend === "off")
    return (
      <DuelScreen icon={<Swords className="size-9" />} title={t.duelSoon} text={t.duelSoonHint}>
        <PrimaryButton onClick={onDaily}>
          <Play className="size-5 fill-current" />
          {t.duelPlayDaily}
        </PrimaryButton>
        <QuietButton onClick={onCancel}>{t.home}</QuietButton>
      </DuelScreen>
    );
  if (!online && (!view || ["invited", "connecting", "waiting", "handshake"].includes(view.phase)))
    return (
      <DuelScreen icon={<WifiOff className="size-9" />} title={t.duelOffline} text={t.duelOfflineHint}>
        <PrimaryButton onClick={onLevel}>
          <Play className="size-5 fill-current" />
          {t.duelPlayLevel}
        </PrimaryButton>
        <QuietButton onClick={onCancel}>{t.home}</QuietButton>
      </DuelScreen>
    );
  const phase = view?.phase ?? "connecting";
  if (phase === "invited")
    return (
      <DuelScreen icon={<Swords className="size-9" />} title={t.duelInvite(hostName)} text={t.duelInviteHint}>
        <PrimaryButton onClick={onAccept}>
          <Zap className="size-5 fill-current" />
          {t.duelAccept}
        </PrimaryButton>
        <QuietButton onClick={onCancel}>{t.home}</QuietButton>
      </DuelScreen>
    );
  if (phase === "waiting" || (phase === "handshake" && view?.role === "host"))
    return (
      <DuelScreen
        icon={<span className="bolt-duel-pulse" />}
        title={phase === "handshake" && view?.opponent ? t.duelArriving(view.opponent.name) : t.duelWaiting}
        text={phase === "waiting" ? t.duelWaitingHint : undefined}
      >
        <PrimaryButton onClick={onCancel}>{t.cancel}</PrimaryButton>
        {phase === "waiting" ? (
          <QuietButton onClick={onResend}>
            <span className="inline-flex items-center gap-2">
              <Share2 className="size-4" />
              {t.duelResend}
            </span>
          </QuietButton>
        ) : null}
      </DuelScreen>
    );
  if (phase === "connecting" || phase === "handshake")
    return (
      <DuelScreen icon={<span className="bolt-duel-pulse" />} title={t.duelConnecting}>
        <QuietButton onClick={onCancel}>{t.cancel}</QuietButton>
      </DuelScreen>
    );
  if (phase === "expired" || phase === "busy")
    return (
      <DuelScreen
        icon={<Lock className="size-9" />}
        title={phase === "expired" ? t.duelExpired : t.duelBusy}
        text={phase === "expired" ? t.duelExpiredHint : t.duelBusyHint}
      >
        <PrimaryButton onClick={onDaily}>
          <Play className="size-5 fill-current" />
          {t.duelPlayDaily}
        </PrimaryButton>
        <QuietButton onClick={onCancel}>{t.home}</QuietButton>
      </DuelScreen>
    );
  if (phase === "unavailable")
    return (
      <DuelScreen icon={<WifiOff className="size-9" />} title={t.duelUnavailable} text={t.duelUnavailableHint}>
        <PrimaryButton onClick={onLevel}>
          <Play className="size-5 fill-current" />
          {t.duelPlayLevel}
        </PrimaryButton>
        <QuietButton onClick={onCancel}>{t.home}</QuietButton>
      </DuelScreen>
    );
  return null;
}

/** Barre di avanzamento: tu e l'avversario, frecce rimaste in tempo reale. */
export function DuelBar({
  t,
  myLeft,
  myTotal,
  myBlocked,
  oppName,
  oppLeft,
  oppTotal,
  oppBlocked,
}: {
  t: T;
  myLeft: number;
  myTotal: number;
  myBlocked: boolean;
  oppName: string;
  oppLeft: number | null;
  oppTotal: number | null;
  oppBlocked: boolean;
}) {
  const row = (name: string, left: number, total: number, blocked: boolean, mine: boolean) => {
    const done = total > 0 ? (total - left) / total : 0;
    return (
      <div className={`bolt-duel-row${mine ? " is-me" : ""}${blocked ? " is-blocked" : ""}`}>
        <span className="bolt-duel-name">{name}</span>
        <span className="bolt-duel-track" aria-hidden="true">
          <span className="bolt-duel-fill" style={{ transform: `scaleX(${done})` }} />
        </span>
        <span className="bolt-duel-left tabular-nums">{blocked ? t.duelBlocked : left}</span>
      </div>
    );
  };
  return (
    <div className="bolt-duel-bar" aria-live="polite">
      {row(t.duelYou, myLeft, myTotal, myBlocked, true)}
      {row(oppName, oppLeft ?? oppTotal ?? myTotal, oppTotal ?? myTotal, oppBlocked, false)}
    </div>
  );
}

/** 3 - 2 - 1 - Via! sincronizzato sul momento del via (orologio locale). */
export function DuelCountdown({ t, goAt }: { t: T; goAt: number }) {
  const now = performance.now();
  const left = goAt - now;
  const active = left > -700;
  useFrame(active);
  const n = left > 0 ? Math.ceil(left / 1000) : 0;
  const lastRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active || lastRef.current === n) return;
    lastRef.current = n;
    if (n <= 3) playCount(n);
  }, [n, active]);
  if (!active) return null;
  return (
    <div className="bolt-countdown" aria-live="assertive">
      <span key={n} className={n > 0 ? "bolt-count-num" : "bolt-count-num is-go"}>
        {n > 0 ? n : t.duelGo}
      </span>
    </div>
  );
}

/** Errore nel duello: griglia oscurata 2 secondi con un cerchio che si svuota. */
export function DuelBlock({ until }: { until: number }) {
  const left = until - performance.now();
  useFrame(left > 0);
  if (left <= 0) return null;
  return (
    <div className="bolt-duel-block" aria-hidden="true">
      <span className="bolt-duel-ring" style={{ ["--k" as string]: String(Math.max(0, left) / 2000) }}>
        {Math.ceil(left / 1000)}
      </span>
    </div>
  );
}

export function ForfeitBanner({ t, name, at }: { t: T; name: string; at: number }) {
  useFrame(true);
  const s = Math.max(0, Math.ceil((at - performance.now()) / 1000));
  return <p className="bolt-forfeit">{t.duelForfeitIn(name, s)}</p>;
}

export { Home, Swords };
