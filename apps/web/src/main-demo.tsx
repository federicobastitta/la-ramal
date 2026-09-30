import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppChofer } from "./chofer/App";
import { Panel } from "./panel/Panel";
import "./estilos.css";
import { sinZoom } from "./sin-zoom";

sinZoom();

/**
 * Demo en una sola pantalla: la app del chofer y el panel de la línea lado a lado.
 * Cada uno tiene su propia "conexión" demo; se hablan por BroadcastChannel como si fueran dos celulares.
 * En pantallas chicas se ve uno por vez, con un selector.
 */
function Demo() {
  const [ver, setVer] = useState<"chofer" | "panel">("chofer");
  return (
    <>
      <header className="top">
        <div className="brand">LA RAMAL <small>demo con datos de ejemplo</small></div>
        <div className="switch solo-chico" role="group" aria-label="Qué ver">
          <button aria-pressed={ver === "chofer"} onClick={() => setVer("chofer")}>App del chofer</button>
          <button aria-pressed={ver === "panel"} onClick={() => setVer("panel")}>Panel de la línea</button>
        </div>
      </header>
      <p className="demo">
        <b>Probala:</b> mandá un reporte con foto o mantené apretado el botón de pánico en la app del chofer, y mirá cómo llega al panel.
        PIN de la demo: <b>7391</b> cancela; <b>7392</b> es el de coacción. Los datos quedan solo en este navegador.
      </p>
      <div className="demo-dos" data-ver={ver}>
        <section className="demo-chofer" aria-label="App del chofer"><AppChofer /></section>
        <section className="demo-panel" aria-label="Panel de la línea"><Panel /></section>
      </div>
    </>
  );
}

createRoot(document.getElementById("raiz")!).render(<Demo />);
