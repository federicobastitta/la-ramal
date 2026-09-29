import { describe, expect, it } from "vitest";
import {
  conformidadVigente, descansosMin, diasParaVencer, duracionTurnoMin, duracionVueltaMin, estadoInicial, horasDelPeriodo, horasExtra,
  intercambiarPlanillas, leerVueltas, nivelVencimiento, sha256Hex, tocaAvisar, transicionPedido, type Pedido, type Planilla, type Recibo,
} from "../src/personal";

const planilla = (extra: Partial<Planilla> = {}): Planilla => ({
  id: "p1", lineaId: "l", choferId: "a", choferNombre: "Ana", fecha: "2026-09-29", cocheId: "Interno 23", cabecera: "Quilmes Oeste", ramal: "A",
  vueltas: [{ sale: "05:10", llega: "06:52" }, { sale: "07:05", llega: "08:50" }], franco: false, publicadaEn: 0, ...extra,
});
const pedido = (extra: Partial<Pedido> = {}): Pedido => ({
  id: "x", lineaId: "l", choferId: "a", choferNombre: "Ana", tipo: "cambio_turno", detalle: "", adjuntos: [], estado: "ofrecido", creadoEn: 0, fecha: "2026-10-04", ...extra,
});

describe("planillas", () => {
  it("duración de vueltas, del turno y descansos", () => {
    expect(duracionVueltaMin({ sale: "05:10", llega: "06:52" })).toBe(102);
    expect(duracionVueltaMin({ sale: "23:30", llega: "00:40" })).toBe(70);
    expect(duracionTurnoMin(planilla())).toBe(220);
    expect(descansosMin(planilla())).toEqual([13]);
  });
  it("horas del período y extras, sin contar francos", () => {
    const larga = planilla({ vueltas: [{ sale: "05:00", llega: "14:30" }] });
    expect(horasDelPeriodo([larga, planilla({ franco: true })])).toBe(9.5);
    expect(horasExtra([larga, planilla()])).toBe(1.5);
  });
  it("lee las vueltas pegadas desde un Excel", () => {
    const r = leerVueltas("5:10-6:52\n07.05 a 08:50\nbasura");
    expect(r.vueltas).toEqual([{ sale: "05:10", llega: "06:52" }, { sale: "07:05", llega: "08:50" }]);
    expect(r.errores).toHaveLength(1);
  });
  it("intercambia planillas del mismo día", () => {
    const [a, b] = intercambiarPlanillas(planilla(), planilla({ id: "p2", choferId: "b", choferNombre: "Beto", cocheId: "Interno 31" }));
    expect(a).toMatchObject({ id: "p1", choferId: "a", cocheId: "Interno 31" });
    expect(b).toMatchObject({ id: "p2", choferId: "b", cocheId: "Interno 23" });
    expect(() => intercambiarPlanillas(planilla(), planilla({ fecha: "2026-10-01" }))).toThrow();
  });
});

describe("vencimientos", () => {
  it("cuenta días y pone el nivel", () => {
    expect(diasParaVencer("2026-10-29", "2026-09-29")).toBe(30);
    expect(nivelVencimiento("2026-09-28", "2026-09-29")).toBe("vencido");
    expect(nivelVencimiento("2026-10-03", "2026-09-29")).toBe("urgente");
    expect(nivelVencimiento("2026-10-20", "2026-09-29")).toBe("pronto");
    expect(nivelVencimiento("2027-03-14", "2026-09-29")).toBe("al_dia");
  });
  it("avisa a 30, 15, 7, 1 y 0 días", () => {
    expect(tocaAvisar("2026-10-29", "2026-09-29")).toBe(true);
    expect(tocaAvisar("2026-10-28", "2026-09-29")).toBe(false);
  });
});

describe("recibos", () => {
  it("la conformidad vale solo para el mismo archivo", async () => {
    const h = await sha256Hex(new TextEncoder().encode("recibo"));
    expect(h).toHaveLength(64);
    const r: Recibo = { id: "r", lineaId: "l", choferId: "a", periodo: "2026-08", neto: 1, ruta: "x", sha256: h, mime: "application/pdf", origen: "personal", subidoEn: 0, conformidad: { en: 1, sha256: h } };
    expect(conformidadVigente(r)).toBe(true);
    expect(conformidadVigente({ ...r, sha256: "0".repeat(64) })).toBe(false);
  });
});

describe("pedidos", () => {
  const ana = { uid: "a", rol: "chofer" } as const;
  const beto = { uid: "b", rol: "chofer" } as const;
  const trafico = { uid: "t", rol: "trafico" } as const;

  it("el cambio de turno se ofrece, lo toma un compañero y lo aprueba tráfico", () => {
    expect(estadoInicial("cambio_turno")).toBe("ofrecido");
    expect(transicionPedido(pedido(), ana, "tomar")).toMatchObject({ ok: false });
    expect(transicionPedido(pedido(), trafico, "aprobar")).toMatchObject({ ok: false });
    expect(transicionPedido(pedido(), beto, "tomar")).toEqual({ ok: true, estado: "tomado" });
    const tomado = pedido({ estado: "tomado", tomadoPor: "b" });
    expect(transicionPedido(tomado, beto, "aprobar")).toMatchObject({ ok: false });
    expect(transicionPedido(tomado, trafico, "aprobar")).toEqual({ ok: true, estado: "aprobado" });
    expect(transicionPedido(tomado, beto, "soltar")).toEqual({ ok: true, estado: "ofrecido" });
  });
  it("un certificado se entrega; un parte de enfermo no", () => {
    expect(estadoInicial("certificado_trabajo")).toBe("pendiente");
    expect(transicionPedido(pedido({ tipo: "certificado_trabajo", estado: "pendiente" }), trafico, "entregar")).toEqual({ ok: true, estado: "entregado" });
    expect(transicionPedido(pedido({ tipo: "parte_enfermo", estado: "pendiente" }), trafico, "entregar")).toMatchObject({ ok: false });
  });
  it("solo quien pidió cancela, y antes de la respuesta", () => {
    expect(transicionPedido(pedido({ estado: "pendiente", tipo: "vacaciones" }), beto, "cancelar")).toMatchObject({ ok: false });
    expect(transicionPedido(pedido({ estado: "pendiente", tipo: "vacaciones" }), ana, "cancelar")).toEqual({ ok: true, estado: "cancelado" });
    expect(transicionPedido(pedido({ estado: "aprobado", tipo: "vacaciones" }), ana, "cancelar")).toMatchObject({ ok: false });
  });
});

