
import React, { useEffect, useLayoutEffect, useRef } from "react";
import TopBar from "./components/TopBar";
import IconGroup from "./components/IconGroup";
import { emitTo, listen, TauriEvent } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow, LogicalPosition, LogicalSize, Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export default function ExactIraUI() {
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const TOPBAR_HEIGHT = 70;
  const IDLE_HEIGHT = TOPBAR_HEIGHT;
  const WIDTH = 900;
  const responseWinRef = useRef<WebviewWindow | null>(null);
  const settingsWinRef = useRef<WebviewWindow | null>(null);
  /** Ignores duplicate pointer events within one gesture (~double fire from drag region). */
  const lastSettingsOpenAttemptAt = useRef(0);
  const STORAGE = {
    conversationId: "ira_current_conversation_id",
    activationId: "ira_activation_id",
  };

  const positionResponseWindow = async () => {
    const main = getCurrentWindow();
    const resp = await Window.getByLabel("response");
    if (!resp) return;

    const pos = await main.outerPosition();
    const size = await main.outerSize();
    await resp.setPosition(new LogicalPosition(pos.x, pos.y + size.height));
  };

  const positionSettingsWindow = async () => {
    const main = getCurrentWindow();
    const settings = await WebviewWindow.getByLabel("settings");
    if (!settings) return;
    const pos = await main.outerPosition();
    const mainSize = await main.outerSize();
    const mon = await currentMonitor();
    const gap = 8;
    const top = pos.y + mainSize.height + gap;
    let w = mainSize.width;
    let h = 820;
    if (mon) {
      const sf = mon.scaleFactor;
      const wa = mon.workArea;
      const workBottomLogical = wa.position.y / sf + wa.size.height / sf;
      const calc = Math.floor(workBottomLogical - top - 12);
      h = Math.max(480, Math.min(calc, 960));
    }
    await settings.setSize(new LogicalSize(w, h));
    await settings.setPosition(new LogicalPosition(pos.x, top));
  };

  const ensureResponseWindow = async () => {
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
      backgroundColor: "#E59898",
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
    void win.setMaxSize(new LogicalSize(WIDTH, IDLE_HEIGHT));
    void win.setResizable(false);
    void win.setSize(new LogicalSize(WIDTH, IDLE_HEIGHT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // `onMoved`/`onResized` are unreliable on some Windows builds; `listen` on this window is bound correctly.
    const main = getCurrentWindow();
    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;

    const setup = async () => {
      unlistenMoved = await main.listen(TauriEvent.WINDOW_MOVED, () => {
        void positionResponseWindow();
        void positionSettingsWindow();
      });
      unlistenResized = await main.listen(TauriEvent.WINDOW_RESIZED, () => {
        void positionResponseWindow();
        void positionSettingsWindow();
      });
    };
    void setup();

    return () => {
      if (unlistenMoved) unlistenMoved();
      if (unlistenResized) unlistenResized();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch AI response from backend
  const sendMessage = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    await ensureResponseWindow();
    await positionResponseWindow();
    // Wait until the response window has loaded and registered its listener.
    await waitForResponseReady();
    const respWindow = await Window.getByLabel("response");
    await respWindow?.show();
    await emitTo("response", "ira:response-state", { loading: true, response: "", error: null, conversation_id: null });
    try {
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
          model: "openai/gpt-4o-mini",
          temperature: null,
        },
      });

      const res = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          model: "openai/gpt-4o-mini",
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

  return (
    <div
      style={{
        width: "100%",
        background: "transparent",
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
        onSwitchMode={() => {}}
      />
    </div>
  );
}
