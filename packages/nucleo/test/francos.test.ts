import { describe, expect, it } from "vitest";
import { PublicacionFranco, calendarioDelMes, diasDelCambio, puedePublicar, puedeTomar, resumenFranco, transicionFranco } from "../src/francos";

const HOY = "2026-10-01";
// Carlos: franco el domingo 4, trabaja el 5 y el 6. Beto: trabaja el 4, franco el 5, trabaja el 6.
const carlos = [{ fecha: "2026-10-04", franco: true }, { fecha: "2026-10-05", franco: false }, { fecha: "2026-10-06", franco: false }];
const beto = [{ fecha: "2026-10-04", franco: false }, { fecha: "2026-10-05", franco: true }, { fecha: "2026-10-06", franco: false }];
const pub = (x: Partial<PublicacionFranco> = {}): PublicacionFranco =>
  PublicacionFranco.parse({ id: "f1", lineaId: "l", tipo: "ofrezco", choferId: "carlos", choferNombre: "Carlos", fecha: "2026-10-04", estado: "publicado", creadoEn: 1, ...x });

describe("bolsa de francos: publicar", () => {
  it("ofrezco solo un franco que tengo; pido solo un día que trabajo", () => {
    expect(puedePublicar("ofrezco", "2026-10-04", undefined, carlos, HOY)).toEqual({ ok: true });
    expect(puedePublicar("ofrezco", "2026-10-05", undefined, carlos, HOY)).toMatchObject({ ok: false });
    expect(puedePublicar("pido", "2026-10-05", undefined, carlos, HOY)).toEqual({ ok: true });
    expect(puedePublicar("pido", "2026-10-04", undefined, carlos, HOY)).toMatchObject({ ok: false });
  });
  it("no se publica un día pasado ni uno sin planilla", () => {
    expect(puedePublicar("pido", "2026-10-01", undefined, carlos, HOY)).toMatchObject({ ok: false, motivo: expect.stringContaining("no pasó") });
    expect(puedePublicar("pido", "2026-10-20", undefined, carlos, HOY)).toMatchObject({ ok: false, motivo: expect.stringContaining("no cargó") });
  });
  it("a cambio: el día de devolución es al revés", () => {
    expect(puedePublicar("ofrezco", "2026-10-04", "2026-10-05", carlos, HOY)).toEqual({ ok: true });
    expect(puedePublicar("ofrezco", "2026-10-04", "2026-10-04", carlos, HOY)).toMatchObject({ ok: false });
    expect(puedePublicar("pido", "2026-10-05", "2026-10-06", carlos, HOY)).toMatchObject({ ok: false });
    expect(puedePublicar("pido", "2026-10-05", "2026-10-04", carlos, HOY)).toEqual({ ok: true });
  });
});

describe("bolsa de francos: tomar", () => {
  it("el franco ofrecido lo toma alguien que ese día trabaja", () => {
    expect(puedeTomar(pub(), "beto", beto)).toEqual({ ok: true });
    expect(puedeTomar(pub(), "carlos", carlos)).toMatchObject({ ok: false, motivo: "Es tuyo" });
    expect(puedeTomar(pub({ fecha: "2026-10-05" }), "beto", beto)).toMatchObject({ ok: false });
  });
  it("el franco pedido lo da alguien que ese día tiene franco, y la devolución se cruza", () => {
    expect(puedeTomar(pub({ tipo: "pido", fecha: "2026-10-05" }), "beto", beto)).toEqual({ ok: true });
    expect(puedeTomar(pub({ tipo: "ofrezco", fecha: "2026-10-04", aCambioDe: "2026-10-05" }), "beto", beto)).toEqual({ ok: true });
    expect(puedeTomar(pub({ tipo: "ofrezco", fecha: "2026-10-04", aCambioDe: "2026-10-06" }), "beto", beto)).toMatchObject({ ok: false });
    expect(puedeTomar(pub({ estado: "acordado" }), "beto", beto)).toMatchObject({ ok: false });
  });
});

describe("bolsa de francos: estados", () => {
  const chofer = (uid: string) => ({ uid, rol: "chofer" as const });
  const trafico = { uid: "t", rol: "trafico" as const };
  it("publicado → acordado (un compañero) → aprobado (la gerencia)", () => {
    expect(transicionFranco(pub(), chofer("beto"), "tomar")).toEqual({ ok: true, estado: "acordado" });
    expect(transicionFranco(pub(), chofer("carlos"), "tomar")).toMatchObject({ ok: false });
    expect(transicionFranco(pub(), trafico, "aprobar")).toMatchObject({ ok: false, motivo: expect.stringContaining("compañero") });
    const acordado = pub({ estado: "acordado", contraparteId: "beto" });
    expect(transicionFranco(acordado, chofer("beto"), "aprobar")).toMatchObject({ ok: false });
    expect(transicionFranco(acordado, trafico, "aprobar")).toEqual({ ok: true, estado: "aprobado" });
  });
  it("soltar, cancelar y rechazar", () => {
    const acordado = pub({ estado: "acordado", contraparteId: "beto" });
    expect(transicionFranco(acordado, chofer("beto"), "soltar")).toEqual({ ok: true, estado: "publicado" });
    expect(transicionFranco(acordado, chofer("otro"), "soltar")).toMatchObject({ ok: false });
    expect(transicionFranco(acordado, chofer("carlos"), "cancelar")).toEqual({ ok: true, estado: "cancelado" });
    expect(transicionFranco(pub({ estado: "aprobado" }), chofer("carlos"), "cancelar")).toMatchObject({ ok: false });
    expect(transicionFranco(pub(), trafico, "rechazar")).toEqual({ ok: true, estado: "rechazado" });
  });
});

describe("bolsa de francos: calendario y textos", () => {
  it("arma el mes de lunes a domingo con lo mío y lo publicado", () => {
    const dias = calendarioDelMes("2026-10", [{ fecha: "2026-10-04", tipo: "ofrezco", estado: "publicado" }, { fecha: "2026-10-04", tipo: "pido", estado: "cancelado" }], carlos);
    expect(dias.length % 7).toBe(0);
    expect(dias[0]!.fecha).toBe("2026-09-28"); // el 1/10/2026 es jueves: arranca el lunes 28/9
    const d4 = dias.find((d) => d.fecha === "2026-10-04")!;
    expect(d4).toMatchObject({ delMes: true, mio: "franco", ofrecen: 1, piden: 0 });
    expect(dias.at(-1)!.fecha).toBe("2026-11-01");
  });
  it("días que se cambian y resumen", () => {
    expect(diasDelCambio({ fecha: "2026-10-04" })).toEqual(["2026-10-04"]);
    expect(diasDelCambio({ fecha: "2026-10-04", aCambioDe: "2026-10-05" })).toEqual(["2026-10-04", "2026-10-05"]);
    expect(resumenFranco({ tipo: "pido", choferNombre: "Carlos", fecha: "2026-10-05", aCambioDe: "2026-10-04" })).toBe("Carlos pide franco el 2026-10-05, a cambio del 2026-10-04");
  });
});
