import type { ConfigRecorrido, Jornada } from "./esquemas";
import { distanciaM } from "./geo";
import { detectarDetenciones, indiceExigencia, resumirDetenciones } from "./paradas";
import { detectarVueltas, type Ping } from "./vueltas";

/** Km recorridos según el GPS, descartando saltos imposibles (más de 90 km/h entre dos lecturas). */
export function kmDePings(pings: Ping[]): number {
  const ps = pings.filter((p) => p.precisionM <= 60).sort((a, b) => a.en - b.en);
  let km = 0;
  for (let i = 1; i < ps.length; i++) {
    const d = distanciaM(ps[i - 1]!, ps[i]!) / 1000;
    const h = (ps[i]!.en - ps[i - 1]!.en) / 3_600_000;
    if (h > 0 && d / h <= 90) km += d;
  }
  return Math.round(km * 10) / 10;
}

/**
 * Con las posiciones del día y el recorrido de la línea arma el resumen que se guarda:
 * cada vuelta con sus paradas, el tiempo trabado en el tránsito, los km y su índice de exigencia.
 * Las posiciones crudas no salen del celular.
 */
export function resumirJornada(
  pings: Ping[],
  config: ConfigRecorrido,
  base: Pick<Jornada, "id" | "lineaId" | "choferId" | "fecha" | "ramal">,
  ahora = Date.now(),
): Jornada {
  const { vueltas } = detectarVueltas(pings, config.cabeceras);
  const detenciones = detectarDetenciones(pings, config.paradas, config.cabeceras);
  const resumen = vueltas.map((v) => {
    const dentro = pings.filter((p) => p.en >= v.sale && p.en <= v.llega);
    const r = resumirDetenciones(detenciones.filter((d) => d.inicio >= v.sale && d.fin <= v.llega));
    const km = kmDePings(dentro);
    return { ...v, paradas: r.paradas, minutosTransito: r.minutosEnTransito, km, puntos: indiceExigencia(r, km, [v]).puntos };
  });
  return { ...base, vueltas: resumen, km: kmDePings(pings), actualizadaEn: ahora, ejemplo: false };
}
