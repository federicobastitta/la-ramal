import { useEffect, useRef, useState } from "react";
import type { MensajeRadio } from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { arrancarRadio } from "../radio/Radio";
import { desbloquear } from "../radio/locutor";

/** Lo que dice la terminal en la demo (pedido del dueño, 30/09). */
export const AVISO_DEMO = "Cuando termine el recorrido, pase por el taller.";
const ESPERA_MS = 5_000;

/**
 * Demo de GitHub (pedido del dueño, 30/09/2026): la app arranca con una radio AM sonando y a los 5 segundos la terminal
 * manda un mensaje por la radio (ding + voz). Los navegadores no dejan sonar nada hasta el primer toque: si lo frenan,
 * se muestra un botón grande y con ese único toque arranca todo. Con ?sinArranque en la dirección no hace nada (pruebas).
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
    void arrancarRadio("AM", "mitre").then((r) => {
      if (r === "bloqueado") setPedirToque(true);
      else avisoALos5();
    });
  }, []);

  if (!pedirToque) return null;
  return (
    <div className="arranque-demo" role="dialog" aria-label="Empezar la demo">
      <button
        className="arranque-boton"
        onClick={() => {
          desbloquear();
          setPedirToque(false);
          void arrancarRadio("AM", "mitre").finally(avisoALos5);
        }}
      >
        <span className="arranque-icono">▶</span>
        <b>Empezar</b>
        <span>Suena la radio AM y a los 5 segundos llega un mensaje de la terminal</span>
      </button>
    </div>
  );
}
