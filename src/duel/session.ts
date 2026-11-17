import {
  COUNTDOWN_MS,
  FORFEIT_MS,
  HOST_WAIT_MS,
  arbitrate,
  freshArbiter,
  inviteExpired,
  newSeed,
  parseMsg,
  type Arbiter,
  type DuelInvite,
  type Msg,
  type Role,
} from "./protocol";
import type { DuelTransport, Peer } from "./transport";

export type DuelPhase =
  | "invited" // ospite: link aperto, aspetta il tocco su "Accetta"
  | "connecting"
  | "waiting" // chi ha creato: aspetta l'amico
  | "handshake" // collegati, si misura il ritardo di rete
  | "countdown"
  | "playing"
  | "finished"
  | "expired" // link scaduto o chi l'ha creato non c'è più
  | "busy" // duello già iniziato con un altro
  | "unavailable"; // servizio non raggiungibile

export type DuelResult = {
  winner: "me" | "opponent";
  /** Vittoria a tavolino: l'avversario è uscito o si è disconnesso. */
  forfeit: boolean;
  myMs: number | null;
  oppMs: number | null;
};

export type DuelView = {
  phase: DuelPhase;
  role: Role;
  opponent: { id: string; name: string } | null;
  round: number;
  seed: number;
  /** Momento del "Via!" sull'orologio locale (ms). */
  goAt: number | null;
  oppLeft: number | null;
  oppTotal: number | null;
  oppBlocked: boolean;
  /** Se l'avversario è sparito: momento della vittoria a tavolino. */
  forfeitAt: number | null;
  result: DuelResult | null;
  /** Finito il duello, l'avversario è uscito: niente rivincita. */
  opponentGone: boolean;
  /** Ho finito, aspetto il verdetto di chi ha creato il duello. */
  waitingResult: boolean;
};

export type SessionDeps = {
  transport: DuelTransport;
  me: { id: string; name: string };
  role: Role;
  invite: DuelInvite;
  /** Orologio monotono locale (ms), es. performance.now. */
  now: () => number;
  /** Orologio reale (ms), per la scadenza del link. */
  wallNow?: () => number;
  schedule: (fn: () => void, ms: number) => () => void;
  onChange: (view: DuelView) => void;
  rand?: () => number;
};

const PINGS = 3;

export class DuelSession {
  view: DuelView;
  private d: SessionDeps;
  private arbiter: Arbiter = freshArbiter();
  private timers = new Set<() => void>();
  private forfeitCancel: (() => void) | null = null;
  private pingSent = new Map<number, number>();
  private rtts: number[] = [];
  private readySent = false;
  private helloSent = false;
  private hostSeen = false;
  private left = false;

  constructor(deps: SessionDeps) {
    this.d = deps;
    const expired = inviteExpired(deps.invite, (deps.wallNow ?? Date.now)());
    this.view = {
      phase: deps.role === "guest" ? (expired ? "expired" : "invited") : "connecting",
      role: deps.role,
      opponent: deps.role === "guest" ? { id: deps.invite.hostId, name: deps.invite.hostName } : null,
      round: 0,
      seed: 0,
      goAt: null,
      oppLeft: null,
      oppTotal: null,
      oppBlocked: false,
      forfeitAt: null,
      result: null,
      opponentGone: false,
      waitingResult: false,
    };
    deps.transport.onMessage((raw) => {
      const msg = parseMsg(raw);
      if (msg && !this.left) this.handle(msg);
    });
    deps.transport.onPresence((peers) => !this.left && this.presence(peers));
    deps.transport.onError(() => {
      if (this.left) return;
      if (["connecting", "waiting", "handshake", "invited"].includes(this.view.phase)) this.set({ phase: "unavailable" });
    });
  }

  // --- azioni del giocatore ---------------------------------------------------

  /** Chi ha creato: entra nella stanza e aspetta. Scade dopo 10 minuti dalla creazione. */
  async host() {
    await this.join("host");
    if (this.left) return;
    this.set({ phase: "waiting" });
    const wall = (this.d.wallNow ?? Date.now)();
    this.after(Math.max(0, this.d.invite.createdAt + 10 * 60_000 - wall), () => {
      if (this.view.phase === "waiting") this.set({ phase: "expired" });
    });
  }

  /** Ospite: "Accetta". Se chi ha creato non si vede entro pochi secondi, il duello è scaduto. */
  async accept() {
    if (this.view.phase !== "invited") return;
    this.set({ phase: "connecting" });
    await this.join("guest");
    if (this.left) return;
    this.after(HOST_WAIT_MS, () => {
      if (!this.hostSeen && (this.view.phase === "connecting" || this.view.phase === "handshake")) this.set({ phase: "expired" });
    });
  }

