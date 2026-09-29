import { describe, expect, it } from "vitest";
import { puntosPronostico, tablaProde, type Partido } from "../src/prode";

const jugado: Partido = { id: "1", local: "Boca", visitante: "River", cuando: "", golesLocal: 2, golesVisitante: 1 };
describe("prode", () => {
  it("3 por exacto, 1 por resultado, 0 si le erra", () => {
    expect(puntosPronostico({ partidoId: "1", local: 2, visitante: 1 }, jugado)).toBe(3);
    expect(puntosPronostico({ partidoId: "1", local: 1, visitante: 0 }, jugado)).toBe(1);
    expect(puntosPronostico({ partidoId: "1", local: 1, visitante: 1 }, jugado)).toBe(0);
    expect(puntosPronostico({ partidoId: "1", local: 1, visitante: 1 }, { ...jugado, golesLocal: undefined })).toBeNull();
  });
  it("tabla: puntos y desempate por exactos", () => {
    const t = tablaProde([
      { quien: "Ana", pronosticos: [{ partidoId: "1", local: 1, visitante: 0 }] },
      { quien: "Beto", pronosticos: [{ partidoId: "1", local: 2, visitante: 1 }] },
    ], [jugado]);
    expect(t.map((x) => x.quien)).toEqual(["Beto", "Ana"]);
  });
});
