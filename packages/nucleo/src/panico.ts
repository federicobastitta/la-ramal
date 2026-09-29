/**
 * Máquina de estados del botón de pánico.
 *
 * Reglas (sin falsas alarmas y sin alarmas dobles):
 * - Se dispara manteniendo apretado MANTENER_MS, o con dos toques cortos separados por menos de DOBLE_TOQUE_MS.
 * - Un toque suelto no hace nada (el botón va en el bolsillo o en el llavero).
 * - Con una alerta en curso, volver a apretar no crea otra.
 * - Solo el servidor cierra la alerta (verifica el PIN); el celular no puede cerrarla por su cuenta.
 *
 * Es una función pura: recibe el estado y un evento con su hora, devuelve el estado nuevo y los efectos.
 * Así se prueba sin relojes ni Bluetooth.
 */
export const MANTENER_MS = 2000;
export const DOBLE_TOQUE_MS = 600;
/** Un toque más largo que esto ya no cuenta como toque (es un apretón que se soltó antes de tiempo). */
export const TOQUE_MAX_MS = 350;

export type EstadoPanico =
  | { fase: "reposo"; ultimoToque?: number }
  | { fase: "apretando"; desde: number; ultimoToque?: number }
  | { fase: "enviando"; desde: number }
  | { fase: "activa"; idAlerta: string; desde: number; confirmada: boolean };

export type EventoPanico =
  | { t: "presionar"; en: number }
  | { t: "soltar"; en: number }
  | { t: "tick"; en: number }
  | { t: "enviada"; idAlerta: string; en: number }
  | { t: "fallo_envio"; en: number }
  | { t: "confirmada" }
  | { t: "cerrada" };

export type EfectoPanico = "disparar" | "vibrar_corto" | "reintentar_envio";

export const REPOSO: EstadoPanico = { fase: "reposo" };

export function pasoPanico(e: EstadoPanico, ev: EventoPanico): { estado: EstadoPanico; efectos: EfectoPanico[] } {
  switch (e.fase) {
    case "reposo":
      if (ev.t === "presionar") return { estado: { fase: "apretando", desde: ev.en, ultimoToque: e.ultimoToque }, efectos: [] };
      return { estado: e, efectos: [] };

    case "apretando": {
      if (ev.t === "tick" || ev.t === "soltar") {
        const duracion = ev.en - e.desde;
        if (duracion >= MANTENER_MS) return disparar(ev.en);
        if (ev.t === "tick") return { estado: e, efectos: [] };
        // Se soltó antes de tiempo: ¿fue un toque?
        if (duracion <= TOQUE_MAX_MS) {
          if (e.ultimoToque !== undefined && e.desde - e.ultimoToque <= DOBLE_TOQUE_MS) return disparar(ev.en);
          return { estado: { fase: "reposo", ultimoToque: ev.en }, efectos: ["vibrar_corto"] };
        }
        return { estado: REPOSO, efectos: [] };
      }
      return { estado: e, efectos: [] };
    }

    case "enviando":
      if (ev.t === "enviada") return { estado: { fase: "activa", idAlerta: ev.idAlerta, desde: e.desde, confirmada: false }, efectos: [] };
      // Sin señal no se abandona: se reintenta hasta que salga.
      if (ev.t === "fallo_envio") return { estado: e, efectos: ["reintentar_envio"] };
      return { estado: e, efectos: [] };

    case "activa":
      if (ev.t === "confirmada") return { estado: { ...e, confirmada: true }, efectos: ["vibrar_corto"] };
      if (ev.t === "cerrada") return { estado: REPOSO, efectos: [] };
      // Apretar de nuevo con la alerta en curso no genera otra alerta.
      return { estado: e, efectos: [] };
  }
}

function disparar(en: number): { estado: EstadoPanico; efectos: EfectoPanico[] } {
  return { estado: { fase: "enviando", desde: en }, efectos: ["disparar"] };
}

/** Avance de 0 a 1 mientras se mantiene apretado (para dibujar la barra). */
export function progresoPanico(e: EstadoPanico, ahora: number): number {
  if (e.fase !== "apretando") return e.fase === "reposo" ? 0 : 1;
  return Math.min(1, Math.max(0, (ahora - e.desde) / MANTENER_MS));
}