  /** Avanzamento del proprio gioco (frecce rimaste, blocco per errore). */
  progress(left: number, total: number, blocked: boolean) {
    if (this.view.phase !== "playing" && this.view.phase !== "countdown") return;
    this.send({ t: "progress", id: this.d.me.id, round: this.view.round, left, total, blocked });
  }

  /** Ho svuotato la griglia in `ms` dal "Via!". */
  done(ms: number) {
    if (this.view.phase !== "playing" || this.view.result) return;
    const r = Math.max(0, Math.round(ms));
    if (this.d.role === "host") {
      this.judge({ kind: "done", who: "host", ms: r });
      this.tickArbiter();
    } else {
      this.set({ waitingResult: true });
      this.send({ t: "done", id: this.d.me.id, round: this.view.round, ms: r });
    }
  }

  rematch() {
    if (this.view.phase !== "finished" || this.view.opponentGone) return;
    if (this.d.role === "host") this.startRound();
    else this.send({ t: "rematch", id: this.d.me.id });
  }

  /** Annulla o esci: avvisa l'altro e lascia la stanza. */
  leave() {
    if (this.left) return;
    this.send({ t: "bye", id: this.d.me.id });
    this.left = true;
    for (const cancel of this.timers) cancel();
    this.timers.clear();
    this.d.transport.leave();
  }

  // --- interno ---------------------------------------------------------------

  private async join(role: Role) {
    try {
      await this.d.transport.join(this.d.invite.room, { id: this.d.me.id, role, name: this.d.me.name });
    } catch {
      if (!this.left) this.set({ phase: "unavailable" });
    }
  }

  private set(patch: Partial<DuelView>) {
    this.view = { ...this.view, ...patch };
    this.d.onChange(this.view);
  }

  private send(msg: Msg) {
    if (!this.left) this.d.transport.send(msg);
  }

  private after(ms: number, fn: () => void) {
    let cancel: () => void = () => {};
    const wrapped = () => {
      this.timers.delete(cancel);
      if (!this.left) fn();
    };
    cancel = this.d.schedule(wrapped, ms);
    this.timers.add(cancel);
    return () => {
      cancel();
      this.timers.delete(cancel);
    };
  }

  private oppId() {
    return this.view.opponent?.id ?? null;
  }

  private presence(peers: Peer[]) {
    const me = this.d.me.id;
    if (this.d.role === "guest") {
      const host = peers.find((p) => p.id === this.d.invite.hostId && p.role === "host");
      if (host) {
        this.hostSeen = true;
        const others = peers.filter((p) => p.role === "guest" && p.id !== me);
        if (others.length && this.view.phase === "connecting") {
          this.set({ phase: "busy" });
          return;
        }
        if (!this.helloSent && this.view.phase === "connecting") {
          this.helloSent = true;
          this.set({ phase: "handshake" });
          this.send({ t: "hello", id: me, name: this.d.me.name });
        }
      }
    }
    const opp = this.oppId();
    if (!opp) return;
    const present = peers.some((p) => p.id === opp);
    this.opponentPresence(present);
  }

  private opponentPresence(present: boolean, immediate = false) {
    const phase = this.view.phase;
    if (present) {
      if (this.forfeitCancel) {
        this.forfeitCancel();
        this.forfeitCancel = null;
        this.set({ forfeitAt: null });
      }
      return;
    }
    if (phase === "finished") {
      this.set({ opponentGone: true });
      return;
    }
    if (phase === "waiting" || phase === "handshake") {
      if (this.d.role === "host") this.set({ phase: "waiting", opponent: null });
      else this.set({ phase: "expired" });
      return;
    }
    if (phase === "countdown" || phase === "playing") {
      if (immediate) {
        this.forfeitWin();
        return;
      }
      if (this.forfeitCancel) return;
      const at = this.d.now() + FORFEIT_MS;
      this.set({ forfeitAt: at });
      this.forfeitCancel = this.after(FORFEIT_MS, () => {
        this.forfeitCancel = null;
        if (this.view.phase === "countdown" || this.view.phase === "playing") this.forfeitWin();
      });
    }
  }

  private forfeitWin() {
    this.forfeitCancel?.();
    this.forfeitCancel = null;
    this.set({
      phase: "finished",
      forfeitAt: null,
      waitingResult: false,
      opponentGone: true,
      result: { winner: "me", forfeit: true, myMs: null, oppMs: null },
    });
  }

