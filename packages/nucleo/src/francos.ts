import { z } from "zod";
import type { Planilla } from "./personal";

/**
 * Bolsa de francos (pedido del dueño, 30/09/2026): un calendario donde el chofer ofrece o pide un franco a sus compañeros.
 * Cuando otro chofer lo toma, queda «acordado» entre los dos y la gerencia lo aprueba; al aprobarse se intercambian
 * las planillas de esos días (el que trabajaba pasa a franco y al revés).
 *
 * - «ofrezco»: tengo franco el día F y lo doy; lo toma alguien que ese día trabaja (yo hago su turno, él descansa).
 * - «pido»: trabajo el día F y quiero franco; lo toma alguien que ese día tiene franco (él hace mi turno).
 * - «a cambio de» (opcional): un segundo día donde se devuelve al revés.
 */
const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");

export const TipoFranco = z.enum(["ofrezco", "pido"]);
export type TipoFranco = z.infer<typeof TipoFranco>;
export const EstadoFranco = z.enum(["publicado", "acordado", "aprobado", "rechazado", "cancelado"]);
export type EstadoFranco = z.infer<typeof EstadoFranco>;

export const PublicacionFranco = z.object({
  id: z.string().min(1),
  lineaId: z.string().min(1),
  tipo: TipoFranco,
  choferId: z.string().min(1),
  choferNombre: z.string().min(1),
  fecha: Fecha,
  aCambioDe: Fecha.optional(),
  detalle: z.string().max(300).default(""),
  estado: EstadoFranco,
  contraparteId: z.string().optional(),
  contraparteNombre: z.string().optional(),
  respuesta: z.string().max(300).optional(),
  creadoEn: z.number().int().nonnegative(),
  actualizadoEn: z.number().int().nonnegative().optional(),
});
export type PublicacionFranco = z.infer<typeof PublicacionFranco>;

