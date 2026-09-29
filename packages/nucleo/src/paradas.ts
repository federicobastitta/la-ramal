import { distanciaM, type Punto } from "./geo";
import type { Cabecera, Ping, VueltaReal } from "./vueltas";

/**
 * Paradas y detenciones: cuando el coche queda casi quieto un rato, se cuenta una detención.
 * Si cae cerca de una parada del recorrido, es una parada de pasajeros; si no, es tránsito
 * (semáforo, embotellamiento, corte). En las cabeceras no se cuenta: ahí es descanso.
 */
export type Parada = { id: string; nombre: string; punto: Punto };
export type Detencion = { inicio: number; fin: number; duracionSeg: number; punto: Punto; tipo: "parada" | "transito"; paradaId?: string };

export type OpcionesDetenciones = { velMaxMS?: number; minSeg?: number; radioParadaM?: number; precisionMaxM?: number };

export function detectarDetenciones(pings: Ping[], paradas: Parada[], cabeceras: Cabecera[] = [], op: OpcionesDetenciones = {}): Detencion[] {
  const velMax = op.velMaxMS ?? 1.5; // ~5 km/h
  const minSeg = op.minSeg ?? 8;
  const radio = op.radioParadaM ?? 30;
  const ps = pings.filter((p) => p.precisionM <= (op.precisionMaxM ?? 40)).sort((a, b) => a.en - b.en);
  const salida: Detencion[] = [];
  let inicio = -1;

  const cerrar = (i0: number, i1: number) => {
    const a = ps[i0]!;
    const b = ps[i1]!;
    const duracionSeg = (b.en - a.en) / 1000;
    if (duracionSeg < minSeg) return;
    const tramo = ps.slice(i0, i1 + 1);
    const punto = { lat: tramo.reduce((s, p) => s + p.lat, 0) / tramo.length, lng: tramo.reduce((s, p) => s + p.lng, 0) / tramo.length };
    if (cabeceras.some((c) => distanciaM(punto, c.centro) <= c.radioM)) return;
    let cercana: Parada | undefined;
    let mejor = Infinity;
    for (const pa of paradas) {
      const d = distanciaM(punto, pa.punto);
      if (d < mejor) [mejor, cercana] = [d, pa];
    }
    const esParada = cercana && mejor <= radio;
    salida.push({ inicio: a.en, fin: b.en, duracionSeg: Math.round(duracionSeg), punto, tipo: esParada ? "parada" : "transito", ...(esParada ? { paradaId: cercana!.id } : {}) });
  };

  for (let i = 1; i < ps.length; i++) {
    const dt = (ps[i]!.en - ps[i - 1]!.en) / 1000;
    const quieto = dt > 0 && distanciaM(ps[i - 1]!, ps[i]!) / dt <= velMax;
    if (quieto && inicio < 0) inicio = i - 1;
    if (!quieto && inicio >= 0) {
      cerrar(inicio, i - 1);
      inicio = -1;
    }
  }
  if (inicio >= 0) cerrar(inicio, ps.length - 1);
  return salida;
}

export type ResumenParadas = { paradas: number; minutosEnParadas: number; detencionesTransito: number; minutosEnTransito: number };

export function resumirDetenciones(ds: Detencion[]): ResumenParadas {
  const p = ds.filter((d) => d.tipo === "parada");
  const t = ds.filter((d) => d.tipo === "transito");
  const min = (xs: Detencion[]) => Math.round(xs.reduce((s, d) => s + d.duracionSeg, 0) / 6) / 10;
  return { paradas: p.length, minutosEnParadas: min(p), detencionesTransito: t.length, minutosEnTransito: min(t) };
}

/**
 * Índice de exigencia: cuánto le pide el recorrido al chofer. La fórmula es pública y simple,
 * para que cualquiera la pueda revisar (el chofer, la empresa o el gremio):
 *   1 punto por parada · 0,5 por minuto trabado en el tránsito · 0,5 por km · 5 por vuelta en hora pico.
 * Sirve para comparar turnos y recorridos y pedir que los más exigentes se valoren más.
 */
export const PESOS_EXIGENCIA = { parada: 1, minutoTransito: 0.5, km: 0.5, vueltaEnPico: 5 } as const;
export const HORAS_PICO: readonly [number, number][] = [[6, 9], [17, 20]];

export function enHoraPico(ms: number, zonaMin = -180, franjas = HORAS_PICO): boolean {
  const h = new Date(ms + zonaMin * 60_000).getUTCHours();
  return franjas.some(([a, b]) => h >= a && h < b);
}

