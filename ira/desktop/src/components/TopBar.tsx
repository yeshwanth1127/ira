import { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import { Window } from "@tauri-apps/api/window";
import IraLogo from "../assets/ira_logo.svg";

const COLORS = {
  topBar: "#E6D6D6",
  accent: "#3A2F2F",
  primary: "#1A1A1A",
};

interface TopBarProps {
  input: string;
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSend: () => void;
  disabled: boolean;
  icons: ReactNode;
  onSwitchMode: () => void;
}

export default function TopBar({
  input,
  onInputChange,
  onSend,
  disabled,
  icons,
  onSwitchMode,
}: TopBarProps) {
  return (
    <div style={{
      height: 70,
      borderRadius: 0,
      background: COLORS.topBar,
      display: "flex",
      alignItems: "center",
      padding: "0 16px",
      gap: 12,
      position: "relative",
      // Helps some Windows configurations treat the area as draggable.
      WebkitAppRegion: "drag" as any,
      width: "100%",
      boxSizing: "border-box",
    }} data-tauri-drag-region="true">
      {/* Left: Draggable Three-dot Button */}
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          color: COLORS.accent,
          cursor: "grab",
          userSelect: "none",
          marginRight: 8,
          WebkitAppRegion: "drag" as any,
        }}
        data-tauri-drag-region="true"
        onMouseDown={async (e) => {
          // Only start drag on primary mouse button.
          if (typeof e.button === "number" && e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          await Window.getCurrent().startDragging();
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          void Window.getCurrent().startDragging();
        }}
        title="Move window"
      >
        &#8226;&#8226;&#8226;
      </div>
      {/* IRA Logo */}
      <img
        src={IraLogo}
        alt="IRA Logo"
        style={{
          width: 20,
          height: 20,
          border: `2px solid ${COLORS.accent}`,
          borderRadius: 4,
          marginRight: 12,
          objectFit: "cover",
          background: "#fff",
        }}
      />
      {/* Input Field with Send Button */}
      <div style={{
        position: "relative",
        flex: 1,
        display: "flex",
        alignItems: "center",
        WebkitAppRegion: "no-drag" as any,
      }} data-tauri-drag-region="false">
        <input
          style={{
            height: 42,
            borderRadius: 20,
            background: "transparent",
            border: `2px solid ${COLORS.accent}`,
            padding: "0 44px 0 16px",
            fontSize: 14,
            color: COLORS.primary,
            flex: 1,
            outline: "none",
            boxSizing: "border-box",
          }}
          placeholder="Type your message..."
          value={input}
          onChange={onInputChange}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && onSend()}
          disabled={disabled}
        />
        <button
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Send"
          onClick={onSend}
          disabled={disabled}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 10L18 3L11 19L9 11L2 10Z" fill="none" stroke="#3A2F2F" strokeWidth="2" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      {/* Center Icon Group */}
      {icons}
      {/* Right: Switch Mode Button */}
      <button
        style={{
          padding: "6px 14px",
          borderRadius: 20,
          border: `2px solid ${COLORS.accent}`,
          background: "transparent",
          fontSize: 12,
          color: COLORS.primary,
          marginLeft: "auto",
          WebkitAppRegion: "no-drag" as any,
        }}
        onClick={onSwitchMode}
        data-tauri-drag-region="false"
      >
        Switch Mode
      </button>
    </div>
  );
}
