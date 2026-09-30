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

/** Tope de lo que lee la voz de un aviso de la empresa: el resto queda escrito en Papeles. */
export const LARGO_AVISO_HABLADO = 350;

/**
 * Lo que dice la voz cuando la empresa publica un aviso (dueño, 30/09: «el aviso se tiene que escuchar»).
 * Un aviso largo se corta al final de una oración y se avisa que el resto está en Papeles.
 */
export function textoDeAvisoParaLeer(c: { titulo: string; texto: string; importante?: boolean }): string {
  const limpio = (s: string) => s.trim().replace(/\s+/g, " ");
  const punto = (s: string) => (/[.!?¡¿]$/.test(s) ? s : `${s}.`);
  const titulo = punto(limpio(c.titulo));
  let texto = limpio(c.texto);
  let recortado = false;
  if (texto.length > LARGO_AVISO_HABLADO) {
    const corte = texto.slice(0, LARGO_AVISO_HABLADO);
    const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("! "), corte.lastIndexOf("? "));
    texto = fin > 80 ? corte.slice(0, fin + 1) : `${corte.slice(0, corte.lastIndexOf(" "))}…`;
    recortado = true;
  }
  return `${c.importante ? "Aviso importante de la empresa" : "Aviso de la empresa"}. ${titulo} ${punto(texto)}${recortado ? " El aviso completo está en Papeles." : ""}`;
}
