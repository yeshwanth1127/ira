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
  history?: Array<{ id: string; role: string; content: string }>;
};

const CHAT_WIDTH = 900;
const CHAT_HEIGHT = 650;
const AGENT_WIDTH = 500;
const AGENT_HEIGHT = 500;

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

export default function ResponseWindowUI(props?: { history?: Array<{ id: string; role: string; content: string }>; setHistory?: React.Dispatch<React.SetStateAction<Array<{ id: string; role: string; content: string }>>> }) {
  const [state, setState] = useState<ResponsePayload>({
    loading: false,
    response: "",
    error: null,
  });
  const [activePanel, setActivePanel] = useState<"chat" | "agent" | null>("chat");
  const activeMode = activePanel === "agent" ? "Agent Mode" : activePanel === "chat" ? "Chat Mode" : null;
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; role: string; content: string }>>(props?.history ?? []);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  console.log("[CHAT DEBUG] Current history:", history);

  const show = activePanel === "chat" || activePanel === "agent" || state.loading || !!state.response || !!state.error;
  // Fixed compact square window for both modes

  const handleNewChat = async () => {
    try {
      const conversationId = await invoke<string>("start_conversation", { title: "IRA chat" });
      // Clear history and response for new chat
      setHistory([]);
      setState({ loading: false, response: "", error: null, conversation_id: conversationId });
      // Store the new conversation ID (if this component has access - but it may need to emit to parent)
    } catch (err) {
      console.error("Failed to start new conversation", err);
    }
  };

  const handleClearMode = () => {
    setActivePanel(null);
    setShowHistory(false);
    setState({ loading: false, response: "", error: null });
    void getCurrentWindow().close();
    void emit("ira:clear-mode", {});
  };

  useEffect(() => {
    void emit("ira:response-ready", { label: getCurrentWindow().label });
    let unlistenResponse: (() => void) | null = null;
    let unlistenMode: (() => void) | null = null;

    void listen<ResponsePayload>("ira:response-state", (event) => {
      setState(event.payload);
      if (event.payload.history) {
        setHistory(event.payload.history);
      }
      void getCurrentWindow().show();
    }).then((fn) => {
      unlistenResponse = fn;
    });

    void listen<{ activeMode: "Chat Mode" | "Agent Mode" }>("ira:active-mode", (event) => {
      const receivedMode = event.payload?.activeMode;
      const receivedPanel = (event.payload as { activePanel?: "chat" | "agent" } | undefined)?.activePanel ?? (receivedMode === "Agent Mode" ? "agent" : receivedMode === "Chat Mode" ? "chat" : null);
      console.log("ira:active-mode received", { receivedMode });
      if (receivedPanel) {
        setActivePanel(receivedPanel);
      }
      void getCurrentWindow()
        .isVisible()
        .then((visible) => console.log("ira:active-mode window visible", { visible }));
    }).then((fn) => {
      unlistenMode = fn;
    });

    return () => {
      if (unlistenResponse) unlistenResponse();
      if (unlistenMode) unlistenMode();
    };
  }, []);

  useEffect(() => {
    if (!activePanel) return;
    setShowHistory(false);
  }, [activePanel]);

  // Dispatch usage-refresh event when response completes successfully
  useEffect(() => {
    if (!state.loading && state.response && !state.error) {
      void emit("usage-refresh");
    }
  }, [state.loading, state.response, state.error]);

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
    const width = activeMode === "Chat Mode" ? CHAT_WIDTH : AGENT_WIDTH;
    const height = activeMode === "Chat Mode" ? CHAT_HEIGHT : AGENT_HEIGHT;
    console.log("recalcHeight before show", { activeMode });
    await win.show();
    console.log("recalcHeight after show", { activeMode });
    console.log("recalcHeight", { activeMode, width, height });
    await win.setSize(new LogicalSize(width, height));
  };

  useLayoutEffect(() => {
    void getCurrentWindow().hide();
  }, []);

  useEffect(() => {
    let raf = 0;
    let timeoutId: number | null = null;
    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        raf = requestAnimationFrame(() => {
          void recalcHeight();
        });
      }, 0);
    };

    schedule();
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loading, state.response, state.error, showHistory, history, activePanel]);

  useEffect(() => {
    if (showHistory) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory, state.conversation_id]);

  const headerText = useMemo(() => {
    if (activePanel === "agent") return "AGENT WORKSPACE";
    if (state.loading) return "$ thinking…";
    if (state.error) return "! error";
    return "$ out";
  }, [activePanel, state.loading, state.error]);

  return (
    <>
      <style>{`
        .response-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #39ff6a #09090c;
        }
        .response-scrollable::-webkit-scrollbar {
          width: 8px;
        }
        .response-scrollable::-webkit-scrollbar-track {
          background: #09090c;
          border-radius: 999px;
        }
        .response-scrollable::-webkit-scrollbar-thumb {
          background: #39ff6a;
          border-radius: 999px;
          box-shadow: 0 0 8px rgba(57, 255, 106, 0.45);
        }
        .response-scrollable::-webkit-scrollbar-thumb:hover {
          background: #4dff7c;
        }
      `}</style>
      <div key={activePanel ?? "idle"} ref={bodyRef} style={PANEL} className="response-scrollable">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <button
          type="button"
          onClick={handleClearMode}
          style={{
            ...btn,
            color: theme.green,
            border: `1px solid ${theme.green}`,
            background: "transparent",
            padding: "4px 8px",
          }}
          aria-label="Back"
        >
          ← Back
        </button>
        <div style={{ color: theme.green, fontSize: 12 }}>{headerText}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={handleNewChat} style={btn}>
            + new chat
          </button>
          <button type="button" onClick={() => setShowHistory((v) => !v)} style={btn}>
            {showHistory ? "hide log" : "log"}
          </button>
          <button
            type="button"
            onClick={handleClearMode}
            style={{ ...btn, color: theme.textMuted, borderColor: theme.border }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {activePanel === "agent" ? (
        <>
          {console.log("Agent Mode JSX rendered")}
          <div
            style={{
              width: "100%",
              marginBottom: 16,
              background: "rgba(20, 20, 22, 0.86)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderRadius: 28,
              padding: 20,
              boxShadow: "0 28px 72px rgba(0, 0, 0, 0.28)",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
              <div style={{ color: theme.green, fontSize: 13, fontWeight: 700 }}>CURRENT OBJECTIVE</div>
              <div
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(84,255,123,0.28)",
                  background: "rgba(84,255,123,0.14)",
                  color: theme.green,
                  padding: "4px 10px",
                  fontSize: 10,
                  fontFamily: theme.fontMono,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                RUNNING
              </div>
            </div>
            <div style={{ color: theme.textMuted, fontSize: 12, lineHeight: 1.45 }}>
              Analyze workspace changes and prepare daily project summary
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 16,
              width: "100%",
            }}
          >
            {[
              "12 Tasks Completed",
              "3 Active Workflows",
              "6 Tools Connected",
              "02:14:32 Uptime",
            ].map((metric) => (
              <div
                key={metric}
                style={{
                  flex: 1,
                  background: "rgba(20, 20, 22, 0.86)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  padding: "10px 12px",
                  color: "#d4d4d8",
                  fontSize: 12,
                  fontFamily: theme.fontMono,
                  lineHeight: 1.2,
                  boxSizing: "border-box",
                }}
              >
                {metric}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div
              style={{
                background: "rgba(20, 20, 22, 0.86)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 28px 72px rgba(0, 0, 0, 0.28)",
                minHeight: 120,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ color: theme.green, fontSize: 13, fontWeight: 700 }}>Quick Actions</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  "Open VS Code",
                  "Launch Browser",
                  "Open Recent Project",
                  "Search Workspace",
                  "Generate Report",
                ].map((action) => (
                  <div
                    key={action}
                    className="hover:border-green-500/20 hover:bg-green-500/5 hover:shadow-[0_0_16px_rgba(50,215,75,0.14)]"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 14,
                      padding: "10px 12px",
                      color: "#d4d4d8",
                      fontSize: 12,
                      fontFamily: theme.fontMono,
                      lineHeight: 1.2,
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    {action}
                  </div>
                ))}
              </div>
            </div>
            <div
              style={{
                background: "rgba(20, 20, 22, 0.86)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 28px 72px rgba(0, 0, 0, 0.28)",
                minHeight: 120,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ color: theme.green, fontSize: 13, fontWeight: 700 }}>Task Queue</div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: theme.text, fontSize: 12, fontFamily: theme.fontMono }}>Scan workspace</div>
                <div
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(84,255,123,0.24)",
                    background: "rgba(84,255,123,0.14)",
                    color: theme.green,
                    padding: "3px 9px",
                    fontSize: 10,
                    fontFamily: theme.fontMono,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  running
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: theme.text, fontSize: 12, fontFamily: theme.fontMono }}>Open recent project</div>
                <div
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(245,158,11,0.22)",
                    background: "rgba(245,158,11,0.14)",
                    color: "#fbbf24",
                    padding: "3px 9px",
                    fontSize: 10,
                    fontFamily: theme.fontMono,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  queued
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: theme.text, fontSize: 12, fontFamily: theme.fontMono }}>Generate report</div>
                <div
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(161,161,170,0.22)",
                    background: "rgba(161,161,170,0.14)",
                    color: "#a1a1aa",
                    padding: "3px 9px",
                    fontSize: 10,
                    fontFamily: theme.fontMono,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  waiting
                </div>
              </div>
            </div>
            <div
              style={{
                background: "rgba(20, 20, 22, 0.86)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 28px 72px rgba(0, 0, 0, 0.28)",
                minHeight: 120,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ color: theme.green, fontSize: 13, fontWeight: 700 }}>Execution Timeline</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: theme.green,
                      boxShadow: "0 0 10px rgba(84,255,123,0.32)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ color: theme.text, fontSize: 12, fontFamily: theme.fontMono }}>Workspace scan completed</div>
                </div>
                <div style={{ marginLeft: 4, width: 2, height: 10, background: "rgba(255,255,255,0.14)" }} />

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: theme.green,
                      boxShadow: "0 0 10px rgba(84,255,123,0.28)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ color: theme.text, fontSize: 12, fontFamily: theme.fontMono }}>Open recent project</div>
                </div>
                <div style={{ marginLeft: 4, width: 2, height: 10, background: "rgba(255,255,255,0.14)" }} />

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: "1px solid rgba(84,255,123,0.8)",
                      background: "rgba(84,255,123,0.28)",
                      boxShadow: "0 0 16px rgba(84,255,123,0.45)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ color: theme.text, fontSize: 12, fontFamily: theme.fontMono }}>Code analysis running</div>
                </div>
                <div style={{ marginLeft: 4, width: 2, height: 10, background: "rgba(255,255,255,0.14)" }} />

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: "1px solid rgba(161,161,170,0.55)",
                      background: "transparent",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ color: theme.textMuted, fontSize: 12, fontFamily: theme.fontMono }}>Generate report pending</div>
                </div>
              </div>
            </div>
            <div
              style={{
                background: "rgba(20, 20, 22, 0.86)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 28px 72px rgba(0, 0, 0, 0.28)",
                minHeight: 120,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ color: theme.green, fontSize: 13, fontWeight: 700 }}>Activity Feed</div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 2 }}>
                <span style={{ color: "rgba(161,161,170,0.82)", fontSize: 11, fontFamily: theme.fontMono }}>10:42</span>
                <span style={{ color: theme.text, fontSize: 12 }}>Workspace scan completed</span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "rgba(161,161,170,0.82)", fontSize: 11, fontFamily: theme.fontMono }}>10:43</span>
                <span style={{ color: theme.text, fontSize: 12 }}>VS Code launched</span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "rgba(161,161,170,0.82)", fontSize: 11, fontFamily: theme.fontMono }}>10:44</span>
                <span style={{ color: theme.text, fontSize: 12 }}>Recent project opened</span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "rgba(161,161,170,0.82)", fontSize: 11, fontFamily: theme.fontMono }}>10:45</span>
                <span style={{ color: theme.text, fontSize: 12 }}>Report queued</span>
              </div>
            </div>
            <div
              style={{
                background: "rgba(20, 20, 22, 0.86)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 28px 72px rgba(0, 0, 0, 0.28)",
                minHeight: 120,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ color: theme.green, fontSize: 13, fontWeight: 700 }}>Available Tools</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  "VS Code",
                  "Browser",
                  "File Explorer",
                  "Terminal",
                  "Reports",
                  "Workspace Search",
                ].map((tool) => (
                  <div
                    key={tool}
                    className="hover:border-green-500/20 hover:bg-green-500/5 hover:shadow-[0_0_16px_rgba(50,215,75,0.14)]"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 14,
                      padding: "10px 12px",
                      color: "#d4d4d8",
                      fontSize: 12,
                      fontFamily: theme.fontMono,
                      lineHeight: 1.2,
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    {tool}
                  </div>
                ))}
              </div>
            </div>
            <div
              style={{
                background: "rgba(20, 20, 22, 0.86)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 28px 72px rgba(0, 0, 0, 0.28)",
                minHeight: 120,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ color: theme.green, fontSize: 13, fontWeight: 700 }}>Next Planned Actions</div>

              {[
                "Open latest project in VS Code",
                "Run workspace search",
                "Generate daily project report",
                "Notify user when complete",
              ].map((step) => (
                <div key={step} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      color: "rgba(84,255,123,0.82)",
                      fontSize: 12,
                      lineHeight: 1,
                      userSelect: "none",
                    }}
                  >
                    &rarr;
                  </span>
                  <span style={{ color: theme.text, fontSize: 12, fontFamily: theme.fontMono }}>{step}</span>
                </div>
              ))}
            </div>
            <div
              style={{
                background: "rgba(20, 20, 22, 0.86)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 28px 72px rgba(0, 0, 0, 0.28)",
                minHeight: 120,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ color: theme.green, fontSize: 13, fontWeight: 700 }}>System Status</div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: theme.textMuted, fontSize: 12, fontFamily: theme.fontMono }}>Agent Core</div>
                <div
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(84,255,123,0.24)",
                    background: "rgba(84,255,123,0.14)",
                    color: theme.green,
                    padding: "3px 9px",
                    fontSize: 10,
                    fontFamily: theme.fontMono,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  online
                </div>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: theme.textMuted, fontSize: 12, fontFamily: theme.fontMono }}>Workspace Sync</div>
                <div
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(84,255,123,0.24)",
                    background: "rgba(84,255,123,0.14)",
                    color: theme.green,
                    padding: "3px 9px",
                    fontSize: 10,
                    fontFamily: theme.fontMono,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  active
                </div>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: theme.textMuted, fontSize: 12, fontFamily: theme.fontMono }}>Tool Bridge</div>
                <div
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(84,255,123,0.24)",
                    background: "rgba(84,255,123,0.14)",
                    color: theme.green,
                    padding: "3px 9px",
                    fontSize: 10,
                    fontFamily: theme.fontMono,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  connected
                </div>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: theme.textMuted, fontSize: 12, fontFamily: theme.fontMono }}>Task Engine</div>
                <div
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(84,255,123,0.24)",
                    background: "rgba(84,255,123,0.14)",
                    color: theme.green,
                    padding: "3px 9px",
                    fontSize: 10,
                    fontFamily: theme.fontMono,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  healthy
                </div>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: theme.textMuted, fontSize: 12, fontFamily: theme.fontMono }}>Uptime</div>
                <div style={{ color: "rgba(161,161,170,0.9)", fontSize: 12, fontFamily: theme.fontMono }}>02:14:32</div>
              </div>
            </div>
          {[
            { title: "Recent Tasks" },
            {
              title: "Pinned Actions",
              kind: "pinned" as const,
            },
            { title: "Workflow Automations" },
            {
              title: "Activity Feed",
              kind: "feed" as const,
            },
          ].map((card) => (
            <div
              key={card.title}
              style={{
                background: "rgba(20, 20, 22, 0.86)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 28px 72px rgba(0, 0, 0, 0.28)",
                minHeight: 120,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ color: theme.green, fontSize: 13, fontWeight: 700 }}>{card.title}</div>

              {card.kind === "pinned" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    "Open latest workspace",
                    "Launch browser",
                    "Generate daily report",
                  ].map((action) => (
                    <div
                      key={action}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 14,
                        padding: "10px 12px",
                        boxSizing: "border-box",
                      }}
                    >
                      <div style={{ color: theme.text, fontSize: 12, fontFamily: theme.fontMono }}>{action}</div>
                      <div
                        style={{
                          color: "rgba(84,255,123,0.8)",
                          fontSize: 10,
                          fontFamily: theme.fontMono,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        saved
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {card.kind === "feed" ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {[
                    ["10:42", "Workspace scan completed"],
                    ["10:43", "Browser launched"],
                    ["10:44", "Project opened"],
                    ["10:45", "Report queued"],
                  ].map(([time, event], index) => (
                    <React.Fragment key={time}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0" }}>
                        <span style={{ color: "rgba(161,161,170,0.82)", fontSize: 11, fontFamily: theme.fontMono }}>
                          {time}
                        </span>
                        <span style={{ color: theme.text, fontSize: 12 }}>{event}</span>
                      </div>
                      {index < 3 ? <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} /> : null}
                    </React.Fragment>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div
          style={{
            position: "sticky",
            bottom: 0,
            marginTop: 16,
            paddingTop: 12,
            paddingBottom: 4,
            zIndex: 5,
            background: "linear-gradient(180deg, rgba(17,17,19,0) 0%, rgba(17,17,19,0.74) 28%, rgba(17,17,19,0.94) 100%)",
          }}
        >
          <div
            style={{
              borderRadius: 18,
              border: "1px solid rgba(84,255,123,0.18)",
              background: "rgba(4, 6, 6, 0.92)",
              padding: "12px 14px",
              boxShadow:
                "0 18px 40px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(84,255,123,0.07), 0 0 22px rgba(84,255,123,0.08)",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  color: theme.green,
                  fontFamily: theme.fontMono,
                  fontSize: 14,
                  lineHeight: 1,
                  userSelect: "none",
                }}
              >
                &gt;
              </span>
              <input
                type="text"
                placeholder="Tell the agent what to do..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: theme.text,
                  fontFamily: theme.fontMono,
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                style={{
                  alignSelf: "center",
                  borderRadius: 999,
                  border: "1px solid rgba(84,255,123,0.24)",
                  background: "rgba(12,14,12,0.95)",
                  color: theme.green,
                  padding: "7px 14px",
                  fontSize: 11,
                  fontFamily: theme.fontMono,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  boxShadow: "0 0 18px rgba(84,255,123,0.1)",
                }}
              >
                EXECUTE
              </button>
            </div>
          </div>
        </div>
      </>
      ) : (
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            marginTop: 12,
            paddingBottom: 24,
            minHeight: 500,
            boxSizing: "border-box",
            overflowX: "hidden",
          }}
        >
          <div
            className="response-scrollable"
            style={{
              width: "100%",
              flex: 1,
              minHeight: 420,
              margin: 0,
              overflowY: "auto",
              overflowX: "hidden",
              scrollBehavior: "smooth",
              background: "rgba(10, 10, 12, 0.94)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), inset 0 0 42px rgba(0,0,0,0.32)",
              padding: "16px 24px 24px 16px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {state.loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: theme.green,
                    borderRadius: 999,
                    padding: "8px 12px",
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    textTransform: "none",
                    textShadow: "0 0 10px rgba(50,215,75,0.28)",
                  }}
                >
                  ● ● ●
                </div>
              </div>
            )}

            {state.error && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    maxWidth: "80%",
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.24)",
                    color: "#fca5a5",
                    borderRadius: 14,
                    padding: "10px 14px",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {state.error}
                </div>
              </div>
            )}

            {history.map((msg) => (
              <div
                key={msg.id}
                style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    background: msg.role === "user" ? "rgba(50, 215, 75, 0.12)" : "rgba(255,255,255,0.04)",
                    border: msg.role === "user" ? "1px solid rgba(50, 215, 75, 0.24)" : "1px solid rgba(255,255,255,0.10)",
                    color: msg.role === "user" ? theme.green : theme.textMuted,
                    borderRadius: 14,
                    padding: "10px 14px",
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordWrap: "break-word",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {history.length === 0 && state.response && !state.error && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    maxWidth: "80%",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: theme.textMuted,
                    borderRadius: 14,
                    padding: "10px 14px",
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordWrap: "break-word",
                  }}
                >
                  {state.response}
                </div>
              </div>
            )}

            {!state.loading && !state.error && !state.response && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  minHeight: 200,
                  color: theme.textMuted,
                  fontSize: 12,
                  fontFamily: theme.fontMono,
                }}
              >
                Ready for input...
              </div>
            )}
          </div>


        </div>
      )}
      </div>
    </>
  );
}
