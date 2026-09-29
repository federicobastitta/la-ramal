import { describe, expect, it } from "vitest";
import { resumirJornada } from "../src/jornada";
import type { ConfigRecorrido } from "../src/esquemas";
import type { Ping } from "../src/vueltas";

const A = { lat: -34.7206, lng: -58.2900 };
const lngPorM = 1 / (111_320 * Math.cos((A.lat * Math.PI) / 180));
const en = (m: number) => ({ lat: A.lat, lng: A.lng + m * lngPorM });
const config: ConfigRecorrido = {
  id: "recorrido", lineaId: "l", ejemplo: false,
  cabeceras: [{ nombre: "A", centro: en(0), radioM: 150 }, { nombre: "B", centro: en(4000), radioM: 150 }],
  paradas: [{ id: "p1", nombre: "P1", punto: en(1000) }, { id: "p2", nombre: "P2", punto: en(2000) }],
  ramales: [{ nombre: "A", trazado: [en(0), en(4000)] }],
};

describe("resumen del día", () => {
  it("arma las vueltas con paradas, km e índice, sin guardar posiciones", () => {
    const ps: Ping[] = [];
    let t = Date.UTC(2026, 8, 29, 10, 0);
    for (let m = 0; m <= 4000; m += 20) {
      ps.push({ ...en(m), en: t, precisionM: 8 });
      t += 8000; // 2,5 m/s: la vuelta dura ~27 min
      if (m === 1000 || m === 2000) for (let s = 0; s < 6; s++) { ps.push({ ...en(m), en: t, precisionM: 8 }); t += 3000; } // para ~18 s
      if (m === 3000) for (let s = 0; s < 20; s++) { ps.push({ ...en(m), en: t, precisionM: 8 }); t += 3000; } // trabado 1 min
    }
    const j = resumirJornada(ps, config, { id: "x", lineaId: "l", choferId: "c", fecha: "2026-09-29", ramal: "A" });
    expect(j.vueltas).toHaveLength(1);
    expect(j.vueltas[0]).toMatchObject({ desde: "A", hasta: "B", paradas: 2 });
    expect(j.vueltas[0]!.minutosTransito).toBeGreaterThan(0.8);
    expect(j.vueltas[0]!.km).toBeGreaterThan(3.5);
    expect(j.vueltas[0]!.puntos).toBeGreaterThan(0);
    expect(JSON.stringify(j)).not.toContain("precisionM");
  });
});
