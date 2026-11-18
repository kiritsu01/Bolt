/**
 * Invito "Aggiungi alla schermata Home" per iPhone/iPad (Safari): una volta sola, dopo il livello 5.
 * Su iPhone Safari può cancellare i dati dei siti poco visitati; un'app sulla schermata Home li conserva.
 * Il "già mostrato" sta in una chiave a parte: il salvataggio resta alla versione 4.
 */
const KEY = "bolt-ios-home-tip";

export function iosHomeTipDue(s: { ios: boolean; standalone: boolean; unlocked: number; seen: boolean }) {
  return s.ios && !s.standalone && s.unlocked > 5 && !s.seen;
}

export function iosHomeTipSeen() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markIosHomeTipSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* modalità privata: al massimo lo si rivede */
  }
}
