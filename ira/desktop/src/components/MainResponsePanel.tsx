
import { ReactNode } from "react";

const COLORS = {
  mainPanel: "#E8A5A5",
  accent: "#3A2F2F",
  primary: "#1A1A1A",
};

interface MainResponsePanelProps {
  children: ReactNode;
  onShowHistory: () => void;
}

export default function MainResponsePanel({
  children,
  onShowHistory,
}: MainResponsePanelProps) {
  return (
    <div style={{
      borderRadius: 20,
      background: COLORS.mainPanel,
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      {/* Header Row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: COLORS.accent, fontSize: 14 }}>*</span>
          <span style={{
            fontSize: 11,
            letterSpacing: 1,
            fontWeight: 600,
            color: COLORS.primary,
            textTransform: "uppercase",
          }}>
            IRA’S RESPONSE
          </span>
        </div>
        <button
          style={{
            border: `2px solid ${COLORS.accent}`,
            borderRadius: 16,
            padding: "4px 10px",
            fontSize: 11,
            color: COLORS.primary,
            background: "transparent",
          }}
          onClick={onShowHistory}
        >
          Show chat history
        </button>
      </div>
      {children}
    </div>
  );
}
