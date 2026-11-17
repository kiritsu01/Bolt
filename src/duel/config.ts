/**
 * Configurazione del duello live (Supabase Realtime).
 *
 * I due valori si trovano nel pannello del progetto Supabase (Project Settings > API):
 * - l'indirizzo del progetto (Project URL), es. https://abcdefgh.supabase.co
 * - la chiave pubblica (anon / publishable key): è fatta per stare nel codice del sito.
 * Si possono anche passare in fase di build con VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
 * Finché mancano, il pulsante Duello spiega che i duelli non sono ancora disponibili.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? "https://ntprneeezzdcfxlwndox.supabase.co";
export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_S5Qc50oRYLZCkllff3JKTQ_v_1jZvxk";

/** "supabase": duelli veri; "local": prove tra schede dello stesso browser (build e2e); "off": non configurato. */
export function duelBackend(): "supabase" | "local" | "off" {
  if (import.meta.env.MODE === "e2e") return "local";
  return SUPABASE_URL && SUPABASE_ANON_KEY ? "supabase" : "off";
}
