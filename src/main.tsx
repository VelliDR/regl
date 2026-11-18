import { render } from "preact";
import { App } from "./ui/App";
import { pwaNeedRefreshSignal } from "./ui/components/PwaPrompt";
import "./ui/tokens.css";

// PWA güncellemesi: Kullanıcı form doldururken ani sayfa yenileme ile veri kaybını önlemek
// için yeni Service Worker devraldığında kontrollü yenileme banner'ı gösterilir.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) {
      pwaNeedRefreshSignal.value = true;
    }
  });
}

const root = document.getElementById("app");
if (root) {
  render(<App />, root);
}
