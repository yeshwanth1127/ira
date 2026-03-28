import React, { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ExactIraUI from "./ExactIraUI";
import ResponseWindowUI from "./ResponseWindowUI";
import SettingsWindowUI from "./SettingsWindowUI";

export default function WindowRouter() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    // Synchronous in practice, but keep it async-safe.
    setLabel(getCurrentWindow().label);
  }, []);

  if (!label) return null;

  if (label === "response") return <ResponseWindowUI />;
  if (label === "settings") return <SettingsWindowUI />;
  return <ExactIraUI />;
}

