/**
 * Segnali di dispositivo per le decorazioni costose. Il vetro dei pulsanti usa
 * backdrop-filter solo dove il dispositivo può permetterlo: su telefoni lenti,
 * memoria ridotta o risparmio dati resta una tinta traslucida senza blur.
 */

export type DeviceHints = {
  /** Numero di core logici (navigator.hardwareConcurrency). */
  cores?: number;
  /** Memoria approssimativa in GB (navigator.deviceMemory, solo Chromium). */
  memory?: number;
  /** Risparmio dati attivo (navigator.connection.saveData). */
  saveData?: boolean;
};

/** Heuristica volutamente prudente: valori assenti valgono "dispositivo normale". */
export function isLowPowerDevice({ cores, memory, saveData }: DeviceHints): boolean {
  return saveData === true || (cores ?? 8) <= 4 || (memory ?? 8) <= 4;
}

type NavigatorHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

export function detectLowPowerDevice(nav: Navigator): boolean {
  const extra = nav as NavigatorHints;
  return isLowPowerDevice({
    cores: extra.hardwareConcurrency,
    memory: extra.deviceMemory,
    saveData: extra.connection?.saveData,
  });
}

/** Scrive l'esito su <html data-low-power>, letto dai CSS del vetro. */
export function applyPerfHints(doc: Document, nav: Navigator): void {
  doc.documentElement.dataset.lowPower = String(detectLowPowerDevice(nav));
}
