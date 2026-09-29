import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AREAS, NOMBRE_TIPO, type Clasificacion, type NuevoReporte } from "@la-ramal/nucleo";

/**
 * Segunda lectura del reporte con Claude: lee el texto y mira la foto (si hay) para
 * decidir el área, la urgencia y un resumen de una línea para el tablero.
 *
 * - Modelo por defecto: Haiku (barato y rápido; son miles de reportes por mes). Se cambia con CLAUDE_MODELO.
 * - Salida estructurada con esquema: la respuesta siempre tiene la forma esperada.
 * - La IA nunca baja la urgencia de la regla (lo garantiza unirClasificacion en el núcleo).
 */
export const MODELO_POR_DEFECTO = "claude-haiku-4-5-20251001";

export const RespuestaIA = z.object({
  area: z.enum(AREAS),
  urgencia: z.enum(["baja", "media", "alta"]),
  resumen: z.string().describe("Una línea, máximo 120 caracteres, en castellano rioplatense, para el tablero de tráfico"),
});
export type RespuestaIA = z.infer<typeof RespuestaIA>;

export const INSTRUCCIONES = `Clasificás reportes que mandan choferes de colectivo desde la calle a su línea (empresa de transporte del AMBA).
Áreas: taller (desperfectos del coche), trafico (cortes, embotellamientos, desvíos, otros), siniestros (choques, lesionados, daños a terceros), seguridad (agresiones, robos, amenazas).
Urgencia:
- alta: hay riesgo para personas ahora (heridos, agresor presente, frenos o dirección que fallan, humo o fuego, puertas que no cierran con pasajeros).
- media: afecta el servicio o el coche debería revisarse hoy.
- baja: aviso informativo.
Si hay foto, usala para confirmar o corregir lo que dice el texto. Si no hay datos suficientes, elegí según el tipo que marcó el chofer.
El resumen tiene que servir para que alguien de tráfico entienda qué pasa sin abrir el reporte. No inventes datos que no estén en el texto o la foto.`;

type Imagen = { mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string };

export function armarMensaje(r: NuevoReporte, imagen?: Imagen): Anthropic.MessageParam {
  const partes: Anthropic.ContentBlockParam[] = [];
  if (imagen) partes.push({ type: "image", source: { type: "base64", media_type: imagen.mime, data: imagen.base64 } });
  partes.push({
    type: "text",
    text: [
      `Tipo marcado por el chofer: ${NOMBRE_TIPO[r.tipo]}`,
      `Coche: ${r.cocheId}`,
      `Texto del chofer: ${r.texto.trim() || "(sin texto)"}`,
      `Adjuntos: ${r.adjuntos.map((a) => a.tipo).join(", ") || "ninguno"}`,
    ].join("\n"),
  });
  return { role: "user", content: partes };
}

export async function clasificarConIA(cliente: Anthropic, r: NuevoReporte, imagen?: Imagen, modelo = MODELO_POR_DEFECTO): Promise<Omit<Clasificacion, "origen"> | null> {
  const resp = await cliente.messages.parse({
    model: modelo,
    max_tokens: 400,
    system: INSTRUCCIONES,
    messages: [armarMensaje(r, imagen)],
    output_config: { format: zodOutputFormat(RespuestaIA) },
  });
  if (resp.stop_reason === "refusal" || !resp.parsed_output) return null;
  return resp.parsed_output;
}
