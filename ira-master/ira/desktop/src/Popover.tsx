// This is a placeholder for a popover component using TailwindCSS utility classes.
// In a real project, replace with ShadCN Popover or a similar library if available.
import React from "react";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const Popover: React.FC<PopoverProps> = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        top: 120,
        zIndex: 9999,
        display: "flex",
        width: "90vw",
        minWidth: 260,
        maxWidth: 700,
        transform: "translateX(-50%)",
        justifyContent: "center",
        alignItems: "flex-start",
        pointerEvents: "auto",
        animation: "fadeInPopover 0.35s cubic-bezier(.4,0,.2,1)",
      }}
    >
      <style>{`
        @keyframes fadeInPopover {
          from { opacity: 0; transform: translateX(-50%) translateY(30px) scale(0.98); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
      <div
        style={{
          position: "relative",
          width: "100%",
          borderRadius: 20,
          background: "linear-gradient(135deg, #232526 0%, #414345 100%)",
          color: "#f7f7fa",
          border: "1.5px solid #3a3a3a",
          boxShadow: "0 8px 40px 0 rgba(0,0,0,0.25), 0 1.5px 8px 0 rgba(255,140,105,0.08)",
          padding: 28,
          fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
          fontSize: 17,
          lineHeight: 1.6,
          letterSpacing: 0.01,
          transition: "box-shadow 0.2s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <button
          style={{
            position: "absolute",
            right: 18,
            top: 18,
            color: "#ff8c69",
            background: "rgba(255,255,255,0.08)",
            border: "none",
            borderRadius: "50%",
            width: 36,
            height: 36,
            fontSize: 22,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 1.5px 6px 0 rgba(255,140,105,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.18s cubic-bezier(.4,0,.2,1)",
          }}
          onMouseOver={e => (e.currentTarget.style.background = "rgba(255,140,105,0.18)")}
          onMouseOut={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
};
