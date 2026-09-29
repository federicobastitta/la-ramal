import { useCallback, useEffect, useRef, useState } from "react";
import { REPOSO, pasoPanico, type AlertaPanico, type EfectoPanico, type EstadoPanico, type EventoPanico } from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { leerUbicacion } from "../dispositivo/ubicacion";

const CADA_MS_UBICACION = 15_000;
const REINTENTO_MS = 3_000;

/**
 * Une la máquina de estados del núcleo con el mundo real: la pantalla, el botón Bluetooth, el GPS y el servidor.
 * La lógica de cuándo se dispara vive en el núcleo (probada); acá solo se ejecutan los efectos.
 */
export function usePanico(fuente: Fuente | null, sesion: Sesion | null) {
  // El estado vive en una ref (fuente de verdad) y se copia a React para dibujar.
  // Así los efectos se ejecutan una sola vez por evento, aunque React re-ejecute funciones en desarrollo.
  const actual = useRef<EstadoPanico>(REPOSO);
  const [estado, setEstado] = useState<EstadoPanico>(REPOSO);
  const ejecutar = useRef<(e: EfectoPanico) => void>(() => undefined);
  const despachar = useCallback((ev: EventoPanico) => {
    const r = pasoPanico(actual.current, ev);
    actual.current = r.estado;
    setEstado(r.estado);
    r.efectos.forEach((e) => ejecutar.current(e));
  }, []);
  const alerta = useRef<AlertaPanico | null>(null);
  const cerradasPorMi = useRef(new Set<string>());

  const enviar = useCallback(async () => {
    if (!fuente || !sesion) return;
    const ubicacion = await leerUbicacion(4_000);
    alerta.current ??= {
      id: crypto.randomUUID(),
      lineaId: sesion.lineaId,
      cocheId: sesion.cocheId,
      choferId: sesion.uid,
      estado: "activa",
      desde: Date.now(),
      ubicaciones: ubicacion ? [ubicacion] : [],
      origen: "pantalla",
    };
    try {
      await fuente.dispararPanico(alerta.current);
      despachar({ t: "enviada", idAlerta: alerta.current.id, en: Date.now() });
    } catch {
      despachar({ t: "fallo_envio", en: Date.now() });
    }
  }, [fuente, sesion]);

  ejecutar.current = (e) => {
    if (e === "disparar") void enviar();
    if (e === "reintentar_envio") setTimeout(() => void enviar(), REINTENTO_MS);
    if (e === "vibrar_corto") navigator.vibrate?.(60);
  };

  // Mientras se mantiene apretado, el reloj avanza la máquina (sin esperar a que suelte).
  useEffect(() => {
    if (estado.fase !== "apretando") return;
    const id = setInterval(() => despachar({ t: "tick", en: Date.now() }), 50);
    return () => clearInterval(id);
  }, [estado.fase]);

  // Con la alerta activa, la ubicación se sigue mandando hasta que se cierre.
  useEffect(() => {
    if (estado.fase !== "activa" || !fuente || !sesion) return;
    const id = setInterval(async () => {
      const u = await leerUbicacion();
      if (u) await fuente.sumarUbicacionPanico(sesion.lineaId, estado.idAlerta, u).catch(() => undefined);
    }, CADA_MS_UBICACION);
    return () => clearInterval(id);
  }, [estado, fuente, sesion]);

  // Escucha a la terminal: confirmación o cierre.
  useEffect(() => {
    if (!fuente || !sesion || estado.fase !== "activa") return;
    const id = estado.idAlerta;
    return fuente.escucharMiPanico(sesion.lineaId, id, (mia) => {
      if (cerradasPorMi.current.has(id)) return;
      if (!mia) {
        alerta.current = null;
        despachar({ t: "cerrada" });
      } else if (mia.estado === "confirmada" && !(actual.current.fase === "activa" && actual.current.confirmada)) despachar({ t: "confirmada" });
    });
  }, [fuente, sesion, estado.fase, estado.fase === "activa" ? estado.idAlerta : null, despachar]);

  const cancelar = useCallback(
    async (pin: string): Promise<"cerrada" | "pin_incorrecto"> => {
      if (!fuente || !sesion || estado.fase !== "activa") return "cerrada";
      const r = await fuente.cancelarPanico(sesion.lineaId, estado.idAlerta, pin);
      if (r === "cerrada") {
        cerradasPorMi.current.add(estado.idAlerta);
        alerta.current = null;
        despachar({ t: "cerrada" });
      }
      return r;
    },
    [fuente, sesion, estado],
  );

  return { estado, despachar, cancelar };
}
