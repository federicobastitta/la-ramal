import { useEffect, useRef, useState } from "react";
import type { MensajeRadio } from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { arrancarRadio } from "../radio/Radio";
import { desbloquear } from "../radio/locutor";

/** Lo que dice la terminal en la demo (pedido del dueño, 30/09). */
export const AVISO_DEMO = "Cuando termine el recorrido, pase por el taller.";
const ESPERA_MS = 5_000;
/** Si la radio tarda en conectar, el mensaje no la espera más que esto: el aviso tiene que pasar siempre. */
const TOPE_RADIO_MS = 10_000;

/** Prende la AM (probando varias) pero sin esperarla más de TOPE_RADIO_MS. */
function radioAM() {
  return Promise.race([
    arrancarRadio("AM", "mitre"),
    new Promise<"tarda">((ok) => setTimeout(() => ok("tarda"), TOPE_RADIO_MS)),
  ]);
}

/**
 * Demo de GitHub (pedido del dueño, 30/09/2026): la app arranca con una radio AM sonando y a los 5 segundos la terminal
 * manda un mensaje por la radio (ding + voz). Los navegadores no dejan sonar nada hasta el primer toque: si lo frenan,
 * se muestra un botón grande y con ese único toque arranca todo. Con ?sinArranque en la dirección no hace nada (pruebas).
 * Siempre (dueño, 30/09): si la AM preferida no transmite se prueba otra; si ninguna suena o tarda más de 10 s,
 * el mensaje de la terminal sale igual.
 */
export function ArranqueDemo({ fuente, sesion }: { fuente: Fuente; sesion: Sesion }) {
  const [pedirToque, setPedirToque] = useState(false);
  const hecho = useRef(false);
  const apagado = fuente.modo !== "demo" || new URLSearchParams(location.search).has("sinArranque");

  const avisoALos5 = () => {
    setTimeout(() => {
      const m: MensajeRadio = { id: crypto.randomUUID(), lineaId: sesion.lineaId, texto: AVISO_DEMO, para: sesion.cocheId || "todos", autor: "Terminal (demo)", creadoEn: Date.now() };
      void fuente.crear(sesion.lineaId, "mensajesRadio", m);
    }, ESPERA_MS);
  };

  useEffect(() => {
    if (apagado || hecho.current) return;
    hecho.current = true;
    void radioAM().then((r) => {
      if (r === "bloqueado") setPedirToque(true);
      else avisoALos5(); // sonando, sin señal o tardando: el mensaje sale igual
    });
  }, []);

  if (!pedirToque) return null;
  return (
    // Cualquier toque en la pantalla arranca (no hace falta acertarle al botón).
    <div
      className="arranque-demo"
      role="dialog"
      aria-label="Empezar la demo"
      onClick={() => {
        desbloquear();
        setPedirToque(false);
        void radioAM().finally(avisoALos5);
      }}
    >
      <button className="arranque-boton" type="button">
        <span className="arranque-icono">▶</span>
        <b>Empezar</b>
        <span>Suena la radio AM y a los 5 segundos llega un mensaje de la terminal</span>
      </button>
    </div>
  );
}
