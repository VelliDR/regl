import { render } from "preact";
import { App } from "./ui/App";
import "./ui/tokens.css";

// PWA otomatik güncelleme: Yeni sürüm hazır olduğunda sayfayı otomatik olarak yeniler
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

const root = document.getElementById("app");
if (root) {
  render(<App />, root);
}
