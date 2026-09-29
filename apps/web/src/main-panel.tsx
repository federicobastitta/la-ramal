import { createRoot } from "react-dom/client";
import { Panel } from "./panel/Panel";
import "./estilos.css";

createRoot(document.getElementById("raiz")!).render(
  <>
    <header className="top">
      <div className="brand">LA RAMAL <small>panel de la línea</small></div>
    </header>
    <Panel />
  </>,
);