  private handle(msg: Msg) {
    const me = this.d.me.id;
    const host = this.d.role === "host";
    switch (msg.t) {
      case "hello": {
        if (!host) return;
        const current = this.oppId();
        if (current && current !== msg.id) {
          this.send({ t: "busy", to: msg.id });
          return;
        }
        this.set({ opponent: { id: msg.id, name: msg.name }, phase: this.view.phase === "waiting" ? "handshake" : this.view.phase });
        this.send({ t: "welcome", guest: msg.id, name: this.d.me.name });
        return;
      }
      case "welcome": {
        if (host) return;
        if (msg.guest !== me) {
          if (this.view.phase === "handshake" || this.view.phase === "connecting") this.set({ phase: "busy" });
          return;
        }
        this.set({ opponent: { id: this.d.invite.hostId, name: msg.name } });
        for (let n = 0; n < PINGS; n++) {
          this.after(n * 120, () => {
            this.pingSent.set(n, this.d.now());
            this.send({ t: "ping", id: me, n });
          });
        }
        // Se qualche risposta si perde, si parte lo stesso.
        this.after(1500, () => this.sendReady());
        return;
      }
      case "busy":
        if (!host && msg.to === me) this.set({ phase: "busy" });
        return;
      case "ping":
        if (host && msg.id === this.oppId()) this.send({ t: "pong", to: msg.id, n: msg.n });
        return;
      case "pong": {
        if (host || msg.to !== me) return;
        const sent = this.pingSent.get(msg.n);
        if (sent !== undefined) this.rtts.push(this.d.now() - sent);
        if (this.rtts.length >= PINGS) this.sendReady();
        return;
      }
      case "ready":
        if (host && msg.id === this.oppId() && this.view.phase === "handshake") this.startRound();
        return;
      case "start": {
        if (host) return;
        // Il messaggio ha impiegato circa metà del giro di andata e ritorno: lo si sconta.
        const half = this.rtts.length ? median(this.rtts) / 2 : 0;
        this.beginCountdown(msg.round, msg.seed, Math.max(0, msg.delay - half));
        return;
      }
      case "progress":
        if (msg.id === this.oppId() && msg.round === this.view.round)
          this.set({ oppLeft: msg.left, oppTotal: msg.total, oppBlocked: msg.blocked });
        return;
      case "done":
        if (host && msg.id === this.oppId() && msg.round === this.view.round) {
          this.judge({ kind: "done", who: "guest", ms: msg.ms });
          this.tickArbiter();
        }
        return;
      case "result": {
        if (host || msg.round !== this.view.round || this.view.phase !== "playing") return;
        const won = msg.winner === me;
        this.set({
          phase: "finished",
          waitingResult: false,
          result: { winner: won ? "me" : "opponent", forfeit: false, myMs: msg.guestMs, oppMs: msg.hostMs },
        });
        return;
      }
      case "rematch":
        if (host && msg.id === this.oppId() && this.view.phase === "finished" && !this.view.opponentGone) this.startRound();
        return;
      case "bye":
        if (msg.id === this.oppId()) this.opponentPresence(false, true);
        return;
    }
  }

  private sendReady() {
    if (this.readySent || this.d.role !== "guest") return;
    this.readySent = true;
    this.send({ t: "ready", id: this.d.me.id });
  }

  private startRound() {
    const round = this.view.round + 1;
    const seed = newSeed(this.d.rand);
    this.send({ t: "start", round, seed, delay: COUNTDOWN_MS });
    this.beginCountdown(round, seed, COUNTDOWN_MS);
  }

  private beginCountdown(round: number, seed: number, delay: number) {
    this.arbiter = freshArbiter();
    const goAt = this.d.now() + delay;
    this.set({
      phase: "countdown",
      round,
      seed,
      goAt,
      oppLeft: null,
      oppTotal: null,
      oppBlocked: false,
      result: null,
      waitingResult: false,
      forfeitAt: null,
    });
    this.after(delay, () => {
      if (this.view.phase === "countdown" && this.view.round === round) this.set({ phase: "playing" });
    });
  }

  private hostElapsed() {
    return this.view.goAt === null ? 0 : this.d.now() - this.view.goAt;
  }

  private judge(ev: { kind: "done"; who: Role; ms: number } | { kind: "tick" }) {
    this.arbiter = arbitrate(this.arbiter, ev, this.hostElapsed());
    const w = this.arbiter.winner;
    if (!w || this.view.result) return;
    const winnerId = w === "host" ? this.d.me.id : this.oppId()!;
    this.send({ t: "result", round: this.view.round, winner: winnerId, hostMs: this.arbiter.hostMs ?? Math.round(this.hostElapsed()), guestMs: this.arbiter.guestMs });
    this.set({
      phase: "finished",
      waitingResult: false,
      result: {
        winner: w === "host" ? "me" : "opponent",
        forfeit: false,
        myMs: this.arbiter.hostMs,
        oppMs: this.arbiter.guestMs,
      },
    });
  }

  private tickArbiter() {
    if (this.arbiter.winner || this.d.role !== "host") return;
    this.after(100, () => {
      if (this.view.phase !== "playing") return;
      this.judge({ kind: "tick" });
      this.tickArbiter();
    });
  }
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
