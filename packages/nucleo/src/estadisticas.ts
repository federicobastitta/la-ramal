import { distanciaM, largoRecorridoM, proyectarEnRecorrido, type Punto } from "./geo";
import type { Ping, VueltaReal } from "./vueltas";

/**
 * Estadísticas y productividad del chofer, sacadas solo de las vueltas automáticas y del GPS.
 * Todo es cálculo local y probado: no depende de ningún servicio.
 */

const mediana = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
};
const redondear = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------------------------
// Demoras por vuelta
// ---------------------------------------------------------------------------------------------
export type DemoraVuelta = { vuelta: VueltaReal; duracionMin: number; demoraMin: number };

/** Cuánto tardó cada vuelta contra lo normal de ese sentido (la mediana de todas las vueltas de ese sentido). */
export function demorasPorVuelta(vueltas: VueltaReal[]): DemoraVuelta[] {
  const porSentido = new Map<string, number[]>();
  const dur = (v: VueltaReal) => (v.llega - v.sale) / 60_000;
  for (const v of vueltas) {
    const k = `${v.desde}>${v.hasta}`;
    porSentido.set(k, [...(porSentido.get(k) ?? []), dur(v)]);
  }
  return vueltas.map((v) => {
    const normal = mediana(porSentido.get(`${v.desde}>${v.hasta}`) ?? []);
    return { vuelta: v, duracionMin: Math.round(dur(v)), demoraMin: Math.round(dur(v) - normal) };
  });
}

// ---------------------------------------------------------------------------------------------
// Sectores más trabados: el recorrido se corta en tramos y se mide la velocidad en cada uno.
// ---------------------------------------------------------------------------------------------
export type Sector = { desdeM: number; hastaM: number; nombre: string; minutosPorKm: number; muestras: number };

/**
 * Tramos de largoTramoM metros (o los nombres que ponga tráfico: "Mitre entre Calchaquí y Mosconi").
 * Para cada par de pings seguidos sobre el recorrido, el tiempo se reparte en el tramo donde cayeron.
 */
export function sectoresTrabados(
  pings: Ping[],
  recorrido: Punto[],
  op: { largoTramoM?: number; nombres?: string[]; toleranciaM?: number; precisionMaxM?: number } = {},
): Sector[] {
  const largoTramo = op.largoTramoM ?? 500;
  const total = largoRecorridoM(recorrido);
  const n = Math.max(1, Math.ceil(total / largoTramo));
  const tiempo = new Array<number>(n).fill(0);
  const metros = new Array<number>(n).fill(0);
  const muestras = new Array<number>(n).fill(0);
  const validos = pings
    .filter((p) => p.precisionM <= (op.precisionMaxM ?? 60))
    .sort((a, b) => a.en - b.en)
    .map((p) => ({ p, pr: proyectarEnRecorrido(p, recorrido) }))
    .filter((x) => x.pr.distanciaM <= (op.toleranciaM ?? 80));

  for (let i = 1; i < validos.length; i++) {
    const a = validos[i - 1]!;
    const b = validos[i]!;
    const dt = (b.p.en - a.p.en) / 60_000;
    const dm = b.pr.recorridoM - a.pr.recorridoM;
    // Solo avance hacia adelante y sin huecos largos de señal (más de 5 minutos no se puede repartir bien).
    if (dm <= 0 || dt <= 0 || dt > 5) continue;
    const tramo = Math.min(n - 1, Math.floor(((a.pr.recorridoM + b.pr.recorridoM) / 2) / largoTramo));
    tiempo[tramo]! += dt;
    metros[tramo]! += dm;
    muestras[tramo]! += 1;
  }
  return tiempo
    .map((t, i) => ({
      desdeM: i * largoTramo,
      hastaM: Math.min(total, (i + 1) * largoTramo),
      nombre: op.nombres?.[i] ?? `Km ${redondear((i * largoTramo) / 1000)} a ${redondear(Math.min(total, (i + 1) * largoTramo) / 1000)}`,
      minutosPorKm: metros[i]! > 0 ? redondear(t / (metros[i]! / 1000)) : 0,
      muestras: muestras[i]!,
    }))
    .filter((s) => s.muestras > 0)
    .sort((a, b) => b.minutosPorKm - a.minutosPorKm);
}

