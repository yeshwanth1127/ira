/**
 * IRA desktop — minimal terminal aesthetic (black, green / orange / red).
 * Single source of truth for the Tauri UI palette.
 */
export const theme = {
  bg: "#0a0a0a",
  bgElevated: "#121212",
  bgPanel: "#141414",
  bgInput: "#1c1c1c",
  border: "#2e2e2e",
  borderFocus: "#32d74b",
  text: "#e8e8ed",
  textMuted: "#8e8e93",
  textDim: "#636366",
  /** Primary accent — terminal “OK” / links */
  green: "#32d74b",
  greenMuted: "#1a5c28",
  /** Warnings / secondary emphasis */
  orange: "#ff9f0a",
  /** Errors */
  red: "#ff453a",
  white: "#ffffff",
  topBar: "#0a0a0a",
  /** Opaque webview background (must match CSS panels) */
  windowBg: "#121212",
  fontMono:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, "Cascadia Code", "JetBrains Mono", Consolas, monospace',
} as const;
