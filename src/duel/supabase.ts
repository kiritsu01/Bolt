import { RealtimeClient, type RealtimeChannel } from "@supabase/realtime-js";
import { realtimeEndpoint } from "./endpoint";
import type { Msg } from "./protocol";
import type { DuelTransport, Peer } from "./transport";

/**
 * Trasporto Supabase Realtime: un canale "duel:<stanza>" con messaggi broadcast e presenza.
 * Nessun database: i messaggi passano e non vengono salvati.
 */
export class SupabaseTransport implements DuelTransport {
  private client: RealtimeClient;
  private channel: RealtimeChannel | null = null;
  private msgCb: (m: unknown) => void = () => {};
  private presCb: (p: Peer[]) => void = () => {};
  private errCb: () => void = () => {};

  constructor(url: string, key: string) {
    const ws = realtimeEndpoint(url);
    // Battito ogni 5 s: chi perde la rete sparisce presto dalla presenza.
    this.client = new RealtimeClient(ws, { params: { apikey: key }, heartbeatIntervalMs: 5000 });
  }

  join(room: string, me: Peer) {
    return new Promise<void>((resolve, reject) => {
      const ch = this.client.channel(`duel:${room}`, {
        config: { broadcast: { self: false, ack: false }, presence: { key: me.id, enabled: true } },
      });
      this.channel = ch;
      ch.on("broadcast", { event: "m" }, ({ payload }) => this.msgCb(payload));
      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState<{ role: Peer["role"]; name: string }>();
        const peers: Peer[] = [];
        for (const [id, metas] of Object.entries(state)) {
          const meta = metas[0];
          if (meta && (meta.role === "host" || meta.role === "guest")) peers.push({ id, role: meta.role, name: String(meta.name ?? "") });
        }
        this.presCb(peers);
      });
      let settled = false;
      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ role: me.role, name: me.name });
          if (!settled) {
            settled = true;
            resolve();
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (!settled) {
            settled = true;
            reject(new Error(status));
          } else this.errCb();
        }
      }, 10_000);
    });
  }

  send(msg: Msg) {
    void this.channel?.send({ type: "broadcast", event: "m", payload: msg });
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
  leave() {
    const ch = this.channel;
    this.channel = null;
    if (ch) {
      void ch.untrack().catch(() => {});
      void this.client.removeChannel(ch).catch(() => {});
    }
    // Lascia il tempo al saluto di partire, poi chiude la connessione.
    setTimeout(() => this.client.disconnect(), 400);
  }
}
