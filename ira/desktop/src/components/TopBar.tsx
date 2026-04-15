import { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import { Window } from "@tauri-apps/api/window";
import IraLogo from "../assets/ira_logo.svg";
import { theme } from "../theme";

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
    <div
      style={{
        height: 70,
        borderRadius: 0,
        background: theme.topBar,
        borderBottom: `1px solid ${theme.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 12,
        position: "relative",
        WebkitAppRegion: "drag" as any,
        width: "100%",
        boxSizing: "border-box",
        fontFamily: theme.fontMono,
        fontSize: 13,
      }}
      data-tauri-drag-region="true"
    >
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 8,
          letterSpacing: 2,
          color: theme.red,
          cursor: "grab",
          userSelect: "none",
          marginRight: 8,
          WebkitAppRegion: "drag" as any,
        }}
        data-tauri-drag-region="true"
        onMouseDown={async (e) => {
          if (typeof e.button === "number" && e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          try {
            await Window.getCurrent().startDragging();
          } catch {
            /* requires core:window:allow-start-dragging */
          }
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          void Window.getCurrent().startDragging().catch(() => {});
        }}
        title="Move window"
      >
        ●●●
      </div>
      <img
        src={IraLogo}
        alt="IRA"
        style={{
          width: 20,
          height: 20,
          border: `1px solid ${theme.green}`,
          borderRadius: 4,
          marginRight: 12,
          objectFit: "cover",
          background: theme.bgInput,
        }}
      />
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          alignItems: "center",
          WebkitAppRegion: "no-drag" as any,
        }}
        data-tauri-drag-region="false"
      >
        <input
          style={{
            height: 42,
            borderRadius: 6,
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
            padding: "0 44px 0 14px",
            fontSize: 13,
            color: theme.text,
            flex: 1,
            outline: "none",
            boxSizing: "border-box",
            fontFamily: theme.fontMono,
          }}
          placeholder="type message…"
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
            <path
              d="M2 10L18 3L11 19L9 11L2 10Z"
              fill="none"
              stroke={theme.green}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {icons}
      <button
        style={{
          padding: "6px 12px",
          borderRadius: 6,
          border: `1px solid ${theme.border}`,
          background: "transparent",
          fontSize: 11,
          color: theme.textMuted,
          marginLeft: "auto",
          WebkitAppRegion: "no-drag" as any,
          fontFamily: theme.fontMono,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
        onClick={onSwitchMode}
        data-tauri-drag-region="false"
      >
        Mode
      </button>
    </div>
  );
}
