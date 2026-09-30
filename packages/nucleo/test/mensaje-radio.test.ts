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

describe("avisos de la empresa en voz alta", () => {
  it("lee título y texto, y dice si es importante", async () => {
    const { textoDeAvisoParaLeer } = await import("../src/mensaje-radio");
    expect(textoDeAvisoParaLeer({ titulo: "Doblar en Directorio", texto: "Desde mañana el ramal B dobla en Directorio" })).toBe(
      "Aviso de la empresa. Doblar en Directorio. Desde mañana el ramal B dobla en Directorio.",
    );
    expect(textoDeAvisoParaLeer({ titulo: "Paro", texto: "Mañana no hay servicio.", importante: true })).toBe("Aviso importante de la empresa. Paro. Mañana no hay servicio.");
  });

  it("un aviso largo se corta en una oración y manda a Papeles", async () => {
    const { textoDeAvisoParaLeer, LARGO_AVISO_HABLADO } = await import("../src/mensaje-radio");
    const largo = Array.from({ length: 30 }, (_, i) => `Esta es la oración número ${i + 1}.`).join(" ");
    const dicho = textoDeAvisoParaLeer({ titulo: "Nuevo reglamento", texto: largo });
    expect(dicho.endsWith("El aviso completo está en Papeles.")).toBe(true);
    expect(dicho.length).toBeLessThan(LARGO_AVISO_HABLADO + 120);
    expect(dicho).toContain("número 1.");
  });
});
