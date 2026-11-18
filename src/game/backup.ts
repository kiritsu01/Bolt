import { hash32 } from "./logic";
import { parseSave, type Save } from "./save";

/**
 * Esporta / importa il salvataggio come un codice di testo da copiare e incollare
 * (per cambiare telefono o non perdere i progressi). Il formato del salvataggio non cambia:
 * il codice contiene il salvataggio così com'è, e all'importazione passa dalla stessa
 * lettura usata all'avvio (che converte anche le versioni vecchie e scarta i dati rotti).
 *
 * Formato: BOLT1.<json in base64url>.<controllo>
 */

const PREFIX = "BOLT1";
/** Limite di sicurezza: un salvataggio vero sta ben sotto i 100 KB. */
const MAX_LEN = 400_000;

function toB64url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(code: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function checksum(body: string) {
  return hash32(`bolt-backup:${body}`).toString(36);
}

export function encodeBackup(save: Save) {
  const body = toB64url(JSON.stringify(save));
  return `${PREFIX}.${body}.${checksum(body)}`;
}

/** Legge un codice incollato: tollera spazi e a capo; null se non è un salvataggio BOLT valido. */
export function decodeBackup(input: string | null | undefined): Save | null {
  if (typeof input !== "string") return null;
  const code = input.replace(/\s+/g, "");
  if (!code || code.length > MAX_LEN) return null;
  const parts = code.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, body, sum] = parts;
  if (!body || sum !== checksum(body)) return null;
  const json = fromB64url(body);
  if (json === null) return null;
  try {
    return parseSave(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Riassunto da mostrare prima di sostituire i progressi. */
export function backupSummary(save: Save) {
  return {
    level: save.unlocked,
    stars: Object.values(save.stars).reduce((n, s) => n + s, 0),
    coins: save.coins,
    friends: save.friends.length,
    name: save.playerName,
  };
}
