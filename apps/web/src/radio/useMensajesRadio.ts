import { useCallback, useEffect, useRef, useState } from "react";
import { VENTANA_MENSAJE_RADIO_MS, mensajesParaLeer, textoDeAvisoParaLeer, textoParaLeer } from "@la-ramal/nucleo";
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

/** Lo que queda en el cartel después de que habló la voz. */
export type Anuncio = { id: string; de: "terminal" | "empresa"; titulo: string; texto: string; creadoEn: number; dicho: string };

/**
 * Escucha lo que tiene que sonar en el celular del chofer por encima de la radio («ding» + voz):
 * - los mensajes de la terminal (📻 Mensaje por la radio del panel);
 * - los avisos de la empresa (dueño, 30/09: «el aviso se tiene que escuchar»).
 * El último queda en pantalla para leerlo o repetirlo con el coche parado.
 */
export function useMensajesRadio(fuente: Fuente | null, sesion: Sesion | null) {
  const [ultimo, setUltimo] = useState<Anuncio | null>(null);
  const leidos = useRef(new Set(leerLeidos()));

  useEffect(() => desbloquearAlPrimerToque(), []);

  const sonar = useCallback((as: Anuncio[]) => {
    const nuevos = as.filter((a) => !leidos.current.has(a.id)).sort((a, b) => a.creadoEn - b.creadoEn);
    if (!nuevos.length) return;
    for (const a of nuevos) leidos.current.add(a.id);
    guardarLeidos([...leidos.current]);
    setUltimo(nuevos[nuevos.length - 1]!);
    for (const a of nuevos) void anunciar(a.dicho);
  }, []);

  useEffect(() => {
    if (!fuente || !sesion) return;
    // Solo lo reciente: lo viejo no se lee y así las consultas no crecen con los días.
    const desde = [{ campo: "creadoEn", desde: Date.now() - VENTANA_MENSAJE_RADIO_MS }];
    const a = fuente.escuchar(sesion.lineaId, "mensajesRadio", desde, (ms) =>
      sonar(
        mensajesParaLeer(ms, sesion.cocheId, leidos.current, Date.now()).map((m) => ({
          id: m.id, de: "terminal" as const, titulo: m.para === "todos" ? "" : m.para, texto: m.texto, creadoEn: m.creadoEn, dicho: textoParaLeer(m),
        })),
      ),
    );
    const b = fuente.escuchar(sesion.lineaId, "comunicados", desde, (cs) => {
      const ahora = Date.now();
      sonar(
        cs
          .filter((c) => ahora - c.creadoEn <= VENTANA_MENSAJE_RADIO_MS && !c.leidos.includes(sesion.uid))
          .map((c) => ({ id: `aviso:${c.id}`, de: "empresa" as const, titulo: c.titulo, texto: c.texto, creadoEn: c.creadoEn, dicho: textoDeAvisoParaLeer(c) })),
      );
    });
    return () => {
      a();
      b();
    };
  }, [fuente, sesion, sonar]);

  const repetir = useCallback(() => {
    if (ultimo) void anunciar(ultimo.dicho);
  }, [ultimo]);

  return { ultimo, repetir, cerrar: () => setUltimo(null) };
}
