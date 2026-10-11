// Entry point: global styles (fonts → tokens → base → components → shells), then <App/> inside the store.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/fonts.css";
import "./ui/tokens.css";
import "./ui/base.css";
import "./ui/components.css";
import "./app/layouts/layouts.css";
import App from "./app/App";
import { StoreProvider } from "./app/StoreProvider";
import { RootBoundary } from "./app/layouts/RootBoundary";

const root = document.getElementById("root");
if (!root) throw new Error("Kinwise: #root element missing from index.html");

createRoot(root).render(
  <StrictMode>
    <RootBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </RootBoundary>
  </StrictMode>,
);
