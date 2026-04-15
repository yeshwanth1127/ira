import { ReactNode } from "react";
import { theme } from "../theme";

interface MainResponsePanelProps {
  children: ReactNode;
  onShowHistory: () => void;
}

export default function MainResponsePanel({ children, onShowHistory }: MainResponsePanelProps) {
  return (
    <div
      style={{
        borderRadius: 8,
        background: theme.bgElevated,
        border: `1px solid ${theme.border}`,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: theme.fontMono,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: theme.green, fontSize: 12 }}>⏎</span>
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: "uppercase",
            }}
          >
            ira.stdout
          </span>
        </div>
        <button
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 10,
            color: theme.orange,
            background: "transparent",
            cursor: "pointer",
            fontFamily: theme.fontMono,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
          onClick={onShowHistory}
        >
          history
        </button>
      </div>
      {children}
    </div>
  );
}
