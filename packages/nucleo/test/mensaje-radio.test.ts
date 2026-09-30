import { describe, expect, it } from "vitest";
import { MensajeRadio, VENTANA_MENSAJE_RADIO_MS, esParaMi, mensajesParaLeer, textoParaLeer } from "../src/mensaje-radio";

const AHORA = 1_790_000_000_000;
const m = (id: string, para: string, haceMin: number): MensajeRadio =>
  MensajeRadio.parse({ id, lineaId: "l", texto: "Desvío por Mitre", para, creadoEn: AHORA - haceMin * 60_000 });

describe("mensajes de la terminal por la radio", () => {
  it("va a toda la flota o a un coche (sin importar mayúsculas ni espacios)", () => {
    expect(esParaMi({ para: "todos" }, "Interno 23")).toBe(true);
    expect(esParaMi({ para: "interno  23" }, "Interno 23")).toBe(true);
    expect(esParaMi({ para: "Interno 24" }, "Interno 23")).toBe(false);
    expect(esParaMi({ para: "Interno 24" }, "")).toBe(false);
  });

  it("lee solo lo nuevo, lo reciente y lo suyo, del más viejo al más nuevo", () => {
    const ms = [m("b", "todos", 1), m("a", "Interno 23", 5), m("viejo", "todos", VENTANA_MENSAJE_RADIO_MS / 60_000 + 1), m("otro", "Interno 99", 1), m("leido", "todos", 2)];
    expect(mensajesParaLeer(ms, "Interno 23", new Set(["leido"]), AHORA).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("la voz dice de dónde viene y para quién", () => {
    expect(textoParaLeer({ texto: "  Desvío  por Mitre ", para: "todos" })).toBe("Mensaje de la terminal. Desvío por Mitre.");
    expect(textoParaLeer({ texto: "Volvé a la cabecera!", para: "Interno 23" })).toBe("Mensaje de la terminal para el Interno 23. Volvé a la cabecera!");
  });

  it("no acepta mensajes vacíos ni larguísimos", () => {
    expect(MensajeRadio.safeParse({ id: "x", lineaId: "l", texto: "   ", creadoEn: 1 }).success).toBe(false);
    expect(MensajeRadio.safeParse({ id: "x", lineaId: "l", texto: "a".repeat(281), creadoEn: 1 }).success).toBe(false);
  });
});
