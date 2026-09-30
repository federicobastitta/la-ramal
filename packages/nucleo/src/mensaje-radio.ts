import { z } from "zod";

/**
 * Mensajes de la terminal por la radio (pedido del dueño, 30/09/2026): la terminal escribe un mensaje y en el celular
 * del chofer suena un «ding», la radio baja y una voz lo lee en voz alta. Así el chofer se entera sin mirar la pantalla.
 * «para» es "todos" (toda la flota) o el coche (ej. "Interno 23").
 */
export const MensajeRadio = z.object({
  id: z.string().min(1),
  lineaId: z.string().min(1),
  texto: z.string().trim().min(1).max(280),
  para: z.string().min(1).max(40).default("todos"),
  autor: z.string().max(80).default(""),
  creadoEn: z.number().int().nonnegative(),
});
export type MensajeRadio = z.infer<typeof MensajeRadio>;

/** Un mensaje viejo no se lee: si el chofer abre la app horas después, no le cae una catarata de mensajes. */
export const VENTANA_MENSAJE_RADIO_MS = 15 * 60_000;

const normal = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function esParaMi(m: Pick<MensajeRadio, "para">, cocheId: string): boolean {
  return m.para === "todos" || (!!cocheId && normal(m.para) === normal(cocheId));
}

/** Los que hay que leer ahora, del más viejo al más nuevo: para este coche, recientes y todavía no leídos. */
export function mensajesParaLeer(ms: MensajeRadio[], cocheId: string, yaLeidos: ReadonlySet<string>, ahora: number): MensajeRadio[] {
  return ms
    .filter((m) => esParaMi(m, cocheId) && !yaLeidos.has(m.id) && ahora - m.creadoEn <= VENTANA_MENSAJE_RADIO_MS && m.creadoEn <= ahora + 60_000)
    .sort((a, b) => a.creadoEn - b.creadoEn);
}

/** Lo que dice la voz. Si va a un coche solo, lo nombra, así el chofer sabe que es para él. */
export function textoParaLeer(m: Pick<MensajeRadio, "texto" | "para">): string {
  const texto = m.texto.trim().replace(/\s+/g, " ");
  const cierre = /[.!?¡¿]$/.test(texto) ? "" : ".";
  return `${m.para === "todos" ? "Mensaje de la terminal" : `Mensaje de la terminal para el ${m.para}`}. ${texto}${cierre}`;
}