import { estimarPlata } from "../src/personal";
describe("plata", () => {
  const dia = (fecha: string, horas: number) => ({ fecha, franco: false, vueltas: [{ sale: "05:00", llega: `${String(5 + horas).padStart(2, "0")}:00` }] });
  it("el día 1 ya está el básico; se suman las extras al valor que pagó el último recibo", () => {
    const planillas = [dia("2026-08-03", 10), dia("2026-08-04", 10), dia("2026-09-01", 9), dia("2026-09-02", 8), dia("2026-09-03", 11)];
    // Agosto: 4 h extra pagadas $40.000 → $10.000 la hora extra. Septiembre: 1 + 0 + 3 = 4 h extra.
    const e = estimarPlata([{ periodo: "2026-08", neto: 900_000, basico: 1_000_000, extras: 40_000 }], planillas, "2026-09-29");
    expect(e).toMatchObject({ basico: 1_000_000, horasExtraMes: 4, valorHoraExtra: 10_000, extrasMes: 40_000, estimadoMes: 1_040_000 });
    expect(estimarPlata([{ periodo: "2026-08", neto: 900_000, basico: 1_000_000, extras: 40_000 }], [], "2026-09-01")?.estimadoMes).toBe(1_000_000);
  });
  it("sin recibo con básico no inventa nada", () => {
    expect(estimarPlata([], [], "2026-09-29")).toBeNull();
    expect(estimarPlata([{ periodo: "2026-08", neto: 1 }], [], "2026-09-29")).toBeNull();
  });
});

import { estimarSueldo, minutosNocturnos, type Escala } from "../src/personal";
describe("sueldo con la escala del convenio", () => {
  const escala: Escala = {
    id: "vigente", lineaId: "l", desde: "2026-04-01", basico: 1_920_000, antiguedadPctPorAnio: 1, viaticoPorDia: 16_000, presentismo: 50_000,
    recargoExtraComunPct: 50, recargoExtraDomingoFeriadoPct: 100, recargoNocturnoPct: 0, jornadaHoras: 8, divisorHoras: 192, bonoPorKm: 0, feriados: ["2026-09-02"], fuente: "prueba", ejemplo: true,
  };
  const dia = (fecha: string, sale: string, llega: string) => ({ fecha, franco: false, vueltas: [{ sale, llega }] });
  it("día 1: básico + antigüedad + un viático", () => {
    const e = estimarSueldo(escala, [dia("2026-09-01", "05:00", "13:00")], "2026-09-01", 10);
    const monto = (c: string) => e.lineas.find((l) => l.concepto === c)!.monto;
    expect(monto("Básico")).toBe(1_920_000);
    expect(monto("Antigüedad")).toBe(192_000);
    expect(monto("Viáticos")).toBe(16_000);
    expect(monto("Horas extra")).toBe(0);
    expect(e.valorHora).toBe(10_000);
  });
  it("extras al 50 % en día común y al 100 % en feriado", () => {
    const e = estimarSueldo(escala, [dia("2026-09-01", "05:00", "15:00"), dia("2026-09-02", "05:00", "14:00")], "2026-09-30", 0);
    const l = (c: string) => e.lineas.find((x) => x.concepto === c)!;
    expect(l("Horas extra").monto).toBe(30_000); // 2 h × 10.000 × 1,5
    expect(l("Horas extra domingo y feriado").monto).toBe(20_000); // 1 h × 10.000 × 2
    expect(e.diasTrabajados).toBe(2);
  });
  it("cuenta las horas nocturnas y avisa si falta cargar el recargo", () => {
    expect(minutosNocturnos([{ sale: "04:00", llega: "07:00" }])).toBe(120);
    expect(minutosNocturnos([{ sale: "22:30", llega: "00:30" }])).toBe(120);
    const e = estimarSueldo(escala, [dia("2026-09-01", "04:00", "12:00")], "2026-09-30", 0);
    expect(e.lineas.find((x) => x.concepto === "Horas nocturnas")?.faltaCargar).toBe(true);
  });
});

describe("bono por kilómetro", () => {
  const base: Escala = {
    id: "vigente", lineaId: "l", desde: "2026-04-01", basico: 1_920_000, antiguedadPctPorAnio: 1, viaticoPorDia: 0, presentismo: 0,
    recargoExtraComunPct: 50, recargoExtraDomingoFeriadoPct: 100, recargoNocturnoPct: 0, jornadaHoras: 8, divisorHoras: 192, bonoPorKm: 0, feriados: [], fuente: "", ejemplo: false,
  };
  it("no aparece si no se paga; si se paga, km del GPS × valor", () => {
    expect(estimarSueldo(base, [], "2026-09-10", 0, 900).lineas.some((l) => l.concepto === "Bono por kilómetro")).toBe(false);
    const e = estimarSueldo({ ...base, bonoPorKm: 50 }, [], "2026-09-10", 0, 900);
    expect(e.lineas.find((l) => l.concepto === "Bono por kilómetro")?.monto).toBe(45_000);
  });
});
