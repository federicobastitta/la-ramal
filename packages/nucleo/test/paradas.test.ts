import { describe, expect, it } from "vitest";
import { detectarDetenciones, enHoraPico, indiceExigencia, resumirDetenciones, type Parada } from "../src/paradas";
import type { Ping } from "../src/vueltas";

const base = { lat: -34.7206, lng: -58.2900 };
const metrosAlEste = (m: number) => ({ lat: base.lat, lng: base.lng + m / (111_320 * Math.cos((base.lat * Math.PI) / 180)) });
const T0 = Date.UTC(2026, 8, 29, 10, 0);

/** Un tramo con pings cada 2 s: anda a 8 m/s, se detiene `seg` segundos en `enM` metros, y sigue. */
function conDetencion(enM: number, seg: number): Ping[] {
  const ps: Ping[] = [];
  let t = T0;
  let m = 0;
  while (m < enM) { ps.push({ ...metrosAlEste(m), en: t, precisionM: 8 }); m += 16; t += 2000; }
  for (let s = 0; s <= seg; s += 2) { ps.push({ ...metrosAlEste(enM), en: t, precisionM: 8 }); t += 2000; }
  for (let k = 1; k <= 20; k++) { ps.push({ ...metrosAlEste(enM + k * 16), en: t, precisionM: 8 }); t += 2000; }
  return ps;
}

const paradas: Parada[] = [{ id: "p1", nombre: "Mitre y Calchaquí", punto: metrosAlEste(400) }];

describe("paradas", () => {
  it("una detención al lado de la parada cuenta como parada", () => {
    const d = detectarDetenciones(conDetencion(400, 20), paradas);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ tipo: "parada", paradaId: "p1" });
  });
  it("lejos de una parada es tránsito", () => {
    const d = detectarDetenciones(conDetencion(250, 30), paradas);
    expect(d[0]?.tipo).toBe("transito");
  });
  it("frenar 4 segundos no cuenta", () => {
    expect(detectarDetenciones(conDetencion(400, 4), paradas)).toHaveLength(0);
  });
  it("en la cabecera no cuenta (es descanso)", () => {
    expect(detectarDetenciones(conDetencion(400, 60), paradas, [{ nombre: "C", centro: metrosAlEste(400), radioM: 100 }])).toHaveLength(0);
  });
  it("resumen e índice de exigencia con la fórmula pública", () => {
    const r = resumirDetenciones([
      { inicio: 0, fin: 20_000, duracionSeg: 20, punto: base, tipo: "parada", paradaId: "p1" },
      { inicio: 0, fin: 120_000, duracionSeg: 120, punto: base, tipo: "transito" },
    ]);
    expect(r).toEqual({ paradas: 1, minutosEnParadas: 0.3, detencionesTransito: 1, minutosEnTransito: 2 });
    const pico = Date.UTC(2026, 8, 29, 10, 30); // 07:30 AR
    expect(enHoraPico(pico)).toBe(true);
    const e = indiceExigencia(r, 10, [{ desde: "A", hasta: "B", sale: pico, llega: pico + 3_000_000 }]);
    expect(e.puntos).toBe(Math.round(1 + 2 * 0.5 + 10 * 0.5 + 5));
  });
});

import { exigenciaPorRecorrido } from "../src/paradas";
describe("exigencia por recorrido", () => {
  const tarde = Date.UTC(2026, 8, 29, 21, 0); // 18:00 AR
  const madrugada = Date.UTC(2026, 8, 29, 7, 0); // 04:00 AR
  it("separa el mismo recorrido por franja horaria y ordena del más exigente", () => {
    const vs = [
      ...Array.from({ length: 5 }, () => ({ recorrido: "Ramal A ida", sale: tarde, duracionMin: 60, puntos: 60 })),
      ...Array.from({ length: 5 }, () => ({ recorrido: "Ramal A ida", sale: madrugada, duracionMin: 60, puntos: 20 })),
      { recorrido: "Ramal C ida", sale: tarde, duracionMin: 60, puntos: 200 }, // una sola vuelta: no se informa
    ];
    const r = exigenciaPorRecorrido(vs);
    expect(r.map((x) => `${x.recorrido} · ${x.franja}`)).toEqual(["Ramal A ida · tarde pico", "Ramal A ida · madrugada"]);
    expect(r[0]!.contraPromedioPct).toBeGreaterThan(0);
    expect(r[1]!.contraPromedioPct).toBeLessThan(0);
  });
  it("los incidentes de seguridad suben la madrugada", () => {
    const vs = [
      ...Array.from({ length: 5 }, () => ({ recorrido: "Ramal A ida", sale: tarde, duracionMin: 60, puntos: 40 })),
      ...Array.from({ length: 5 }, () => ({ recorrido: "Ramal A ida", sale: madrugada, duracionMin: 60, puntos: 20, incidentes: 3 })),
    ];
    expect(exigenciaPorRecorrido(vs)[0]!.franja).toBe("madrugada");
  });
});
