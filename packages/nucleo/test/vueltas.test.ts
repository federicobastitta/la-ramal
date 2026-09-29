import { describe, expect, it } from "vitest";
import { compararConPlanilla, detectarVueltas, type Cabecera, type Ping } from "../src/vueltas";
import { demorasPorVuelta, diasConvenientes, horariosPico, productividad, sectoresTrabados } from "../src/estadisticas";

// Recorrido de ejemplo: 4 km en línea recta hacia el este (Quilmes Oeste → Bernal, inventado).
const A = { lat: -34.7206, lng: -58.2900 };
const B = { lat: -34.7206, lng: -58.2463 };
const cabeceras: Cabecera[] = [{ nombre: "Quilmes Oeste", centro: A, radioM: 150 }, { nombre: "Bernal", centro: B, radioM: 150 }];
const lngEn = (frac: number) => A.lng + (B.lng - A.lng) * frac;
const MIN = 60_000;
// 29/09/2026 05:10 hora argentina = 08:10 UTC
const T0 = Date.UTC(2026, 8, 29, 8, 10);

/** Un viaje de A a B en `min` minutos, con un ping por minuto; `lentoDesde..lentoHasta` (fracción) va a la mitad de velocidad. */
function viaje(inicio: number, min: number, ida = true): Ping[] {
  const ps: Ping[] = [];
  for (let m = 0; m <= min; m++) {
    const f = m / min;
    ps.push({ lat: A.lat, lng: lngEn(ida ? f : 1 - f), en: inicio + m * MIN, precisionM: 10 });
  }
  return ps;
}

describe("vueltas automáticas", () => {
  it("detecta ida y vuelta sin que el chofer toque nada", () => {
    const pings = [...viaje(T0, 50), ...viaje(T0 + 60 * MIN, 55, false)];
    const { vueltas, enViaje } = detectarVueltas(pings, cabeceras);
    expect(vueltas.map((v) => `${v.desde}>${v.hasta}`)).toEqual(["Quilmes Oeste>Bernal", "Bernal>Quilmes Oeste"]);
    expect(enViaje).toBeNull();
  });

  it("una salida corta y vuelta a la misma cabecera no cuenta", () => {
    const ida = viaje(T0, 50).slice(0, 5); // se aleja ~400 m
    const vuelta = [...ida].reverse().map((p, i) => ({ ...p, en: T0 + (5 + i) * MIN }));
    expect(detectarVueltas([...ida, ...vuelta], cabeceras).vueltas).toEqual([]);
  });

  it("ignora lecturas con mucho error de GPS", () => {
    const pings = viaje(T0, 50).map((p, i) => (i === 25 ? { ...p, lng: B.lng, precisionM: 500 } : p));
    expect(detectarVueltas(pings, cabeceras).vueltas).toHaveLength(1);
  });

  it("compara con la planilla: atraso de salida y de llegada", () => {
    const pings = viaje(T0 + 4 * MIN, 50); // salió 05:14 en vez de 05:10
    const { vueltas } = detectarVueltas(pings, cabeceras);
    const c = compararConPlanilla([{ sale: "05:10", llega: "06:00" }, { sale: "06:10", llega: "07:00" }], vueltas, "2026-09-29");
    expect(c[0]!.atrasoSalidaMin).toBeGreaterThanOrEqual(4);
    expect(c[0]!.atrasoSalidaMin).toBeLessThanOrEqual(6);
    expect(c[1]!.real).toBeNull();
  });
});

describe("estadísticas del chofer", () => {
  const v = (desde: string, hasta: string, sale: number, min: number) => ({ desde, hasta, sale, llega: sale + min * MIN });

  it("demora de cada vuelta contra lo normal de ese sentido", () => {
    const d = demorasPorVuelta([v("A", "B", T0, 50), v("A", "B", T0 + 200 * MIN, 50), v("A", "B", T0 + 400 * MIN, 70)]);
    expect(d.map((x) => x.demoraMin)).toEqual([0, 0, 20]);
  });

  it("encuentra el sector trabado", () => {
    // 50 min de viaje, pero los primeros 1000 m tardan el triple.
    const ps: Ping[] = [];
    let t = T0;
    for (let m = 0; m <= 4000; m += 100) {
      ps.push({ lat: A.lat, lng: lngEn(m / 4000), en: t, precisionM: 10 });
      t += (m < 1000 ? 3 : 1) * MIN;
    }
    const s = sectoresTrabados(ps, [A, B], { largoTramoM: 1000 });
    expect(s[0]!.desdeM).toBe(0);
    expect(s[0]!.minutosPorKm).toBeGreaterThan(s[1]!.minutosPorKm * 2);
  });

  it("horarios pico y días convenientes", () => {
    const lunes = Date.UTC(2026, 8, 28, 10, 0); // lunes 07:00 AR
    const vs = [v("A", "B", lunes, 70), v("A", "B", lunes + 5 * 3_600_000, 45), v("A", "B", lunes + 5 * 86_400_000 + 3 * 3_600_000, 40)]; // sábado 10:00
    const pico = horariosPico(vs);
    expect(pico.find((f) => f.hora === 7)?.duracionMin).toBe(70);
    const dias = diasConvenientes(vs);
    expect(dias[0]!.nombre).toBe("sábado");
    expect(dias.at(-1)!.nombre).toBe("lunes");
  });

  it("productividad: cumplimiento, puntualidad y km", () => {
    const pings = viaje(T0, 50);
    const { vueltas } = detectarVueltas(pings, cabeceras);
    const comp = compararConPlanilla([{ sale: "05:10", llega: "06:00" }, { sale: "06:10", llega: "07:00" }], vueltas, "2026-09-29");
    const p = productividad(comp, pings);
    expect(p.vueltasPlanificadas).toBe(2);
    expect(p.vueltasHechas).toBe(1);
    expect(p.cumplimiento).toBe(50);
    expect(p.kmRecorridos).toBeGreaterThan(3.9);
    expect(p.kmRecorridos).toBeLessThan(4.1);
  });
});
