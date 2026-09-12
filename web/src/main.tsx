import { createRoot } from "react-dom/client";
import { OwlLetter } from "./components/incant/OwlLetter";
import { AccessGate } from "./components/incant/AccessGate";
import "./styles.css";
const owlToken = new URLSearchParams(location.hash.slice(1)).get("owl");
createRoot(document.getElementById("root")!).render(
  owlToken ? <OwlLetter token={owlToken} /> : <AccessGate />,
);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