export const NOMBRE_ESTADO_FRANCO: Record<EstadoFranco, string> = {
  publicado: "Publicado",
  acordado: "Acordado: espera a la gerencia",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

export type AccionFranco = "tomar" | "soltar" | "aprobar" | "rechazar" | "cancelar";
type Actor = { uid: string; rol: "chofer" | "trafico" | "taller" | "personal" | "admin" | "delegado" };
const esGerencia = (a: Actor) => a.rol === "trafico" || a.rol === "personal" || a.rol === "admin";
const ABIERTOS: EstadoFranco[] = ["publicado", "acordado"];

type DiaPlanilla = Pick<Planilla, "fecha" | "franco">;
/** "franco", "trabaja" o null si tráfico todavía no cargó ese día. */
export function situacionDelDia(planillas: DiaPlanilla[], fecha: string): "franco" | "trabaja" | null {
  const p = planillas.find((x) => x.fecha === fecha);
  return p ? (p.franco ? "franco" : "trabaja") : null;
}

type Resultado = { ok: true } | { ok: false; motivo: string };
const bien: Resultado = { ok: true };
const mal = (motivo: string): Resultado => ({ ok: false, motivo });

/** ¿El chofer puede publicar esto con sus planillas? */
export function puedePublicar(tipo: TipoFranco, fecha: string, aCambioDe: string | undefined, misPlanillas: DiaPlanilla[], hoy: string): Resultado {
  if (fecha <= hoy) return mal("Elegí un día que todavía no pasó");
  if (aCambioDe !== undefined) {
    if (aCambioDe <= hoy) return mal("El día de devolución ya pasó");
    if (aCambioDe === fecha) return mal("La devolución tiene que ser otro día");
  }
  const dia = situacionDelDia(misPlanillas, fecha);
  if (dia === null) return mal("Tráfico todavía no cargó tu planilla de ese día");
  if (tipo === "ofrezco" && dia !== "franco") return mal("Ese día no tenés franco para ofrecer");
  if (tipo === "pido" && dia !== "trabaja") return mal("Ese día ya tenés franco");
  if (aCambioDe !== undefined) {
    const vuelta = situacionDelDia(misPlanillas, aCambioDe);
    if (vuelta === null) return mal("Tráfico todavía no cargó tu planilla del día de devolución");
    // En la devolución es al revés: si ofrezco mi franco, a cambio quiero franco un día que trabajo, y viceversa.
    if (tipo === "ofrezco" && vuelta !== "trabaja") return mal("A cambio tenés que pedir un día en que trabajás");
    if (tipo === "pido" && vuelta !== "franco") return mal("Para devolverlo elegí un día en que tenés franco");
  }
  return bien;
}

/** ¿El compañero puede tomarlo con sus planillas? Es lo inverso de quien lo publicó. */
export function puedeTomar(pub: Pick<PublicacionFranco, "tipo" | "fecha" | "aCambioDe" | "choferId" | "estado">, uid: string, misPlanillas: DiaPlanilla[]): Resultado {
  if (pub.choferId === uid) return mal("Es tuyo");
  if (pub.estado !== "publicado") return mal("Ya lo tomó otro compañero");
  const dia = situacionDelDia(misPlanillas, pub.fecha);
  if (dia === null) return mal("Tráfico todavía no cargó tu planilla de ese día");
  if (pub.tipo === "ofrezco" && dia !== "trabaja") return mal("Ese día ya tenés franco");
  if (pub.tipo === "pido" && dia !== "franco") return mal("Ese día trabajás: no tenés franco para darle");
  if (pub.aCambioDe) {
    const vuelta = situacionDelDia(misPlanillas, pub.aCambioDe);
    if (vuelta === null) return mal("Tráfico todavía no cargó tu planilla del día de devolución");
    if (pub.tipo === "ofrezco" && vuelta !== "franco") return mal("El día de devolución no tenés franco para darle");
    if (pub.tipo === "pido" && vuelta !== "trabaja") return mal("El día de devolución ya tenés franco");
  }
  return bien;
}

/** Quién puede hacer qué. Las reglas de Firestore repiten lo esencial; esta función es la fuente de verdad. */
export function transicionFranco(p: Pick<PublicacionFranco, "choferId" | "estado" | "contraparteId">, a: Actor, accion: AccionFranco): { ok: true; estado: EstadoFranco } | { ok: false; motivo: string } {
  const no = (motivo: string) => ({ ok: false as const, motivo });
  switch (accion) {
    case "tomar":
      if (a.rol !== "chofer") return no("Lo toma un chofer");
      if (p.choferId === a.uid) return no("No podés tomar lo tuyo");
      if (p.estado !== "publicado") return no("Ya lo tomó otro compañero");
      return { ok: true, estado: "acordado" };
    case "soltar":
      if (p.estado !== "acordado" || p.contraparteId !== a.uid) return no("No lo tomaste vos");
      return { ok: true, estado: "publicado" };
    case "aprobar":
      if (!esGerencia(a)) return no("Aprueba la gerencia");
      if (p.estado !== "acordado") return no("Primero lo tiene que tomar un compañero");
      return { ok: true, estado: "aprobado" };
    case "rechazar":
      if (!esGerencia(a)) return no("Rechaza la gerencia");
      if (!ABIERTOS.includes(p.estado)) return no("Ya fue respondido");
      return { ok: true, estado: "rechazado" };
    case "cancelar":
      if (p.choferId !== a.uid) return no("Solo lo cancela quien lo publicó");
      if (!ABIERTOS.includes(p.estado)) return no("Ya fue respondido");
      return { ok: true, estado: "cancelado" };
  }
}

/** Los días en que se intercambian las planillas al aprobarse. */
export function diasDelCambio(p: Pick<PublicacionFranco, "fecha" | "aCambioDe">): string[] {
  return p.aCambioDe ? [p.fecha, p.aCambioDe] : [p.fecha];
}

/** Texto corto para el calendario y el panel. */
export function resumenFranco(p: Pick<PublicacionFranco, "tipo" | "choferNombre" | "fecha" | "aCambioDe">, fechaLinda: (f: string) => string = (f) => f): string {
  const base = p.tipo === "ofrezco" ? `${p.choferNombre} ofrece su franco del ${fechaLinda(p.fecha)}` : `${p.choferNombre} pide franco el ${fechaLinda(p.fecha)}`;
  return p.aCambioDe ? `${base}, a cambio del ${fechaLinda(p.aCambioDe)}` : base;
}

export type DiaCalendario = { fecha: string; delMes: boolean; mio: "franco" | "trabaja" | null; ofrecen: number; piden: number };

/** Grilla de un mes (lunes a domingo, semanas completas) con lo mío y lo publicado cada día. */
export function calendarioDelMes(mes: string, publicaciones: Pick<PublicacionFranco, "fecha" | "tipo" | "estado">[], misPlanillas: DiaPlanilla[]): DiaCalendario[] {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const primero = new Date(Date.UTC(y, m - 1, 1));
  const inicio = new Date(primero);
  inicio.setUTCDate(1 - ((primero.getUTCDay() + 6) % 7)); // lunes anterior
  const ultimo = new Date(Date.UTC(y, m, 0));
  const fin = new Date(ultimo);
  fin.setUTCDate(ultimo.getUTCDate() + ((7 - ultimo.getUTCDay()) % 7)); // domingo siguiente
  const dias: DiaCalendario[] = [];
  for (const d = new Date(inicio); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    const fecha = d.toISOString().slice(0, 10);
    const delDia = publicaciones.filter((p) => p.fecha === fecha && p.estado === "publicado");
    dias.push({
      fecha,
      delMes: fecha.startsWith(mes),
      mio: situacionDelDia(misPlanillas, fecha),
      ofrecen: delDia.filter((p) => p.tipo === "ofrezco").length,
      piden: delDia.filter((p) => p.tipo === "pido").length,
    });
  }
  return dias;
}
