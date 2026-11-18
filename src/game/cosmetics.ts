/** Oggetti del negozio: solo estetici, non cambiano il gioco. */

export type ThemeId = "notte" | "carbone" | "oceano" | "bosco" | "prugna" | "brace" | "mezzanotte";
export type ArrowStyle = "classic" | "chevron" | "dart" | "round" | "pixel";

export type Theme = {
  id: ThemeId;
  price: number;
  colors: { bg: string; surface: string; line: string; dot: string; muted: string; fg: string; accent: string };
  /** I tre colori del cielo luminoso, dal viola/indaco al magenta caldo (o ai colori del tema). */
  sky: [string, string, string];
  /** Le tre grandi luci che si muovono e si mescolano: arancio, rosa, ciano. */
  lights: [string, string, string];
  /** Le due luci storiche del duello (gradiente dei pulsanti, non dello sfondo). */
  glow: [string, string];
};

/**
 * Cielo luminoso: ogni tappa resta sopra il 25% di luminosità HSL e tiene il testo chiaro
 * (fg) ad almeno 4,5:1. Il velo scuro dello sfondo (45%) fa il resto sui testi secondari.
 */
export const THEMES: Theme[] = [
  {
    id: "notte",
    price: 0,
    colors: { bg: "#120f2e", surface: "#1e1a45", line: "#2f2a63", dot: "#26215a", muted: "#e2def8", fg: "#fff6e8", accent: "#ff5a1f" },
    sky: ["#4a22b8", "#6a35d6", "#c03a80"],
    lights: ["#ff8a1f", "#ff3d8b", "#3ddcff"],
    glow: ["#7b5cff", "#ff3d8b"],
  },
  {
    id: "carbone",
    price: 30,
    colors: { bg: "#141218", surface: "#221f28", line: "#37323f", dot: "#2a2631", muted: "#e8e3ee", fg: "#fbf8ff", accent: "#ff8a1f" },
    sky: ["#3b235f", "#5c2fa8", "#b0386e"],
    lights: ["#ffb02e", "#ff5c8a", "#5cc8ff"],
    glow: ["#5b6cff", "#ffc23d"],
  },
  {
    id: "oceano",
    price: 40,
    colors: { bg: "#071a33", surface: "#0f2a4d", line: "#1d4373", dot: "#133561", muted: "#dbeafb", fg: "#eef7ff", accent: "#2fd3ff" },
    sky: ["#0e3f9e", "#1c63c9", "#b03f9e"],
    lights: ["#ff9a2e", "#ff4fb0", "#2fd3ff"],
    glow: ["#3a5bff", "#00e0b0"],
  },
  {
    id: "bosco",
    price: 40,
    colors: { bg: "#0a2016", surface: "#133222", line: "#1f4d35", dot: "#183f2b", muted: "#ddf5e2", fg: "#f0fff4", accent: "#8cf25a" },
    sky: ["#1f6b3a", "#2a7a3a", "#5a7a1a"],
    lights: ["#ffc23d", "#ff6b8a", "#66e0ff"],
    glow: ["#00c2a8", "#e8ff4a"],
  },
  {
    id: "prugna",
    price: 50,
    colors: { bg: "#1c0b2e", surface: "#2c1446", line: "#45226b", dot: "#361a57", muted: "#f0e6fb", fg: "#fbf2ff", accent: "#f45cff" },
    sky: ["#5e1f9e", "#8a35c8", "#b83878"],
    lights: ["#ff7a3d", "#ff4fd8", "#5ce1ff"],
    glow: ["#7b4dff", "#ff5c8a"],
  },
  {
    id: "brace",
    price: 50,
    colors: { bg: "#250c06", surface: "#3a160c", line: "#5c2616", dot: "#4a1d10", muted: "#fbe4d6", fg: "#fff3ec", accent: "#ffb02e" },
    sky: ["#7a1e12", "#a84a12", "#9a5a10"],
    lights: ["#ff9a1f", "#ff4f6e", "#7ad8ff"],
    glow: ["#ff3d2e", "#ff7a00"],
  },
  {
    id: "mezzanotte",
    price: 60,
    colors: { bg: "#05050f", surface: "#12122a", line: "#262650", dot: "#1a1a3c", muted: "#e2e2f8", fg: "#f2f2ff", accent: "#ff4f6d" },
    sky: ["#1b247a", "#4a2fb8", "#a83478"],
    lights: ["#ff8a1f", "#ff3d8b", "#4fdcff"],
    glow: ["#4d7cff", "#b04dff"],
  },
];

export const ARROW_STYLES: Array<{ id: ArrowStyle; price: number }> = [
  { id: "classic", price: 0 },
  { id: "chevron", price: 25 },
  { id: "dart", price: 25 },
  { id: "round", price: 35 },
  { id: "pixel", price: 45 },
];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

/** Applica il tema alla pagina (variabili CSS e colore della barra del browser). */
export function applyTheme(id: string) {
  const theme = themeById(id);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.colors)) root.style.setProperty(`--color-${k}`, v);
  root.style.setProperty("--bg-a", theme.sky[0]);
  root.style.setProperty("--bg-b", theme.sky[1]);
  root.style.setProperty("--bg-c", theme.sky[2]);
  root.style.setProperty("--light-a", theme.lights[0]);
  root.style.setProperty("--light-b", theme.lights[1]);
  root.style.setProperty("--light-c", theme.lights[2]);
  root.style.setProperty("--glow-b", theme.glow[0]);
  root.style.setProperty("--glow-c", theme.glow[1]);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.sky[0]);
}

/** Monete guadagnate: 1 per stella nuova, 5 per la Sfida di oggi (una volta al giorno), 1 ogni 100 punti in Rush. */
export const coinsFor = {
  stars: (newStars: number, oldStars: number) => Math.max(0, newStars - oldStars),
  daily: (firstToday: boolean) => (firstToday ? 5 : 0),
  rush: (score: number) => Math.floor(Math.max(0, score) / 100),
};
