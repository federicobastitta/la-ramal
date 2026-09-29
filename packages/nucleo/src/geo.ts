/**
 * Cálculos sobre el recorrido, sin depender de ningún servicio de mapas (andan sin señal).
 * Las distancias son en metros; los puntos en grados (WGS84).
 */
export type Punto = { lat: number; lng: number };

const R_TIERRA_M = 6_371_008.8;
const rad = (g: number) => (g * Math.PI) / 180;

export function distanciaM(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Proyección local (equirectangular) alrededor de un origen: precisa a escala de una ciudad. */
function aPlano(p: Punto, origen: Punto): { x: number; y: number } {
  return {
    x: rad(p.lng - origen.lng) * Math.cos(rad(origen.lat)) * R_TIERRA_M,
    y: rad(p.lat - origen.lat) * R_TIERRA_M,
  };
}

export type Proyeccion = { distanciaM: number; tramo: number; t: number; recorridoM: number };

/** Punto del recorrido más cercano: a qué distancia está el coche, en qué tramo y cuántos metros lleva hechos. */
export function proyectarEnRecorrido(p: Punto, recorrido: Punto[]): Proyeccion {
  if (recorrido.length < 2) throw new Error("El recorrido necesita al menos dos puntos");
  let mejor: Proyeccion = { distanciaM: Infinity, tramo: 0, t: 0, recorridoM: 0 };
  let acumulado = 0;
  for (let i = 0; i < recorrido.length - 1; i++) {
    const a = recorrido[i]!;
    const b = recorrido[i + 1]!;
    const pa = aPlano(p, a);
    const pb = aPlano(b, a);
    const largo2 = pb.x ** 2 + pb.y ** 2;
    const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, (pa.x * pb.x + pa.y * pb.y) / largo2));
    const d = Math.hypot(pa.x - t * pb.x, pa.y - t * pb.y);
    const largo = Math.sqrt(largo2);
    if (d < mejor.distanciaM) mejor = { distanciaM: d, tramo: i, t, recorridoM: acumulado + t * largo };
    acumulado += largo;
  }
  return mejor;
}

export function largoRecorridoM(recorrido: Punto[]): number {
  let total = 0;
  for (let i = 0; i < recorrido.length - 1; i++) total += distanciaM(recorrido[i]!, recorrido[i + 1]!);
  return total;
}

/** Fuera de recorrido si se aleja más que la tolerancia, teniendo en cuenta el error del GPS. */
export function fueraDeRecorrido(p: Punto & { precisionM?: number }, recorrido: Punto[], toleranciaM = 150): boolean {
  return proyectarEnRecorrido(p, recorrido).distanciaM - (p.precisionM ?? 0) > toleranciaM;
}

/**
 * Tiempo estimado de la vuelta: mediana de las últimas vueltas en la misma franja horaria
 * (la mediana no se deja arrastrar por una vuelta con un choque en el medio).
 */
export function estimarVueltaMin(vueltasMin: number[]): number | null {
  const v = vueltasMin.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : Math.round((v[m - 1]! + v[m]!) / 2);
}

/**
 * Atraso (positivo) o adelanto (negativo) en minutos respecto del horario de la planilla,
 * suponiendo avance parejo entre cabeceras.
 */
export function atrasoMin(recorridoHechoM: number, largoTotalM: number, salida: number, duracionPlanificadaMin: number, ahora: number): number {
  const avance = Math.max(0, Math.min(1, recorridoHechoM / largoTotalM));
  const deberiaEstarEn = salida + avance * duracionPlanificadaMin * 60_000;
  return Math.round((ahora - deberiaEstarEn) / 60_000);
}

export type Turno = { desde: number; hasta: number };

/**
 * Privacidad: la ubicación se comparte solo durante el turno (con 30 minutos de margen para la largada y el cierre).
 * Fuera del turno la app no manda ubicación a nadie, salvo una alerta de pánico.
 */
export function compartirUbicacion(ahora: number, turnos: Turno[], hayPanico: boolean, margenMin = 30): boolean {
  if (hayPanico) return true;
  const m = margenMin * 60_000;
  return turnos.some((t) => ahora >= t.desde - m && ahora <= t.hasta + m);
}
