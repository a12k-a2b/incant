import { createRoot } from "react-dom/client";
import { AccessGate } from "./components/incant/AccessGate";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<AccessGate />);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
