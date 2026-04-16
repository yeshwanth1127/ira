import { ChangeEvent, KeyboardEvent, ReactNode, isValidElement, useEffect, useRef, useState } from "react";
import { Window } from "@tauri-apps/api/window";
import IraLogo from "../assets/ira_logo.svg";
import { theme } from "../theme";

interface TopBarProps {
  input: string;
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onInputFocus?: () => void;
  disabled: boolean;
  icons: ReactNode;
  onSwitchMode: (mode: "Agent Mode") => void;
}

export default function TopBar({
  input,
  onInputChange,
  onSend,
  onInputFocus,
  disabled,
  icons,
  onSwitchMode,
}: TopBarProps) {
  const [iconsHover, setIconsHover] = useState(false);
  const [sendHover, setSendHover] = useState(false);
  const [modeHover, setModeHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<"Agent Mode" | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const modeButtonRef = useRef<HTMLButtonElement | null>(null);
  const iconStroke = theme.green;
  const iconWrapStyle = {
    width: 36,
    height: 36,
    background: theme.bgInput,
    color: theme.green,
    border: `1px solid ${theme.border}`,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;
  const settingsHandler =
    isValidElement(icons) && typeof (icons.props as { onOpenSettings?: unknown })?.onOpenSettings === "function"
      ? ((icons.props as { onOpenSettings?: () => void }).onOpenSettings as (() => void))
      : undefined;

  useEffect(() => {
    if (!menuOpen) return;

    const handleOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || modeButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, [menuOpen]);

  return (
    <div
      style={{
        height: 70,
        borderRadius: "28px",
        background: theme.topBar,
        border: `1px solid ${theme.border}`,
        boxShadow: theme.shadow,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        display: "flex",
        alignItems: "center",
        padding: "0 18px",
        width: "100%",
        maxWidth: "100%",
        margin: 0,
        gap: 12,
        position: "relative",
        WebkitAppRegion: "drag" as any,
        boxSizing: "border-box",
        fontFamily: theme.fontMono,
        fontSize: 13,
        overflow: "visible",
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
            height: 50,
            borderRadius: 16,
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
            padding: "0 48px 0 16px",
            fontSize: 13,
            color: theme.text,
            flex: 1,
            outline: "none",
            boxSizing: "border-box",
            fontFamily: theme.fontMono,
            boxShadow: `inset 0 0 0 1px ${theme.border}, inset 0 0 40px rgba(50,215,75,0.05)`,
          }}
          placeholder="type message…"
          value={input}
          onChange={onInputChange}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && onSend()}
          onClick={onInputFocus}
          disabled={disabled}
        />
        <button
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: `translateY(-50%) ${sendHover ? "scale(1.04)" : "scale(1)"}`,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.18s ease, filter 0.18s ease",
            filter: sendHover ? "drop-shadow(0 0 18px rgba(50,215,75,0.45))" : "none",
          }}
          aria-label="Send"
          onClick={onSend}
          onMouseEnter={() => setSendHover(true)}
          onMouseLeave={() => setSendHover(false)}
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginLeft: 24,
          marginRight: 24,
          WebkitAppRegion: "no-drag" as any,
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          transform: iconsHover ? "translateY(-1px)" : "translateY(0)",
          boxShadow: iconsHover ? "0 18px 40px rgba(0,0,0,0.18)" : "none",
        }}
        data-tauri-drag-region="false"
        onMouseEnter={() => setIconsHover(true)}
        onMouseLeave={() => setIconsHover(false)}
      >
        <div style={iconWrapStyle}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="3" y="6" width="14" height="10" rx="2" stroke={iconStroke} strokeWidth="1.8" />
            <circle cx="10" cy="11" r="2.8" stroke={iconStroke} strokeWidth="1.8" />
            <path d="M7 6L8.5 4.5H11.5L13 6" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={iconWrapStyle}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M10 14V5" stroke={iconStroke} strokeWidth="1.9" strokeLinecap="round" />
            <path d="M6.5 8.5L10 5L13.5 8.5" stroke={iconStroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="3" y="14.5" width="14" height="2.5" rx="1.2" fill={iconStroke} />
          </svg>
        </div>
        <div style={iconWrapStyle}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="7" y="3.8" width="6" height="8.8" rx="3" stroke={iconStroke} strokeWidth="1.8" />
            <path d="M5.4 10.2V10.8C5.4 13.4 7.5 15.5 10.1 15.5C12.7 15.5 14.8 13.4 14.8 10.8V10.2" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M10 15.5V17.5M7.5 17.5H12.5" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <div style={iconWrapStyle}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M4.2 9.8V10.7C4.2 13.9 6.8 16.5 10 16.5C13.2 16.5 15.8 13.9 15.8 10.7V9.8" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" />
            <rect x="2" y="10" width="3.4" height="6" rx="1.7" fill={iconStroke} />
            <rect x="14.6" y="10" width="3.4" height="6" rx="1.7" fill={iconStroke} />
          </svg>
        </div>
        <button
          type="button"
          aria-label="Open settings"
          onClick={settingsHandler}
          style={{ ...iconWrapStyle, border: "none", cursor: "pointer" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="10" cy="10" r="3" stroke={iconStroke} strokeWidth="1.8" />
            <path d="M10 2.8V4.4M10 15.6V17.2M17.2 10H15.6M4.4 10H2.8" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M15.1 4.9L13.9 6.1M6.1 13.9L4.9 15.1M15.1 15.1L13.9 13.9M6.1 6.1L4.9 4.9" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div
        style={{ position: "relative", marginLeft: "auto", display: "inline-flex", WebkitAppRegion: "no-drag" as any, overflow: "visible", zIndex: 100 }}
        data-tauri-drag-region="false"
      >
        <button
          ref={modeButtonRef}
          data-mode-trigger="true"
          style={{
            width: 110,
            padding: "7px 14px",
            borderRadius: 18,
            border: `1px solid ${theme.border}`,
            background: "rgba(20,20,20,0.9)",
            fontSize: 11,
            color: theme.textMuted,
            WebkitAppRegion: "no-drag" as any,
            fontFamily: theme.fontMono,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            transition: "transform 0.18s ease, box-shadow 0.18s ease",
            transform: modeHover ? "translateY(-1px)" : "translateY(0)",
            boxShadow: modeHover ? "0 10px 30px rgba(0,0,0,0.25)" : "none",
            whiteSpace: "nowrap",
          }}
          onClick={() => setMenuOpen((open) => !open)}
          onMouseEnter={() => setModeHover(true)}
          onMouseLeave={() => setModeHover(false)}
          data-tauri-drag-region="false"
          type="button"
        >
          <span style={{ color: theme.textMuted }}>MODE</span>
          {selectedMode && (
            <span style={{ color: theme.green, marginLeft: 4 }}>
              • AGENT
            </span>
          )}
        </button>
        <div
          ref={menuRef}
          data-tauri-drag-region="false"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            minWidth: 172,
            borderRadius: 18,
            background: "rgba(18, 18, 18, 0.94)",
            border: `1px solid ${theme.border}`,
            boxShadow: "0 22px 56px rgba(0, 0, 0, 0.35)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            padding: "8px 0",
            opacity: menuOpen ? 1 : 0,
            transform: menuOpen ? "scale(1)" : "scale(0.96)",
            transformOrigin: "top right",
            transition: "opacity 160ms ease, transform 160ms ease",
            pointerEvents: menuOpen ? "auto" : "none",
            zIndex: 1000,
          }}
        >
          {( ["Agent Mode"] as const ).map((mode) => {
            const selected = selectedMode === mode;
            return (
              <button
                key={mode}
                type="button"
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  background: selected ? "rgba(84, 255, 123, 0.14)" : "transparent",
                  color: selected ? theme.green : theme.text,
                  border: "none",
                  textAlign: "left",
                  fontSize: 12,
                  fontFamily: theme.fontMono,
                  cursor: "pointer",
                  outline: "none",
                  borderRadius: 14,
                  margin: "4px 8px",
                  transition: "background 140ms ease",
                }}
                onClick={() => {
                  setSelectedMode(mode);
                  setMenuOpen(false);
                  onSwitchMode(mode);
                }}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
