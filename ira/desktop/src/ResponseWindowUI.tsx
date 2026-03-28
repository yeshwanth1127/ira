import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

type ResponsePayload = {
  loading: boolean;
  response: string;
  error: string | null;
  conversation_id?: string | null;
};

const WIDTH = 900;
const MAX_HEIGHT = 700;

/** Fills the webview client area edge-to-edge (opaque window + fixed layer). */
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
  background: "#E59898",
  borderRadius: 0,
  padding: 16,
  overflow: "auto",
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
    // Tell the main window we're ready to receive state.
    void emit("ira:response-ready", { label: getCurrentWindow().label });
    const unlistenPromise = listen<ResponsePayload>("ira:response-state", (event) => {
      setState(event.payload);
      // Ensure visible when updates arrive.
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
    // Start hidden until we receive state from main.
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
    if (state.loading) return "Thinking...";
    if (state.error) return "Error";
    return "Response";
  }, [state.loading, state.error]);

  return (
    <div ref={bodyRef} style={PANEL}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ color: "#333", fontSize: 13, opacity: 0.85 }}>{headerText}</div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          style={{
            border: "1px solid #5a4444",
            background: "transparent",
            cursor: "pointer",
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 6,
            color: "#3A2F2F",
          }}
        >
          {showHistory ? "Hide History" : "Show History"}
        </button>
        <button
          onClick={() => {
            setState({ loading: false, response: "", error: null });
            void getCurrentWindow().hide();
          }}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: "16px",
            padding: "4px 8px",
            borderRadius: 8,
            color: "#3A2F2F",
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {state.error && <div style={{ color: "#333", fontSize: 15 }}>{state.error}</div>}
      {state.loading && !state.error && !state.response && (
        <div style={{ color: "#333", fontSize: 15 }}>Generating response...</div>
      )}
      {!!state.response && !state.error && (
        <div style={{ color: "#222", fontSize: 15, whiteSpace: "pre-line" }}>{state.response}</div>
      )}
      {showHistory && (
        <div style={{ marginTop: 12, borderTop: "1px solid #b67f7f", paddingTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#3A2F2F" }}>Conversation history</div>
          {history.length === 0 && <div style={{ fontSize: 13, color: "#444" }}>No history yet.</div>}
          {history.map((m) => (
            <div key={m.id} style={{ marginBottom: 8, fontSize: 13, color: "#2a2a2a" }}>
              <strong>{m.role}:</strong> <span style={{ whiteSpace: "pre-line" }}>{m.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
