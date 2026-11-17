import type { Msg, Role } from "./protocol";

/** Chi è collegato alla stanza in questo momento. */
export type Peer = { id: string; role: Role; name: string };

/**
 * Trasporto del duello: una stanza con messaggi a tutti e "presenza" (chi è collegato).
 * Implementazioni: Supabase Realtime (vero), BroadcastChannel (prove in locale),
 * memoria (test automatici).
 */
export interface DuelTransport {
  join(room: string, me: Peer): Promise<void>;
  send(msg: Msg): void;
  onMessage(cb: (msg: unknown) => void): void;
  onPresence(cb: (peers: Peer[]) => void): void;
  /** Errore di collegamento (servizio non raggiungibile, progetto in pausa...). */
  onError(cb: () => void): void;
  leave(): void;
}

// --- memoria: per i test, più giocatori nello stesso processo --------------------

type MemRoom = { members: Map<string, MemoryTransport> };

export class MemoryHub {
  rooms = new Map<string, MemRoom>();
  /** Ritardo simulato di rete (ms); con 0 i messaggi arrivano subito ma sempre in modo asincrono. */
  delay: number;
  schedule: (fn: () => void, ms: number) => void;
  constructor(delay = 0, schedule: (fn: () => void, ms: number) => void = (fn, ms) => void setTimeout(fn, ms)) {
    this.delay = delay;
    this.schedule = schedule;
  }
  transport() {
    return new MemoryTransport(this);
  }
}

export class MemoryTransport implements DuelTransport {
  private room: MemRoom | null = null;
  private me: Peer | null = null;
  private msgCb: (m: unknown) => void = () => {};
  private presCb: (p: Peer[]) => void = () => {};
  private errCb: () => void = () => {};
  private hub: MemoryHub;
  constructor(hub: MemoryHub) {
    this.hub = hub;
  }

  async join(room: string, me: Peer) {
    let r = this.hub.rooms.get(room);
    if (!r) {
      r = { members: new Map() };
      this.hub.rooms.set(room, r);
    }
    this.room = r;
    this.me = me;
    r.members.set(me.id, this);
    this.syncAll();
  }
  send(msg: Msg) {
    const r = this.room;
    if (!r) return;
    for (const [id, t] of r.members) {
      if (id === this.me?.id) continue;
      const copy = JSON.parse(JSON.stringify(msg));
      this.hub.schedule(() => t.msgCb(copy), this.hub.delay);
    }
  }
  onMessage(cb: (m: unknown) => void) {
    this.msgCb = cb;
  }
  onPresence(cb: (p: Peer[]) => void) {
    this.presCb = cb;
  }
  onError(cb: () => void) {
    this.errCb = cb;
  }
  /** Solo per i test: simula un errore di rete. */
  fail() {
    this.errCb();
  }
  leave() {
    if (!this.room || !this.me) return;
    this.room.members.delete(this.me.id);
    const r = this.room;
    this.room = null;
    for (const t of r.members.values()) t.emitPresence(r);
  }
  private syncAll() {
    const r = this.room;
    if (!r) return;
    for (const t of r.members.values()) t.emitPresence(r);
  }
  private emitPresence(r: MemRoom) {
    const peers = [...r.members.values()].map((t) => t.me!).filter(Boolean);
    this.hub.schedule(() => this.presCb(peers), this.hub.delay);
  }
}

// --- BroadcastChannel: prove tra schede dello stesso browser (build e2e) ----------

/**
 * Stesse regole di Supabase ma tra schede dello stesso browser: serve a provare il duello
 * senza server. La presenza è fatta con un battito ogni 500 ms; chi tace per 2 s è uscito.
 */
export class LocalTransport implements DuelTransport {
  private bc: BroadcastChannel | null = null;
  private me: Peer | null = null;
  private peers = new Map<string, { peer: Peer; seen: number }>();
  private timer = 0;
  private msgCb: (m: unknown) => void = () => {};
  private presCb: (p: Peer[]) => void = () => {};

  async join(room: string, me: Peer) {
    this.me = me;
    this.bc = new BroadcastChannel(`bolt-duel-${room}`);
    this.bc.onmessage = (e) => {
      const d = e.data as { kind: string; peer?: Peer; msg?: unknown };
      if (d.kind === "beat" && d.peer) {
        const isNew = !this.peers.has(d.peer.id);
        this.peers.set(d.peer.id, { peer: d.peer, seen: Date.now() });
        if (isNew) this.emit();
      } else if (d.kind === "gone" && d.peer) {
        if (this.peers.delete(d.peer.id)) this.emit();
      } else if (d.kind === "msg") this.msgCb(d.msg);
    };
    const beat = () => {
      this.bc?.postMessage({ kind: "beat", peer: me });
      const now = Date.now();
      let changed = false;
      for (const [id, p] of this.peers) {
        if (now - p.seen > 2000) {
          this.peers.delete(id);
          changed = true;
        }
      }
      if (changed) this.emit();
    };
    beat();
    this.timer = window.setInterval(beat, 500);
    this.emit();
  }
  private emit() {
    if (!this.me) return;
    this.presCb([this.me, ...[...this.peers.values()].map((p) => p.peer)]);
  }
  send(msg: Msg) {
    this.bc?.postMessage({ kind: "msg", msg });
  }
  onMessage(cb: (m: unknown) => void) {
    this.msgCb = cb;
  }
  onPresence(cb: (p: Peer[]) => void) {
    this.presCb = cb;
  }
  onError() {
    /* nessun errore di rete in locale */
  }
  leave() {
    window.clearInterval(this.timer);
    if (this.me) this.bc?.postMessage({ kind: "gone", peer: this.me });
    this.bc?.close();
    this.bc = null;
  }
}

/** Crea il trasporto giusto; Supabase si carica solo quando serve (il resto del gioco resta offline). */
export async function createTransport(backend: "supabase" | "local", url: string, key: string): Promise<DuelTransport> {
  if (backend === "local") return new LocalTransport();
  const { SupabaseTransport } = await import("./supabase");
  return new SupabaseTransport(url, key);
}
