/** Oggetti del negozio: solo estetici, non cambiano il gioco. */

export type ThemeId = "notte" | "carbone" | "oceano" | "bosco" | "prugna" | "brace" | "mezzanotte";
export type ArrowStyle = "classic" | "chevron" | "dart" | "round" | "pixel";

export type Theme = {
  id: ThemeId;
  price: number;
  colors: { bg: string; surface: string; line: string; dot: string; muted: string; fg: string; accent: string };
  /** Le due luci colorate che si muovono piano nello sfondo (la terza è il colore d'accento). */
  glow: [string, string];
};

// Palette "neon su inchiostro": fondi profondi e saturi invece del quasi-nero, accenti accesi.
// Testo e frecce (fg) restano chiari e caldi per un contrasto sempre leggibile.
export const THEMES: Theme[] = [
  {
    id: "notte",
    price: 0,
    colors: { bg: "#120f2e", surface: "#1e1a45", line: "#2f2a63", dot: "#26215a", muted: "#aba5d6", fg: "#fff6e8", accent: "#ff5a1f" },
    glow: ["#7b5cff", "#ff3d8b"],
  },
  {
    id: "carbone",
    price: 30,
    colors: { bg: "#141218", surface: "#221f28", line: "#37323f", dot: "#2a2631", muted: "#b3acbe", fg: "#fbf8ff", accent: "#ff8a1f" },
    glow: ["#5b6cff", "#ffc23d"],
  },
  {
    id: "oceano",
    price: 40,
    colors: { bg: "#071a33", surface: "#0f2a4d", line: "#1d4373", dot: "#133561", muted: "#93b4db", fg: "#eef7ff", accent: "#2fd3ff" },
    glow: ["#3a5bff", "#00e0b0"],
  },
  {
    id: "bosco",
    price: 40,
    colors: { bg: "#0a2016", surface: "#133222", line: "#1f4d35", dot: "#183f2b", muted: "#9cc7ac", fg: "#f0fff4", accent: "#8cf25a" },
    glow: ["#00c2a8", "#e8ff4a"],
  },
  {
    id: "prugna",
    price: 50,
    colors: { bg: "#1c0b2e", surface: "#2c1446", line: "#45226b", dot: "#361a57", muted: "#c3a6e0", fg: "#fbf2ff", accent: "#f45cff" },
    glow: ["#7b4dff", "#ff5c8a"],
  },
  {
    id: "brace",
    price: 50,
    colors: { bg: "#250c06", surface: "#3a160c", line: "#5c2616", dot: "#4a1d10", muted: "#e0ae98", fg: "#fff3ec", accent: "#ffb02e" },
    glow: ["#ff3d2e", "#ff7a00"],
  },
  {
    id: "mezzanotte",
    price: 60,
    colors: { bg: "#05050f", surface: "#12122a", line: "#262650", dot: "#1a1a3c", muted: "#a0a0d0", fg: "#f2f2ff", accent: "#ff4f6d" },
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
  root.style.setProperty("--glow-b", theme.glow[0]);
  root.style.setProperty("--glow-c", theme.glow[1]);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.colors.bg);
}

/** Monete guadagnate: 1 per stella nuova, 5 per la Sfida di oggi (una volta al giorno), 1 ogni 100 punti in Rush. */
export const coinsFor = {
  stars: (newStars: number, oldStars: number) => Math.max(0, newStars - oldStars),
  daily: (firstToday: boolean) => (firstToday ? 5 : 0),
  rush: (score: number) => Math.floor(Math.max(0, score) / 100),
};
