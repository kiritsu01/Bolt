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
