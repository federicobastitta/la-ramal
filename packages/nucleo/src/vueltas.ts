import { distanciaM, type Punto } from "./geo";

/**
 * Vueltas automáticas: con las posiciones del GPS y las cabeceras de la línea, se detecta
 * cuándo el coche sale de una cabecera y cuándo llega a la otra. El chofer no aprieta nada.
 *
 * - Histéresis: se "entra" a la cabecera a menos de radioM y se "sale" recién pasando radioM × 1,5,
 *   así el GPS que salta en el borde no inventa salidas y llegadas.
 * - Las lecturas con más error que precisionMaxM se ignoran.
 * - Un viaje más corto que minViajeMin (dar la vuelta a la manzana, ir a cargar) no cuenta como vuelta.
 * - Para recorridos circulares, volver a la misma cabecera cuenta si el viaje fue largo.
 */
export type Cabecera = { nombre: string; centro: Punto; radioM: number };
export type Ping = Punto & { en: number; precisionM: number };
export type VueltaReal = { desde: string; hasta: string; sale: number; llega: number };

export type OpcionesVueltas = { precisionMaxM?: number; minViajeMin?: number; factorSalida?: number };

type Estado = { tipo: "afuera" } | { tipo: "en_cabecera"; cabecera: string; ultimoDentro: number } | { tipo: "viajando"; desde: string; sale: number };

export function detectarVueltas(pings: Ping[], cabeceras: Cabecera[], op: OpcionesVueltas = {}): { vueltas: VueltaReal[]; enViaje: { desde: string; sale: number } | null } {
  const precisionMax = op.precisionMaxM ?? 100;
  const minViajeMs = (op.minViajeMin ?? 20) * 60_000;
  const factor = op.factorSalida ?? 1.5;
  const vueltas: VueltaReal[] = [];
  let e = { tipo: "afuera" } as Estado;

  const dentroDe = (p: Punto, escala: number) => cabeceras.find((c) => distanciaM(p, c.centro) <= c.radioM * escala);

  for (const p of [...pings].sort((a, b) => a.en - b.en)) {
    if (p.precisionM > precisionMax) continue;
    switch (e.tipo) {
      case "afuera": {
        const c = dentroDe(p, 1);
        if (c) e = { tipo: "en_cabecera", cabecera: c.nombre, ultimoDentro: p.en };
        break;
      }
      case "en_cabecera": {
        const nombre: string = e.cabecera;
        const actual: Cabecera = cabeceras.find((c) => c.nombre === nombre)!;
        const d = distanciaM(p, actual.centro);
        // La salida es la última lectura todavía adentro del radio (no la primera ya lejos).
        if (d <= actual.radioM) e = { tipo: "en_cabecera", cabecera: nombre, ultimoDentro: p.en };
        else if (d > actual.radioM * factor) e = { tipo: "viajando", desde: actual.nombre, sale: e.ultimoDentro };
        break;
      }
      case "viajando": {
        const c = dentroDe(p, 1);
        if (!c) break;
        const duracion = p.en - e.sale;
        if (c.nombre === e.desde && duracion < minViajeMs) {
          // Volvió a la misma cabecera enseguida: no fue una vuelta (cargar, lavadero, vuelta a la manzana).
          e = { tipo: "en_cabecera", cabecera: c.nombre, ultimoDentro: p.en };
          break;
        }
        if (duracion >= minViajeMs) vueltas.push({ desde: e.desde, hasta: c.nombre, sale: e.sale, llega: p.en });
        e = { tipo: "en_cabecera", cabecera: c.nombre, ultimoDentro: p.en };
        break;
      }
    }
  }
  return { vueltas, enViaje: e.tipo === "viajando" ? { desde: e.desde, sale: e.sale } : null };
}

/**
 * Compara lo real con la planilla: a cada vuelta planificada le toca la vuelta real que salió más cerca de su horario.
 * Devuelve el atraso de salida y de llegada en minutos (positivo = tarde).
 */
export function compararConPlanilla(
  planificadas: { sale: string; llega: string }[],
  reales: VueltaReal[],
  fecha: string,
  zonaMin = -180,
): { plan: { sale: string; llega: string }; real: VueltaReal | null; atrasoSalidaMin: number | null; atrasoLlegadaMin: number | null }[] {
  const aMs = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    // Hora local de la línea (Argentina, UTC−3) pasada a milisegundos UTC.
    return Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10), h ?? 0, m ?? 0) - zonaMin * 60_000;
  };
  const libres = [...reales];
  return planificadas.map((plan) => {
    const objetivo = aMs(plan.sale);
    let mejor = -1;
    for (let i = 0; i < libres.length; i++) {
      if (mejor < 0 || Math.abs(libres[i]!.sale - objetivo) < Math.abs(libres[mejor]!.sale - objetivo)) mejor = i;
    }
    // Más de 90 minutos de diferencia: no es esa vuelta.
    if (mejor < 0 || Math.abs(libres[mejor]!.sale - objetivo) > 90 * 60_000) return { plan, real: null, atrasoSalidaMin: null, atrasoLlegadaMin: null };
    const real = libres.splice(mejor, 1)[0]!;
    let llegadaPlan = aMs(plan.llega);
    if (llegadaPlan < objetivo) llegadaPlan += 86_400_000;
    return { plan, real, atrasoSalidaMin: Math.round((real.sale - objetivo) / 60_000), atrasoLlegadaMin: Math.round((real.llega - llegadaPlan) / 60_000) };
  });
}
