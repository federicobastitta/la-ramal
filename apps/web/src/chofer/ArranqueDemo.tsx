import { useEffect, useRef } from "react";
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
 * Demo de GitHub (pedido del dueño, 30/09/2026): la app arranca con una radio AM sonando y a los 10 segundos la terminal
 * manda un mensaje por la radio (ding + voz). Con ?sinArranque en la dirección no hace nada (pruebas).
 * Siempre (dueño, 30/09): si la AM preferida no transmite se prueba otra; si ninguna suena o tarda más de 10 s,
 * el mensaje de la terminal sale igual.
 * Sin cartel (dueño, 30/09: «este cartel que no salga»): el iPhone y la mayoría de los navegadores no dejan sonar nada
 * hasta que la persona toca la pantalla. En ese caso no se muestra nada encima: el primer toque en cualquier lado
 * (una pestaña, un botón, la pantalla) prende la radio y a los 10 s de ese toque llega el mensaje. La barra de la radio lo dice chiquito.
 */
export function ArranqueDemo({ fuente, sesion }: { fuente: Fuente; sesion: Sesion }) {
  const hecho = useRef(false);
  const apagado = fuente.modo !== "demo" || new URLSearchParams(location.search).has("sinArranque");

  const enviado = useRef(false);
  /** Manda el mensaje a los ESPERA_MS contados desde `desde` (el arranque, o el toque si el navegador frenó el sonido). */
  const avisoALos10 = (desde: number) => {
    setTimeout(() => {
      if (enviado.current) return;
      enviado.current = true;
      const m: MensajeRadio = { id: crypto.randomUUID(), lineaId: sesion.lineaId, texto: AVISO_DEMO, para: sesion.cocheId || "todos", autor: "Terminal (demo)", creadoEn: Date.now() };
      void fuente.crear(sesion.lineaId, "mensajesRadio", m);
    }, Math.max(0, desde + ESPERA_MS - Date.now()));
  };

  useEffect(() => {
    if (apagado || hecho.current) return;
    hecho.current = true;
    const inicio = Date.now();
    let quitar = () => {};
    void radioAM().then((r) => {
      if (r !== "bloqueado") {
        avisoALos10(inicio); // sonando, sin señal o tardando: el mensaje sale igual, sin esperar a la radio
        return;
      }
      // Frenado hasta el primer toque: se espera cualquier toque, sin cartel.
      const alTocar = () => {
        quitar();
        despertarRadio(); // el iPhone exige dar play dentro del mismo toque
        desbloquear();
        void radioAM();
        avisoALos10(Date.now());
      };
      quitar = () => {
        window.removeEventListener("pointerdown", alTocar, true);
        window.removeEventListener("keydown", alTocar, true);
      };
      window.addEventListener("pointerdown", alTocar, { capture: true, once: true });
      window.addEventListener("keydown", alTocar, { capture: true, once: true });
    });
    return () => quitar();
  }, []);

  return null;
}
