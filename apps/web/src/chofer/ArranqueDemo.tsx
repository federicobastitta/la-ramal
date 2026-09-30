import { useEffect, useRef, useState } from "react";
import type { MensajeRadio } from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { arrancarRadio } from "../radio/Radio";
import { desbloquear, despertarRadio } from "../radio/locutor";

/** Lo que dice la terminal en la demo (pedido del dueño, 30/09). */
export const AVISO_DEMO = "Cuando termine el recorrido, pase por el taller.";
/** Dueño, 30/09: a los 10 s y no a los 5, porque al arrancar se junta todo (carga, radio, permisos) y el aviso se perdía. */
const ESPERA_MS = 10_000;
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
 * Demo de GitHub (pedido del dueño, 30/09/2026): la app arranca con una radio AM y a los 10 segundos la terminal
 * manda un mensaje por la radio (ding + voz). Con ?sinArranque en la dirección no hace nada (pruebas).
 * Siempre (dueño, 30/09): si la AM preferida no transmite se prueba otra; si ninguna suena, el mensaje sale igual.
 * Botón «Empezar» (dueño, 30/09: «dejá el botón que estaba antes», sin él no sonaba): el iPhone y Chrome no dejan
 * sonar la voz hasta que la persona toca la pantalla, aunque la radio haya arrancado sola. Por eso el botón sale
 * SIEMPRE al abrir la demo, tapa toda la pantalla (cualquier toque sirve) y los 10 s se cuentan desde ese toque.
 */
export function ArranqueDemo({ fuente, sesion }: { fuente: Fuente; sesion: Sesion }) {
  const apagado = fuente.modo !== "demo" || new URLSearchParams(location.search).has("sinArranque");
  const [pedirToque, setPedirToque] = useState(!apagado);
  const hecho = useRef(false);
  const enviado = useRef(false);
  const primera = useRef<Promise<unknown>>(Promise.resolve());

  // Se intenta prender la AM de entrada: si el navegador la deja, ya suena detrás del botón.
  useEffect(() => {
    if (apagado || hecho.current) return;
    hecho.current = true;
    primera.current = radioAM();
  }, []);

  const empezar = () => {
    setPedirToque(false);
    despertarRadio(); // el iPhone exige dar play dentro del mismo toque
    desbloquear();
    void primera.current.then((r) => {
      if (r !== "sonando") void radioAM(); // no se corta la que ya suena
    });
    setTimeout(() => {
      if (enviado.current) return;
      enviado.current = true;
      const m: MensajeRadio = { id: crypto.randomUUID(), lineaId: sesion.lineaId, texto: AVISO_DEMO, para: sesion.cocheId || "todos", autor: "Terminal (demo)", creadoEn: Date.now() };
      void fuente.crear(sesion.lineaId, "mensajesRadio", m);
    }, ESPERA_MS);
  };

  if (!pedirToque) return null;
  return (
    // Cualquier toque en la pantalla arranca (no hace falta acertarle al botón).
    <div className="arranque-demo" role="dialog" aria-label="Empezar la demo" onClick={empezar}>
      <button className="arranque-boton" type="button">
        <span className="arranque-icono">▶</span>
        <b>Empezar</b>
        <span>Suena la radio AM y a los 10 segundos llega un mensaje de la terminal</span>
      </button>
    </div>
  );
}
