import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MODELO_POR_DEFECTO } from "./clasificar-ia";

/**
 * Lectura del recibo de sueldo con Claude (PDF o foto del papel): saca los conceptos que usa
 * la estimación de "Tu plata este mes". Lo que no figura en el recibo vuelve como null: no se inventa.
 */
export const DatosRecibo = z.object({
  legible: z.boolean().describe("false si el recibo no se puede leer o no es un recibo de sueldo"),
  periodo: z.string().describe("Mes liquidado, formato AAAA-MM"),
  basico: z.number().nullable().describe("Sueldo básico en pesos"),
  antiguedadAnios: z.number().int().nullable().describe("Años de antigüedad, si figuran"),
  antiguedad: z.number().nullable().describe("Monto del adicional por antigüedad"),
  viaticos: z.number().nullable().describe("Total de viáticos del mes"),
  presentismo: z.number().nullable(),
  horasExtra: z.number().nullable().describe("Monto total pagado por horas extra"),
  bonoKm: z.number().nullable().describe("Monto de un bono o premio por kilómetro, si existe"),
  neto: z.number().nullable().describe("Neto a cobrar"),
});
export type DatosRecibo = z.infer<typeof DatosRecibo>;

export const INSTRUCCIONES_RECIBO = `Leés recibos de sueldo de choferes de colectivo de Argentina (convenio UTA, CCT 460/73).
Devolvé los montos en pesos como números (sin puntos de miles; la coma decimal pasala a punto).
Si un concepto no figura en el recibo, devolvé null. No calcules ni supongas montos que no estén escritos.
Si la imagen no es un recibo de sueldo o no se puede leer, legible = false.`;

type Archivo = { mime: string; base64: string };

export function armarPedidoRecibo(a: Archivo): Anthropic.MessageParam {
  const bloque: Anthropic.ContentBlockParam =
    a.mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } }
      : { type: "image", source: { type: "base64", media_type: a.mime as "image/jpeg", data: a.base64 } };
  return { role: "user", content: [bloque, { type: "text", text: "Leé este recibo de sueldo." }] };
}

export async function leerReciboConIA(cliente: Anthropic, a: Archivo, modelo = MODELO_POR_DEFECTO): Promise<DatosRecibo | null> {
  const r = await cliente.messages.parse({
    model: modelo,
    max_tokens: 600,
    system: INSTRUCCIONES_RECIBO,
    messages: [armarPedidoRecibo(a)],
    output_config: { format: zodOutputFormat(DatosRecibo) },
  });
  if (r.stop_reason === "refusal" || !r.parsed_output) return null;
  return r.parsed_output;
}

/** Pasa lo leído a los campos del recibo (solo lo que vino con valor). */
export function camposDelRecibo(d: DatosRecibo): Record<string, number | string> {
  const c: Record<string, number | string> = { lectura: d.legible ? "leido" : "ilegible" };
  if (!d.legible) return c;
  const poner = (k: string, v: number | null) => {
    if (v !== null && Number.isFinite(v) && v >= 0) c[k] = v;
  };
  poner("basico", d.basico);
  poner("antiguedadAnios", d.antiguedadAnios);
  poner("antiguedad", d.antiguedad);
  poner("viaticos", d.viaticos);
  poner("presentismo", d.presentismo);
  poner("extras", d.horasExtra);
  poner("bonoKm", d.bonoKm);
  if (d.neto !== null && d.neto > 0) c.neto = d.neto;
  return c;
}
