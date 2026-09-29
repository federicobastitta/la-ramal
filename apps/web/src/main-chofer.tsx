import { createRoot } from "react-dom/client";
import { AppChofer } from "./chofer/App";
import "./estilos.css";

createRoot(document.getElementById("raiz")!).render(<AppChofer />);

// La app se instala en el celular y abre sin señal. El service worker también despierta la cola al volver la red.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(async (reg) => {
    await (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("cola-reportes").catch(() => undefined);
  });
}
