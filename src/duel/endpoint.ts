/**
 * Indirizzo WebSocket di Supabase Realtime a partire dall'indirizzo del progetto.
 * Accetta anche indirizzi copiati con un percorso in fondo (es. ".../rest/v1/"):
 * conta solo il dominio del progetto.
 */
export function realtimeEndpoint(projectUrl: string) {
  const u = new URL(projectUrl.trim());
  const proto = u.protocol === "http:" ? "ws:" : "wss:";
  return `${proto}//${u.host}/realtime/v1`;
}
