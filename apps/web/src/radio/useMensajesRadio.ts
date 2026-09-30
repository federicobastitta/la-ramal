import { useCallback, useEffect, useRef, useState } from "react";
import { VENTANA_MENSAJE_RADIO_MS, mensajesParaLeer, textoParaLeer, type MensajeRadio } from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { anunciar, desbloquearAlPrimerToque } from "./locutor";

const CLAVE = "la-ramal-mensajes-radio-leidos";
const leerLeidos = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const guardarLeidos = (ids: string[]) => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(ids.slice(-200)));
  } catch {
    /* sin almacenamiento: a lo sumo se repite uno */
  }
};

/**
 * Escucha los mensajes de la terminal: cada uno nuevo suena con «ding» + voz por encima de la radio,
 * y queda en pantalla para leerlo o repetirlo con el coche parado.
 */
export function useMensajesRadio(fuente: Fuente | null, sesion: Sesion | null) {
  const [ultimo, setUltimo] = useState<MensajeRadio | null>(null);
  const leidos = useRef(new Set(leerLeidos()));

  useEffect(() => desbloquearAlPrimerToque(), []);

  useEffect(() => {
    if (!fuente || !sesion) return;
    // Solo los recientes: los viejos no se leen y así la consulta no crece con los días.
    return fuente.escuchar(sesion.lineaId, "mensajesRadio", [{ campo: "creadoEn", desde: Date.now() - VENTANA_MENSAJE_RADIO_MS }], (ms) => {
      const nuevos = mensajesParaLeer(ms, sesion.cocheId, leidos.current, Date.now());
      if (!nuevos.length) return;
      for (const m of nuevos) leidos.current.add(m.id);
      guardarLeidos([...leidos.current]);
      setUltimo(nuevos[nuevos.length - 1]!);
      for (const m of nuevos) void anunciar(textoParaLeer(m));
    });
  }, [fuente, sesion]);

  const repetir = useCallback(() => {
    if (ultimo) void anunciar(textoParaLeer(ultimo));
  }, [ultimo]);

  return { ultimo, repetir, cerrar: () => setUltimo(null) };
}
