

import React, { useState, useEffect, useRef } from "react";
import { Popover } from "./Popover";
// import ReactMarkdown from "react-markdown"; // Uncomment if using markdown rendering

function App() {
  const [input, setInput] = useState("");
  const [backendStatus, setBackendStatus] = useState<"connected" | "disconnected">("disconnected");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [keepEngaged, setKeepEngaged] = useState(false);
  // For conversation mode (bonus):
  const [messages, setMessages] = useState<{ role: "user" | "ai"; content: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkBackend = () => {
      fetch("http://127.0.0.1:5000/health")
        .then(res => res.ok ? setBackendStatus("connected") : setBackendStatus("disconnected"))
        .catch(() => setBackendStatus("disconnected"));
    };
    checkBackend();
    const interval = setInterval(checkBackend, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isPopoverOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isPopoverOpen]);

  const sendMessage = async () => {
    if (!input.trim() || backendStatus !== "connected") return;
    setLoading(true);
    setIsPopoverOpen(true);
    setResponse("");
    setError(null);
    if (keepEngaged) {
      setMessages((prev) => [...prev, { role: "user", content: input }]);
    }
    try {
      const res = await fetch("http://127.0.0.1:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input })
      });
      const data = await res.json();
      setResponse(data.reply || "No reply");
      if (keepEngaged) {
        setMessages((prev) => [...prev, { role: "ai", content: data.reply || "No reply" }]);
      }
    } catch (e: any) {
      setError("Error contacting backend");
    }
    setLoading(false);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") sendMessage();
  };

  const handleClosePopover = () => {
    setIsPopoverOpen(false);
    setResponse("");
    setError(null);
    if (!keepEngaged) setMessages([]);
  };

  // Popover opens on send/loading/response
  const shouldShowPopover = isPopoverOpen || loading || !!response || !!error;

  return (
    <div style={styles.wrapper}>
      <div style={styles.bar} data-tauri-drag-region>
        {/* Drag Handle (3 dots) */}
        <div style={styles.drag}>
          •••
        </div>

        <input
          ref={inputRef}
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask IRA anything..."
          disabled={loading}
          autoFocus
          data-tauri-drag-region="false"
        />

        <button style={styles.button} onClick={sendMessage} disabled={loading || !input.trim() || backendStatus !== "connected"} data-tauri-drag-region="false">
          {loading ? "..." : "→"}
        </button>

        {/* Status indicator: green or red button */}
        <div style={styles.statusWrap} data-tauri-drag-region="false">
          {backendStatus === "connected" && (
            <span style={styles.statusDotGreen}></span>
          )}
          {backendStatus !== "connected" && (
            <span style={styles.statusDotRed}></span>
          )}
        </div>
      </div>

      {/* Popover for AI response - render OUTSIDE the bar, at the top level */}
      <Popover open={shouldShowPopover} onClose={handleClosePopover}>
        <div className="flex flex-col w-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-2 border-b border-white/10">
            <div>
              <div className="font-semibold text-white text-lg">
                {keepEngaged ? "Conversation Mode" : "AI Response"}
              </div>
              <div className="text-xs text-white/50">(Use arrow keys to scroll)</div>
            </div>
            <div className="flex items-center gap-2">
              {/* Toggle conversation mode */}
              <label className="flex items-center cursor-pointer select-none">
                <input type="checkbox" checked={keepEngaged} onChange={() => setKeepEngaged(v => !v)} className="accent-[#ff8c69]" />
                <span className="ml-1 text-xs text-white/70">Conversation</span>
              </label>
              {/* Copy button */}
              <button
                className="ml-2 px-2 py-1 rounded bg-white/10 text-white/80 hover:bg-white/20 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(response);
                }}
                disabled={!response}
              >Copy</button>
              {/* Close handled by Popover X */}
            </div>
          </div>
          {/* Body */}
          <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: 340 }}>
            {loading && (
              <div className="flex items-center gap-2 text-white/80">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-t-transparent border-white rounded-full"></span>
                Generating response...
              </div>
            )}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded p-3 mb-2">
                {error}
              </div>
            )}
            {!loading && !error && response && (
              <div className="prose prose-invert max-w-none">
                {/* <ReactMarkdown>{response}</ReactMarkdown> */}
                {response}
              </div>
            )}
            {/* Conversation mode: show previous messages */}
            {keepEngaged && messages.length > 0 && (
              <div className="mt-6 space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={msg.role === "user"
                    ? "border-l-4 border-[#ff8c69] bg-white/5 px-3 py-2 rounded"
                    : "bg-white/10 px-3 py-2 rounded text-white/90"}>
                    <span className="font-bold mr-2">{msg.role === "user" ? "You:" : "IRA:"}</span>
                    <span>{msg.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}


const styles: { [key: string]: React.CSSProperties } = {

  wrapper: {
    width: "100vw",
    height: "100vh",
    background: "transparent",
    position: "fixed",
    top: 0,
    left: 0,
    pointerEvents: "auto",
    zIndex: 9999,
  },

  bar: {
    width: "100%",
    height: "60px",
    backgroundColor: "rgba(15,15,15,0.92)",
    border: "none",
    borderRadius: 30,
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    boxSizing: "border-box",
    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
    position: "static",
    pointerEvents: "auto",
  },

  drag: {
    width: "40px",
    color: "#888",
    cursor: "grab",
    textAlign: "center",
    fontSize: "18px",
    userSelect: "none",
    marginRight: 8,
  },

  input: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#fff",
    fontSize: "15px",
  },

  button: {
    backgroundColor: "#ff8c69",
    border: "none",
    color: "#000",
    padding: "6px 14px",
    borderRadius: "20px",
    cursor: "pointer",
    marginLeft: 8,
  },

  statusWrap: {
    marginLeft: 12,
    minWidth: 70,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotGreen: {
    display: "inline-block",
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "#1ec07a",
    marginLeft: 12,
    border: "2px solid #fff",
    boxShadow: "0 0 4px #1ec07a",
  },
  statusDotRed: {
    display: "inline-block",
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "#ff4d4f",
    marginLeft: 12,
    border: "2px solid #fff",
    boxShadow: "0 0 4px #ff4d4f",
  },
};

export default App;