// ---------------------------------------------------------------------------------------------
// Horarios pico: duración de la vuelta según la hora de salida.
// ---------------------------------------------------------------------------------------------
export type Franja = { hora: number; vueltas: number; duracionMin: number };

export function horariosPico(vueltas: VueltaReal[], zonaMin = -180): Franja[] {
  const porHora = new Map<number, number[]>();
  for (const v of vueltas) {
    const hora = new Date(v.sale + zonaMin * 60_000).getUTCHours();
    porHora.set(hora, [...(porHora.get(hora) ?? []), (v.llega - v.sale) / 60_000]);
  }
  return [...porHora.entries()].map(([hora, ds]) => ({ hora, vueltas: ds.length, duracionMin: Math.round(mediana(ds)) })).sort((a, b) => a.hora - b.hora);
}

// ---------------------------------------------------------------------------------------------
// Productividad
// ---------------------------------------------------------------------------------------------
export type Productividad = {
  vueltasPlanificadas: number;
  vueltasHechas: number;
  cumplimiento: number; // 0 a 100
  puntualidad: number; // % de salidas dentro de ±tolerancia
  atrasoPromedioMin: number;
  horasManejando: number;
  kmRecorridos: number;
  kmPorHora: number;
};

export function productividad(
  comparacion: { real: VueltaReal | null; atrasoSalidaMin: number | null }[],
  pings: Ping[],
  toleranciaMin = 5,
): Productividad {
  const hechas = comparacion.filter((c) => c.real);
  const atrasos = hechas.map((c) => c.atrasoSalidaMin ?? 0);
  const minutos = hechas.reduce((s, c) => s + (c.real!.llega - c.real!.sale) / 60_000, 0);
  const ordenados = pings.filter((p) => p.precisionM <= 60).sort((a, b) => a.en - b.en);
  let km = 0;
  for (let i = 1; i < ordenados.length; i++) {
    const d = distanciaM(ordenados[i - 1]!, ordenados[i]!);
    // Saltos imposibles (más de 90 km/h promedio entre dos lecturas) son errores del GPS.
    const h = (ordenados[i]!.en - ordenados[i - 1]!.en) / 3_600_000;
    if (h > 0 && d / 1000 / h <= 90) km += d / 1000;
  }
  return {
    vueltasPlanificadas: comparacion.length,
    vueltasHechas: hechas.length,
    cumplimiento: comparacion.length ? Math.round((hechas.length / comparacion.length) * 100) : 0,
    puntualidad: atrasos.length ? Math.round((atrasos.filter((a) => Math.abs(a) <= toleranciaMin).length / atrasos.length) * 100) : 0,
    atrasoPromedioMin: atrasos.length ? redondear(atrasos.reduce((s, a) => s + a, 0) / atrasos.length) : 0,
    horasManejando: redondear(minutos / 60),
    kmRecorridos: redondear(km),
    kmPorHora: minutos > 0 ? redondear(km / (minutos / 60)) : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Días más convenientes: qué día de la semana las vueltas salen más rápidas.
// ---------------------------------------------------------------------------------------------
export const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
export type Dia = { dia: number; nombre: string; vueltas: number; duracionMin: number; contraPromedioMin: number };

/** Ordenados del más conveniente (vueltas más cortas) al menos conveniente. contraPromedioMin: minutos de más o de menos. */
export function diasConvenientes(vueltas: VueltaReal[], zonaMin = -180): Dia[] {
  const porDia = new Map<number, number[]>();
  const todas: number[] = [];
  for (const v of vueltas) {
    const d = (v.llega - v.sale) / 60_000;
    const dia = new Date(v.sale + zonaMin * 60_000).getUTCDay();
    porDia.set(dia, [...(porDia.get(dia) ?? []), d]);
    todas.push(d);
  }
  const general = mediana(todas);
  return [...porDia.entries()]
    .map(([dia, ds]) => ({ dia, nombre: NOMBRE_DIA[dia]!, vueltas: ds.length, duracionMin: Math.round(mediana(ds)), contraPromedioMin: Math.round(mediana(ds) - general) }))
    .sort((a, b) => a.duracionMin - b.duracionMin);
}
