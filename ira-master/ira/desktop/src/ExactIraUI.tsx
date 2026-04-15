
import React, { useEffect, useLayoutEffect, useRef } from "react";
import TopBar from "./components/TopBar";
import IconGroup from "./components/IconGroup";
import { emitTo, listen, TauriEvent } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow, LogicalPosition, LogicalSize, Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { theme } from "./theme";

export default function ExactIraUI() {
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeMode, setActiveMode] = React.useState<"Chat Mode" | "Agent Mode" | null>(null);
  const activePanel = activeMode === "Chat Mode" ? "chat" : activeMode === "Agent Mode" ? "agent" : null;

  const TOPBAR_HEIGHT = 70;
  const IDLE_HEIGHT = TOPBAR_HEIGHT;
  const DROPDOWN_HEIGHT = 180;
  const WIDTH = 900;
  const responseWinRef = useRef<WebviewWindow | null>(null);
  const settingsWinRef = useRef<WebviewWindow | null>(null);
  const dropdownOpenRef = useRef(false);
  /** Ignores duplicate pointer events within one gesture (~double fire from drag region). */
  const lastSettingsOpenAttemptAt = useRef(0);
  const STORAGE = {
    conversationId: "ira_current_conversation_id",
    activationId: "ira_activation_id",
  };

  // Map frontend display model names to backend model IDs
  const DISPLAY_MODEL_MAP: Record<string, string> = {
    "GPT-4.1": "openai/gpt-4-turbo",
    "GPT-4o": "openai/gpt-4o",
    "Claude 3.7 Sonnet": "anthropic/claude-3-7-sonnet",
    "Gemini 2.0 Pro": "google/gemini-2.0-pro",
    "Local Model": "local/model",
  };

  /** Bottom of the visible top bar (client area). Outer size on Windows often includes shadow, which left a gap below the bar. */
  const mainBarAnchorLogical = async (main: ReturnType<typeof getCurrentWindow>) => {
    const sf = await main.scaleFactor();
    try {
      const innerPos = await main.innerPosition();
      const inner = await main.innerSize();
      const p = innerPos.toLogical(sf);
      const s = inner.toLogical(sf);
      return { left: p.x, bottom: p.y + s.height, width: s.width };
    } catch {
      const outerPos = await main.outerPosition();
      const outer = await main.outerSize();
      const p = outerPos.toLogical(sf);
      const s = outer.toLogical(sf);
      return { left: p.x, bottom: p.y + TOPBAR_HEIGHT, width: s.width };
    }
  };

  /**
   * Place child webviews flush under the main window’s inner bottom edge (same as the response window).
   * Visual breathing room below the top bar matches childPanelConstants.CHILD_PANEL_PADDING inside each webview.
   */
  const positionResponseWindow = async () => {
    const main = getCurrentWindow();
    const resp = await Window.getByLabel("response");
    if (!resp) return;

    const anchor = await mainBarAnchorLogical(main);
    await resp.setPosition(new LogicalPosition(anchor.left, anchor.bottom));
  };

  const positionSettingsWindow = async () => {
    const main = getCurrentWindow();
    const settings = await WebviewWindow.getByLabel("settings");
    if (!settings) return;
    const anchor = await mainBarAnchorLogical(main);
    const mon = await currentMonitor();
    const top = anchor.bottom;
    const w = anchor.width;
    let h = 820;
    if (mon) {
      const sf = mon.scaleFactor;
      const wa = mon.workArea;
      const workBottomLogical = wa.position.y / sf + wa.size.height / sf;
      const calc = Math.floor(workBottomLogical - top);
      h = Math.max(480, Math.min(calc, 960));
    }
    await settings.setSize(new LogicalSize(w, h));
    await settings.setPosition(new LogicalPosition(anchor.left, top));
  };

  const emitActiveModeToResponse = async () => {
    if (!activeMode) return;
    const resp = await Window.getByLabel("response");
    if (!resp) return;
    await emitTo("response", "ira:active-mode", { activeMode, activePanel });
  };

  const closeOpenChildPanels = async () => {
    try {
      if (settingsWinRef.current) {
        const settingsVisible = await settingsWinRef.current.isVisible().catch(() => false);
        if (settingsVisible) {
          try {
            await settingsWinRef.current.close();
            // Verify the window is actually closed before clearing ref
            const stillVisible = await settingsWinRef.current.isVisible().catch(() => false);
            if (!stillVisible) {
              settingsWinRef.current = null;
            }
          } catch (closeErr) {
            console.warn("Settings window close failed", closeErr);
            // If close fails, don't clear the ref - try again next time
          }
        } else {
          // Already not visible, safe to clear ref
          settingsWinRef.current = null;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      if (responseWinRef.current) {
        const responseVisible = await responseWinRef.current.isVisible().catch(() => false);
        if (responseVisible) {
          try {
            await responseWinRef.current.close();
            // Verify the window is actually closed before clearing ref
            const stillVisible = await responseWinRef.current.isVisible().catch(() => false);
            if (!stillVisible) {
              responseWinRef.current = null;
            }
          } catch (closeErr) {
            console.warn("Response window close failed", closeErr);
            // If close fails, don't clear the ref - try again next time
          }
        } else {
          // Already not visible, safe to clear ref
          responseWinRef.current = null;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } catch (err) {
      console.error("Failed to close child panels", err);
    }
  };

  /** Hide Settings window if it's currently visible. Call before any navigation or panel opening. */
  const hideSettingsIfVisible = async () => {
    if (settingsWinRef.current) {
      const visible = await settingsWinRef.current.isVisible().catch(() => false);
      if (visible) {
        await settingsWinRef.current.hide();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  };

  const ensureResponseWindow = async () => {
    await closeOpenChildPanels();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const existing = await WebviewWindow.getByLabel("response");
    if (existing) {
      responseWinRef.current = existing;
      await positionResponseWindow();
      return existing;
    }

    const win = new WebviewWindow("response", {
      url: "/",
      width: WIDTH,
      height: 120,
      decorations: false,
      // Opaque webview so the pink panel can align 1:1 with the window (no transparent halo).
      transparent: false,
      backgroundColor: theme.windowBg,
      alwaysOnTop: true,
      resizable: false,
      visible: false,
      focus: false,
      skipTaskbar: true,
    });

    responseWinRef.current = win;

    // When created, position it directly under the topbar.
    await new Promise<void>((resolve) => {
      void win.once("tauri://created", () => {
        void positionResponseWindow().finally(resolve);
      });
      void win.once("tauri://error", () => {
        resolve();
      });
    });

    return win;
  };

  const ensureSettingsWindow = async () => {
    const existing = await WebviewWindow.getByLabel("settings");
    if (existing) {
      settingsWinRef.current = existing;
      await positionSettingsWindow();
      return existing;
    }

    const win = new WebviewWindow("settings", {
      url: "/",
      width: WIDTH,
      height: 820,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      visible: false,
      focus: false,
      skipTaskbar: true,
    });

    settingsWinRef.current = win;
    await new Promise<void>((resolve) => {
      void win.once("tauri://created", () => {
        void positionSettingsWindow().finally(resolve);
      });
      void win.once("tauri://error", () => resolve());
    });
    return win;
  };

  const waitForResponseReady = async (timeoutMs = 2000) => {
    let timeoutId: number | null = null;
    let unlisten: (() => void) | null = null;

    const result = await new Promise<boolean>((resolve) => {
      timeoutId = window.setTimeout(() => resolve(false), timeoutMs);
      void listen<{ label?: string }>("ira:response-ready", (event) => {
        if (event.payload?.label === "response") resolve(true);
      }).then((fn) => {
        unlisten = fn;
      });
    });

    if (timeoutId != null) window.clearTimeout(timeoutId);
    if (unlisten) (unlisten as () => void)();
    return result;
  };

  // Shrink on first paint to avoid "big blank window" flash.
  useLayoutEffect(() => {
    const win = getCurrentWindow();
    // Clamp the idle size so there is no extra transparent area.
    void win.setMinSize(new LogicalSize(WIDTH, IDLE_HEIGHT));
    void win.setMaxSize(new LogicalSize(WIDTH, DROPDOWN_HEIGHT));
    void win.setResizable(false);
    void win.setSize(new LogicalSize(WIDTH, IDLE_HEIGHT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeMode) return;
    let cancelled = false;

    const syncModeToResponse = async () => {
      await ensureResponseWindow();
      await waitForResponseReady();
      if (cancelled) return;
      await emitActiveModeToResponse();
    };

    void syncModeToResponse();
    return () => {
      cancelled = true;
    };
  }, [activeMode]);

  useLayoutEffect(() => {
    const main = getCurrentWindow();
    if (activeMode) {
      void main.hide();
      return;
    }
    void main.show();
  }, [activeMode]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    void listen("ira:clear-mode", () => {
      setActiveMode(null);
      void Window.getByLabel("response").then((resp) => resp?.hide());
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const getModeDropdownOpen = () => {
      const modeButton = document.querySelector<HTMLButtonElement>("button[data-mode-trigger='true']");
      if (!modeButton) return false;
      const menu = modeButton.nextElementSibling as HTMLElement | null;
      if (!menu) return false;
      const style = window.getComputedStyle(menu);
      return style.opacity === "1" && style.pointerEvents !== "none";
    };

    let raf = 0;
    const checkDropdown = async () => {
      const open = getModeDropdownOpen();
      if (open !== dropdownOpenRef.current) {
        dropdownOpenRef.current = open;
        const win = getCurrentWindow();
        void win.setSize(new LogicalSize(WIDTH, open ? DROPDOWN_HEIGHT : IDLE_HEIGHT));
      }
      raf = requestAnimationFrame(checkDropdown);
    };

    raf = requestAnimationFrame(checkDropdown);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // If the main window closes while the response window is still open,
    // Tauri keeps the app alive. Close the response window first.
    const main = getCurrentWindow();

    const setup = async () => {
      return await main.onCloseRequested(async (e) => {
        e.preventDefault();
        try {
          const resp = await Window.getByLabel("response");
          const settings = await WebviewWindow.getByLabel("settings");
          await resp?.close();
          await settings?.close();
        } finally {
          await main.close();
        }
      });
    };

    const unlistenPromise = setup();
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    // Keep child windows glued under the topbar when it moves or resizes.
    const main = getCurrentWindow();
    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;
    let unlistenOnMoved: (() => void) | null = null;

    const repositionChildren = () => {
      void positionResponseWindow();
      void positionSettingsWindow();
    };

    const setup = async () => {
      unlistenMoved = await main.listen(TauriEvent.WINDOW_MOVED, repositionChildren);
      unlistenResized = await main.listen(TauriEvent.WINDOW_RESIZED, repositionChildren);
      // Fires during drag on more builds than WINDOW_MOVED alone (Windows).
      unlistenOnMoved = await main.onMoved(repositionChildren);
    };
    void setup();

    return () => {
      if (unlistenMoved) unlistenMoved();
      if (unlistenResized) unlistenResized();
      if (unlistenOnMoved) unlistenOnMoved();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch AI response from backend
  const sendMessage = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    await hideSettingsIfVisible();
    await closeOpenChildPanels();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await ensureResponseWindow();
    await positionResponseWindow();
    // Wait until the response window has loaded and registered its listener.
    await waitForResponseReady();
    await emitActiveModeToResponse();
    const respWindow = await Window.getByLabel("response");
    await respWindow?.show();
    await emitTo("response", "ira:response-state", { loading: true, response: "", error: null, conversation_id: null });
    try {
      // Get selected model from localStorage and map to backend model ID
      const displayModel = localStorage.getItem("ira_selected_model") ?? "GPT-4o";
      const selectedBackendModel = DISPLAY_MODEL_MAP[displayModel as keyof typeof DISPLAY_MODEL_MAP] ?? "openai/gpt-4o-mini";

      let conversationId = localStorage.getItem(STORAGE.conversationId);
      if (!conversationId) {
        conversationId = await invoke<string>("start_conversation", { title: "IRA chat" });
        localStorage.setItem(STORAGE.conversationId, conversationId);
      }

      await invoke<string>("append_message", {
        conversationId,
        role: "user",
        content: input,
        clientMessageId: crypto.randomUUID(),
        parentMessageId: null,
        metadata: { source: "topbar" },
      });

      const messages = await invoke<Array<{ role: string; content: string }>>("build_context", {
        conversationId,
        maxRecent: 20,
      });
      const llmCallId = await invoke<string>("log_llm_call_start", {
        payload: {
          conversation_id: conversationId,
          request_messages: messages,
          model: selectedBackendModel,
          temperature: null,
        },
      });

      const res = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          model: selectedBackendModel,
          activation_id: localStorage.getItem(STORAGE.activationId),
        }),
      });
      if (!res.ok) throw new Error("Failed to fetch AI response");
      const data = await res.json();

      const assistantMessageId = await invoke<string>("append_message", {
        conversationId,
        role: "assistant",
        content: data.reply ?? "",
        clientMessageId: null,
        parentMessageId: null,
        metadata: { model: data.model ?? null, usage: data.usage ?? null },
      });
      await invoke("log_llm_call_finish", {
        payload: {
          llm_call_id: llmCallId,
          status: "ok",
          error: null,
          usage: data.usage ?? null,
          assistant_message_id: assistantMessageId,
        },
      });

      setLoading(false);
      await emitTo("response", "ira:response-state", { loading: false, response: data.reply ?? "", error: null, conversation_id: conversationId });
    } catch (err) {
      setError("Failed to get AI response");
      setLoading(false);
      const conversationId = localStorage.getItem(STORAGE.conversationId);
      if (conversationId) {
        try {
          await invoke<string>("append_message", {
            conversationId,
            role: "system",
            content: "Failed to get AI response",
            clientMessageId: null,
            parentMessageId: null,
            metadata: { error: true },
          });
        } catch {
          // no-op
        }
      }
      await emitTo("response", "ira:response-state", {
        loading: false,
        response: "",
        error: "Failed to get AI response",
        conversation_id: conversationId,
      });
    }
    setInput("");
  };

  const openSettings = async () => {
    const now = Date.now();
    if (now - lastSettingsOpenAttemptAt.current < 120) return;
    lastSettingsOpenAttemptAt.current = now;

    await closeOpenChildPanels();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await ensureSettingsWindow();
    await positionSettingsWindow();
    const settingsWindow = await WebviewWindow.getByLabel("settings");
    if (!settingsWindow) return;
    const visible = await settingsWindow.isVisible();
    if (visible) {
      await settingsWindow.hide();
      return;
    }
    await settingsWindow.show();
    try {
      await settingsWindow.setFocus();
    } catch {
      /* setFocus requires core:window:allow-set-focus; ignore denial */
    }
  };

  if (activeMode) {
    return null;
  }

  const handleSwitchMode = async (mode: "Chat Mode" | "Agent Mode") => {
    await hideSettingsIfVisible();
    await closeOpenChildPanels();
    await new Promise((resolve) => setTimeout(resolve, 150));
    setActiveMode(mode);
  };

  return (
    <div
      style={{
        width: "100%",
        background: theme.topBar,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        boxSizing: "border-box",
      }}
    >
      <TopBar
        input={input}
        onInputChange={e => setInput(e.target.value)}
        onSend={sendMessage}
        disabled={loading}
        icons={<IconGroup onOpenSettings={openSettings} />}
        onSwitchMode={handleSwitchMode}
      />
    </div>
  );
}
