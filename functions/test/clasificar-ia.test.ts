import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { armarMensaje, clasificarConIA } from "../src/clasificar-ia";
import type { NuevoReporte } from "@la-ramal/nucleo";

const r: NuevoReporte = {
  id: "7f0c9a4e-1c2b-4f5e-9a1d-2b3c4d5e6f70",
  lineaId: "linea-22",
  cocheId: "Interno 23",
  choferId: "u1",
  tipo: "coche",
  texto: "sale humo del motor",
  ubicacion: { lat: -34.72, lng: -58.25, precisionM: 10, en: 1 },
  creadoEn: 1,
  adjuntos: [],
};

function clienteFalso(respuesta: unknown) {
  const pedidos: unknown[] = [];
  const cliente = { messages: { parse: async (p: unknown) => (pedidos.push(p), respuesta) } } as unknown as Anthropic;
  return { cliente, pedidos };
}

describe("clasificación con IA", () => {
  it("manda la foto antes del texto", () => {
    const m = armarMensaje(r, { mime: "image/jpeg", base64: "AAAA" });
    const partes = m.content as { type: string }[];
    expect(partes.map((p) => p.type)).toEqual(["image", "text"]);
  });

  it("usa Haiku por defecto con salida estructurada", async () => {
    const { cliente, pedidos } = clienteFalso({ stop_reason: "end_turn", parsed_output: { area: "taller", urgencia: "alta", resumen: "Humo del motor" } });
    const res = await clasificarConIA(cliente, r);
    expect(res).toEqual({ area: "taller", urgencia: "alta", resumen: "Humo del motor" });
    const p = pedidos[0] as { model: string; output_config: { format: unknown } };
    expect(p.model).toMatch(/haiku/);
    expect(p.output_config.format).toBeTruthy();
  });

  it("si Claude se niega, devuelve null y queda la regla", async () => {
    const { cliente } = clienteFalso({ stop_reason: "refusal", parsed_output: null });
    expect(await clasificarConIA(cliente, r)).toBeNull();
  });
});
