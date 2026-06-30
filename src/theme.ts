// Brand tokens - ZABAL Gamez arcade palette (gold + cyan on near-black cabinet).
// `orange`/`purple` keep their names so components don't change, but now carry the
// ZABAL gold + cyan so the whole recap reskins from this one file.
export const theme = {
  navy: "#0a0a16",
  surface: "#161628",
  border: "#2a2a4a",
  orange: "#F5C842", // ZABAL gold - primary accent (rings, active caption word, labels)
  orangeHover: "#FFD95E",
  purple: "#00E5FF", // ZABAL cyan - secondary accent (waveform tail, glow)
  purpleHover: "#4DEEFF",
  cream: "#FFF8F0",
  textOnDark: "#e8e8f0",
  textOnDarkSecondary: "#a0a0c0",
  textOnDarkTertiary: "#7a7a9a",
  fontSans:
    "'SF Pro Display', 'SF Pro', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;
