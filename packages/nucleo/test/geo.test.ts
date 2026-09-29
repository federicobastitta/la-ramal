import { describe, expect, it } from "vitest";
import { atrasoMin, compartirUbicacion, distanciaM, estimarVueltaMin, fueraDeRecorrido, largoRecorridoM, proyectarEnRecorrido } from "../src/geo";

// Tramo recto de ~1 km hacia el este, en Quilmes.
const A = { lat: -34.7206, lng: -58.2546 };
const B = { lat: -34.7206, lng: -58.2437 };
const C = { lat: -34.7116, lng: -58.2437 };
const recorrido = [A, B, C];

describe("geo", () => {
  it("distancia conocida", () => {
    expect(distanciaM(A, B)).toBeGreaterThan(990);
    expect(distanciaM(A, B)).toBeLessThan(1010);
  });

  it("proyecta al tramo correcto y mide lo recorrido", () => {
    const mitadPrimerTramo = { lat: -34.7206, lng: (A.lng + B.lng) / 2 };
    const p = proyectarEnRecorrido(mitadPrimerTramo, recorrido);
    expect(p.tramo).toBe(0);
    expect(p.distanciaM).toBeLessThan(1);
    expect(p.recorridoM).toBeGreaterThan(490);
    expect(p.recorridoM).toBeLessThan(510);
    const total = largoRecorridoM(recorrido);
    expect(total).toBeGreaterThan(1990);
  });

  it("fuera de recorrido descuenta el error del GPS", () => {
    const aDoscientos = { lat: -34.7206 - 0.0018, lng: (A.lng + B.lng) / 2 };
    expect(fueraDeRecorrido(aDoscientos, recorrido)).toBe(true);
    expect(fueraDeRecorrido({ ...aDoscientos, precisionM: 80 }, recorrido)).toBe(false);
  });

  it("la vuelta estimada usa la mediana", () => {
    expect(estimarVueltaMin([100, 102, 180, 98])).toBe(101);
    expect(estimarVueltaMin([])).toBeNull();
  });

  it("atraso respecto de la planilla", () => {
    // A mitad de recorrido, 60 minutos después de salir, con vuelta planificada de 100 minutos: 10 min tarde.
    expect(atrasoMin(1000, 2000, 0, 100, 60 * 60_000)).toBe(10);
  });

  it("no comparte ubicación fuera del turno, salvo pánico", () => {
    const h = 3_600_000;
    const turnos = [{ desde: 5 * h, hasta: 13 * h }];
    expect(compartirUbicacion(9 * h, turnos, false)).toBe(true);
    expect(compartirUbicacion(20 * h, turnos, false)).toBe(false);
    expect(compartirUbicacion(20 * h, turnos, true)).toBe(true);
  });
});
