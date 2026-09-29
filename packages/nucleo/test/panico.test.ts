import { describe, expect, it } from "vitest";
import { MANTENER_MS, REPOSO, pasoPanico, type EstadoPanico, type EventoPanico } from "../src/panico";

function correr(eventos: EventoPanico[], inicio: EstadoPanico = REPOSO) {
  let e = inicio;
  const efectos: string[] = [];
  for (const ev of eventos) {
    const r = pasoPanico(e, ev);
    e = r.estado;
    efectos.push(...r.efectos);
  }
  return { e, efectos };
}

describe("botón de pánico", () => {
  it("mantener apretado 2 s dispara una sola vez", () => {
    const { e, efectos } = correr([{ t: "presionar", en: 0 }, { t: "tick", en: 1000 }, { t: "tick", en: MANTENER_MS }, { t: "tick", en: 2500 }, { t: "soltar", en: 3000 }]);
    expect(efectos.filter((x) => x === "disparar")).toHaveLength(1);
    expect(e.fase).toBe("enviando");
  });

  it("un toque suelto no dispara", () => {
    const { e, efectos } = correr([{ t: "presionar", en: 0 }, { t: "soltar", en: 120 }]);
    expect(efectos).not.toContain("disparar");
    expect(e.fase).toBe("reposo");
  });

  it("doble toque rápido dispara", () => {
    const { efectos } = correr([{ t: "presionar", en: 0 }, { t: "soltar", en: 100 }, { t: "presionar", en: 400 }, { t: "soltar", en: 500 }]);
    expect(efectos).toContain("disparar");
  });

  it("dos toques separados (bolsillo) no disparan", () => {
    const { efectos } = correr([{ t: "presionar", en: 0 }, { t: "soltar", en: 100 }, { t: "presionar", en: 3000 }, { t: "soltar", en: 3100 }]);
    expect(efectos).not.toContain("disparar");
  });

  it("soltar a mitad de camino no dispara", () => {
    const { e, efectos } = correr([{ t: "presionar", en: 0 }, { t: "soltar", en: 1200 }]);
    expect(efectos).not.toContain("disparar");
    expect(e.fase).toBe("reposo");
  });

  it("sin señal reintenta y no vuelve a reposo", () => {
    const { e, efectos } = correr([{ t: "presionar", en: 0 }, { t: "tick", en: 2000 }, { t: "fallo_envio", en: 2100 }, { t: "fallo_envio", en: 4000 }]);
    expect(e.fase).toBe("enviando");
    expect(efectos.filter((x) => x === "reintentar_envio")).toHaveLength(2);
  });

  it("con alerta activa, apretar de nuevo no crea otra", () => {
    const activa: EstadoPanico = { fase: "activa", idAlerta: "a", desde: 0, confirmada: false };
    const { e, efectos } = correr([{ t: "presionar", en: 10_000 }, { t: "tick", en: 13_000 }], activa);
    expect(e).toEqual(activa);
    expect(efectos).toEqual([]);
  });

  it("solo el cierre del servidor vuelve a reposo", () => {
    const { e } = correr([{ t: "enviada", idAlerta: "x", en: 1 }, { t: "confirmada" }, { t: "cerrada" }], { fase: "enviando", desde: 0 });
    expect(e.fase).toBe("reposo");
  });
});
