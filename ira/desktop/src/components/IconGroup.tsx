import type React from "react";
import { theme } from "../theme";

const ICON_SIZE = 36;

interface IconGroupProps {
  onOpenSettings?: () => void;
}

export default function IconGroup({ onOpenSettings }: IconGroupProps) {
  const iconWrapStyle: React.CSSProperties = {
    width: ICON_SIZE,
    height: ICON_SIZE,
    background: theme.bgInput,
    color: theme.green,
    border: `1px solid ${theme.border}`,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const stroke = theme.green;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginLeft: 24,
        marginRight: 24,
        WebkitAppRegion: "no-drag" as React.CSSProperties["WebkitAppRegion"],
      }}
      data-tauri-drag-region="false"
    >
      <div style={iconWrapStyle}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="6" width="14" height="10" rx="2" stroke={stroke} strokeWidth="2" />
          <circle cx="10" cy="11" r="3" stroke={stroke} strokeWidth="2" />
          <rect x="7" y="3" width="6" height="3" rx="1.5" fill={stroke} />
        </svg>
      </div>
      <div style={iconWrapStyle}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M10 15V5M10 5L6 9M10 5L14 9"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="3" y="15" width="14" height="2" rx="1" fill={stroke} />
        </svg>
      </div>
      <div style={iconWrapStyle}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="7" y="4" width="6" height="8" rx="3" stroke={stroke} strokeWidth="2" />
          <path d="M10 16V18M6 18H14" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div style={iconWrapStyle}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 12V10A6 6 0 0 1 16 10V12" stroke={stroke} strokeWidth="2" />
          <rect x="2" y="12" width="4" height="6" rx="2" fill={stroke} />
          <rect x="14" y="12" width="4" height="6" rx="2" fill={stroke} />
        </svg>
      </div>
      <button
        type="button"
        aria-label="Open settings"
        onClick={onOpenSettings}
        style={{ ...iconWrapStyle, border: "none", cursor: "pointer" }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="3" stroke={stroke} strokeWidth="2" />
          <path
            d="M10 2V4M10 16V18M18 10H16M4 10H2M15.07 15.07L13.66 13.66M6.34 6.34L4.93 4.93M15.07 4.93L13.66 6.34M6.34 13.66L4.93 15.07"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
