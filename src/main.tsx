import React from "react";
import ReactDOM from "react-dom/client";
// Imported from JS (not index.css) so Vite resolves BlockNote's nested Mantine @imports;
// through Tailwind's CSS pipeline they were dropped and every editor menu lost its styles.
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@fontsource-variable/fraunces";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
