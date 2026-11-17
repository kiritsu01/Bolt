/** Oggetti del negozio: solo estetici, non cambiano il gioco. */

export type ThemeId = "notte" | "carbone" | "oceano" | "bosco" | "prugna" | "brace" | "mezzanotte";
export type ArrowStyle = "classic" | "chevron" | "dart" | "round" | "pixel";

export type Theme = {
  id: ThemeId;
  price: number;
  colors: { bg: string; surface: string; line: string; dot: string; muted: string; fg: string; accent: string };
};

export const THEMES: Theme[] = [
  {
    id: "notte",
    price: 0,
    colors: { bg: "#101412", surface: "#1a211c", line: "#2c362f", dot: "#24302a", muted: "#9aa396", fg: "#f3efe4", accent: "#ff4d1c" },
  },
  {
    id: "carbone",
    price: 30,
    colors: { bg: "#121212", surface: "#1e1e20", line: "#323236", dot: "#252528", muted: "#a3a3aa", fg: "#f5f5f7", accent: "#ff8a1f" },
  },
  {
    id: "oceano",
    price: 40,
    colors: { bg: "#0b1320", surface: "#13203a", line: "#233759", dot: "#182a47", muted: "#8fa3c4", fg: "#eaf2ff", accent: "#38bdf8" },
  },
  {
    id: "bosco",
    price: 40,
    colors: { bg: "#0d1811", surface: "#16271b", line: "#26422e", dot: "#1b3022", muted: "#94b39c", fg: "#eef6ea", accent: "#84e05f" },
  },
  {
    id: "prugna",
    price: 50,
    colors: { bg: "#150f1c", surface: "#22172d", line: "#3a2a4a", dot: "#2a1d37", muted: "#ad9cc0", fg: "#f6efff", accent: "#e879f9" },
  },
  {
    id: "brace",
    price: 50,
    colors: { bg: "#190f0b", surface: "#2a1812", line: "#46281e", dot: "#331d16", muted: "#c4a093", fg: "#fff1ea", accent: "#ffb02e" },
  },
  {
    id: "mezzanotte",
    price: 60,
    colors: { bg: "#08080e", surface: "#13131e", line: "#26263c", dot: "#1a1a29", muted: "#9696b8", fg: "#f0f0ff", accent: "#ff4f6d" },
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.colors.bg);
}

/** Monete guadagnate: 1 per stella nuova, 5 per la Sfida di oggi (una volta al giorno), 1 ogni 100 punti in Rush. */
export const coinsFor = {
  stars: (newStars: number, oldStars: number) => Math.max(0, newStars - oldStars),
  daily: (firstToday: boolean) => (firstToday ? 5 : 0),
  rush: (score: number) => Math.floor(Math.max(0, score) / 100),
};
