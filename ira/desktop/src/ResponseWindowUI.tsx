import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { CHILD_PANEL_PADDING } from "./childPanelConstants";
import { theme } from "./theme";

type ResponsePayload = {
  loading: boolean;
  response: string;
  error: string | null;
  conversation_id?: string | null;
};

const WIDTH = 900;
const MAX_HEIGHT = 700;

const PANEL: React.CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  boxSizing: "border-box",
  background: theme.windowBg,
  borderTop: `1px solid ${theme.border}`,
  borderRadius: 0,
  padding: CHILD_PANEL_PADDING,
  overflow: "auto",
  fontFamily: theme.fontMono,
  fontSize: 13,
};

const btn: React.CSSProperties = {
  border: `1px solid ${theme.border}`,
  background: theme.bgInput,
  cursor: "pointer",
  fontSize: 11,
  padding: "4px 10px",
  borderRadius: 6,
  color: theme.orange,
  fontFamily: theme.fontMono,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export default function ResponseWindowUI() {
  const [state, setState] = useState<ResponsePayload>({
    loading: false,
    response: "",
    error: null,
  });
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; role: string; content: string }>>([]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const show = state.loading || !!state.response || !!state.error;

  useEffect(() => {
    void emit("ira:response-ready", { label: getCurrentWindow().label });
    const unlistenPromise = listen<ResponsePayload>("ira:response-state", (event) => {
      setState(event.payload);
      void getCurrentWindow().show();
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const loadHistory = async () => {
    if (!state.conversation_id) return;
    try {
      const rows = await invoke<Array<{ id: string; role: string; content: string }>>("get_conversation_messages", {
        conversationId: state.conversation_id,
        limit: 50,
      });
      setHistory(rows.reverse());
    } catch {
      setHistory([]);
    }
  };

  const recalcHeight = async () => {
    const win = getCurrentWindow();
    if (!show) {
      await win.hide();
      return;
    }
    const contentHeight = bodyRef.current?.scrollHeight ?? 0;
    const next = Math.min(MAX_HEIGHT, contentHeight);
    await win.setSize(new LogicalSize(WIDTH, Math.max(80, next)));
  };

  useLayoutEffect(() => {
    void getCurrentWindow().hide();
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void recalcHeight();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loading, state.response, state.error, showHistory, history]);

  useEffect(() => {
    if (showHistory) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory, state.conversation_id]);

  const headerText = useMemo(() => {
    if (state.loading) return "$ thinking…";
    if (state.error) return "! error";
    return "$ out";
  }, [state.loading, state.error]);

  return (
    <div ref={bodyRef} style={PANEL}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ color: theme.green, fontSize: 12 }}>{headerText}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setShowHistory((v) => !v)} style={btn}>
            {showHistory ? "hide log" : "log"}
          </button>
          <button
            type="button"
            onClick={() => {
              setState({ loading: false, response: "", error: null });
              void getCurrentWindow().hide();
            }}
            style={{ ...btn, color: theme.textMuted, borderColor: theme.border }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {state.error && <div style={{ color: theme.red, fontSize: 14 }}>{state.error}</div>}
      {state.loading && !state.error && !state.response && (
        <div style={{ color: theme.orange, fontSize: 14 }}>$ …</div>
      )}
      {!!state.response && !state.error && (
        <div style={{ color: theme.text, fontSize: 14, whiteSpace: "pre-line", lineHeight: 1.6 }}>{state.response}</div>
      )}
      {showHistory && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 8, color: theme.textMuted, letterSpacing: "0.1em" }}>
            SESSION LOG
          </div>
          {history.length === 0 && <div style={{ fontSize: 12, color: theme.textDim }}>— empty —</div>}
          {history.map((m) => (
            <div key={m.id} style={{ marginBottom: 10, fontSize: 12, color: theme.text }}>
              <span style={{ color: m.role === "user" ? theme.orange : theme.green }}>{m.role}</span>
              <span style={{ color: theme.textDim }}> › </span>
              <span style={{ whiteSpace: "pre-line" }}>{m.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
