/**
 * IRA desktop — premium privacy-first assistant aesthetic.
 * Single source of truth for the Tauri UI palette.
 */
export const theme = {
  bg: "#050505",
  bgElevated: "#111111",
  bgPanel: "#121212",
  bgInput: "rgba(20, 20, 20, 0.92)",
  border: "rgba(255,255,255,0.08)",
  borderFocus: "#32d74b",
  text: "#e8e8ed",
  textMuted: "#b0b0b8",
  textDim: "#6c6c76",
  /** Primary accent — terminal “OK” / links */
  green: "#54ff7b",
  greenMuted: "#2a7a45",
  /** Warnings / secondary emphasis */
  orange: "#ffb347",
  /** Errors */
  red: "#ff6257",
  white: "#ffffff",
  topBar: "rgba(10, 10, 10, 0.92)",
  /** Opaque webview background (must match CSS panels) */
  windowBg: "#090909",
  shadow: "0 24px 80px rgba(0, 0, 0, 0.55)",
  accentGlow: "rgba(84, 255, 123, 0.22)",
  fontMono:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, "Cascadia Code", "JetBrains Mono", Consolas, monospace',
} as const;
