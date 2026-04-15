import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";
import WindowRouter from "./WindowRouter";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WindowRouter />
  </React.StrictMode>,
);
