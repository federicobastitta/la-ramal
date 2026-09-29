import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { armarPedidoRecibo, camposDelRecibo, leerReciboConIA } from "../src/leer-recibo";

describe("lectura del recibo", () => {
  it("manda el PDF como documento y la foto como imagen", () => {
    expect((armarPedidoRecibo({ mime: "application/pdf", base64: "AA" }).content as { type: string }[])[0]!.type).toBe("document");
    expect((armarPedidoRecibo({ mime: "image/jpeg", base64: "AA" }).content as { type: string }[])[0]!.type).toBe("image");
  });
  it("solo guarda lo que vino escrito en el recibo", async () => {
    const leido = { legible: true, periodo: "2026-08", basico: 1_545_278.25, antiguedadAnios: 12, antiguedad: 185_433.39, viaticos: 384_000, presentismo: null, horasExtra: 145_800, bonoKm: null, neto: 1_700_000 };
    const cliente = { messages: { parse: async () => ({ stop_reason: "end_turn", parsed_output: leido }) } } as unknown as Anthropic;
    const d = await leerReciboConIA(cliente, { mime: "application/pdf", base64: "AA" });
    const c = camposDelRecibo(d!);
    expect(c).toMatchObject({ lectura: "leido", basico: 1_545_278.25, antiguedadAnios: 12, extras: 145_800, neto: 1_700_000 });
    expect(c).not.toHaveProperty("presentismo");
    expect(c).not.toHaveProperty("bonoKm");
  });
  it("ilegible no toca los montos", () => {
    expect(camposDelRecibo({ legible: false, periodo: "", basico: 1, antiguedadAnios: null, antiguedad: null, viaticos: null, presentismo: null, horasExtra: null, bonoKm: null, neto: 5 })).toEqual({ lectura: "ilegible" });
  });
});