export type Exigencia = { puntos: number; detalle: { paradas: number; minutosTransito: number; km: number; vueltasEnPico: number } };

export function indiceExigencia(r: ResumenParadas, km: number, vueltas: VueltaReal[], zonaMin = -180): Exigencia {
  const vueltasEnPico = vueltas.filter((v) => enHoraPico(v.sale, zonaMin)).length;
  const puntos =
    r.paradas * PESOS_EXIGENCIA.parada + r.minutosEnTransito * PESOS_EXIGENCIA.minutoTransito + km * PESOS_EXIGENCIA.km + vueltasEnPico * PESOS_EXIGENCIA.vueltaEnPico;
  return { puntos: Math.round(puntos), detalle: { paradas: r.paradas, minutosTransito: r.minutosEnTransito, km: Math.round(km * 10) / 10, vueltasEnPico } };
}

/** Franjas horarias: el mismo recorrido no exige lo mismo a las 18 que a las 4 de la mañana. */
export const FRANJAS = [
  { nombre: "madrugada", desde: 0, hasta: 6 },
  { nombre: "mañana pico", desde: 6, hasta: 9 },
  { nombre: "mañana", desde: 9, hasta: 12 },
  { nombre: "mediodía", desde: 12, hasta: 17 },
  { nombre: "tarde pico", desde: 17, hasta: 20 },
  { nombre: "noche", desde: 20, hasta: 24 },
] as const;

export function franjaHoraria(ms: number, zonaMin = -180): string {
  const h = new Date(ms + zonaMin * 60_000).getUTCHours();
  return FRANJAS.find((f) => h >= f.desde && h < f.hasta)!.nombre;
}

/**
 * Riesgo: los incidentes de seguridad (agresor, robo) reportados en ese recorrido y franja suman al índice,
 * así la madrugada —menos paradas y menos tránsito, pero más peligro— no queda como "fácil".
 */
export const PUNTOS_POR_INCIDENTE = 10;

/** Una vuelta ya medida: a qué recorrido pertenece, cuándo salió, cuánto duró y su exigencia. */
export type VueltaMedida = { recorrido: string; sale: number; duracionMin: number; puntos: number; incidentes?: number };
export type ExigenciaRecorrido = { recorrido: string; franja: string; vueltas: number; puntosPorVuelta: number; puntosPorHora: number; contraPromedioPct: number };

/**
 * Índice de exigencia por recorrido (ramal y sentido) Y franja horaria. Se ordena del más exigente al menos exigente.
 * contraPromedioPct compara los puntos por hora contra el promedio de toda la línea (0 = igual al promedio).
 * Con menos de `minVueltas` vueltas un recorrido no se informa: sería injusto sacar conclusiones con tan poco.
 */
export function exigenciaPorRecorrido(vs: VueltaMedida[], minVueltas = 5, zonaMin = -180): ExigenciaRecorrido[] {
  const grupos = new Map<string, VueltaMedida[]>();
  const clave = (v: VueltaMedida) => `${v.recorrido}\u0000${franjaHoraria(v.sale, zonaMin)}`;
  for (const v of vs) grupos.set(clave(v), [...(grupos.get(clave(v)) ?? []), v]);
  const puntos = (v: VueltaMedida) => v.puntos + (v.incidentes ?? 0) * PUNTOS_POR_INCIDENTE;
  const porHora = (xs: VueltaMedida[]) => {
    const horas = xs.reduce((s, v) => s + v.duracionMin, 0) / 60;
    return horas > 0 ? xs.reduce((s, v) => s + puntos(v), 0) / horas : 0;
  };
  const general = porHora(vs);
  return [...grupos.entries()]
    .filter(([, xs]) => xs.length >= minVueltas)
    .map(([k, xs]) => {
      const ph = porHora(xs);
      const [recorrido, franja] = k.split("\u0000") as [string, string];
      return {
        recorrido,
        franja,
        vueltas: xs.length,
        puntosPorVuelta: Math.round((xs.reduce((s, v) => s + puntos(v), 0) / xs.length) * 10) / 10,
        puntosPorHora: Math.round(ph * 10) / 10,
        contraPromedioPct: general > 0 ? Math.round((ph / general - 1) * 100) : 0,
      };
    })
    .sort((a, b) => b.puntosPorHora - a.puntosPorHora);
}
