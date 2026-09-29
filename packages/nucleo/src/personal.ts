import { z } from "zod";

/**
 * Papeles y personal: planillas, recibos, certificados, pedidos y comunicados.
 * Todo vive en lineas/{lineaId}/{coleccion}/{id}.
 */

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
const Hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:MM");

// ---------------------------------------------------------------------------------------------
// Planilla de horarios: la carga tráfico; el chofer ve la de hoy y las pasadas.
// ---------------------------------------------------------------------------------------------
export const Vuelta = z.object({ sale: Hora, llega: Hora });
export const Planilla = z.object({
  id: z.string().min(1),
  lineaId: z.string().min(1),
  choferId: z.string().min(1),
  choferNombre: z.string().min(1),
  fecha: Fecha,
  cocheId: z.string().min(1),
  cabecera: z.string().min(1),
  ramal: z.string().max(40).default(""),
  vueltas: z.array(Vuelta).min(1).max(20),
  franco: z.boolean().default(false),
  publicadaEn: z.number().int().nonnegative(),
});
export type Planilla = z.infer<typeof Planilla>;

export const aMinutos = (h: string) => {
  const [hh, mm] = h.split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
};

/** Minutos de una vuelta; si llega después de medianoche, cruza el día. */
export function duracionVueltaMin(v: { sale: string; llega: string }): number {
  const d = aMinutos(v.llega) - aMinutos(v.sale);
  return d >= 0 ? d : d + 24 * 60;
}

/** Tiempo total del turno: de la primera salida a la última llegada. */
export function duracionTurnoMin(p: Pick<Planilla, "vueltas">): number {
  const primera = p.vueltas[0];
  const ultima = p.vueltas.at(-1);
  if (!primera || !ultima) return 0;
  return duracionVueltaMin({ sale: primera.sale, llega: ultima.llega });
}

/** Descanso real entre vueltas (lo que queda en la terminal entre llegar y volver a salir). */
export function descansosMin(p: Pick<Planilla, "vueltas">): number[] {
  const r: number[] = [];
  for (let i = 1; i < p.vueltas.length; i++) r.push(duracionVueltaMin({ sale: p.vueltas[i - 1]!.llega, llega: p.vueltas[i]!.sale }));
  return r;
}

/** Horas del período (para comparar con el recibo). Los francos no suman. */
export function horasDelPeriodo(planillas: Pick<Planilla, "vueltas" | "franco">[]): number {
  const min = planillas.filter((p) => !p.franco).reduce((s, p) => s + duracionTurnoMin(p), 0);
  return Math.round((min / 60) * 10) / 10;
}

/** Horas por encima de la jornada, sumadas día por día. */
export function horasExtra(planillas: Pick<Planilla, "vueltas" | "franco">[], jornadaHoras = 8): number {
  const min = planillas.filter((p) => !p.franco).reduce((s, p) => s + Math.max(0, duracionTurnoMin(p) - jornadaHoras * 60), 0);
  return Math.round((min / 60) * 10) / 10;
}

// ---------------------------------------------------------------------------------------------
// Recibos: los sube personal (PDF). La conformidad del chofer queda atada al hash del archivo:
// si alguien cambia el PDF después, la conformidad ya no corresponde y se ve.
// ---------------------------------------------------------------------------------------------
export const Recibo = z.object({
  id: z.string().min(1),
  lineaId: z.string().min(1),
  choferId: z.string().min(1),
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Período AAAA-MM"),
  neto: z.number().nonnegative(),
  ruta: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  subidoEn: z.number().int().nonnegative(),
  conformidad: z.object({ en: z.number().int(), sha256: z.string() }).optional(),
});
export type Recibo = z.infer<typeof Recibo>;

export async function sha256Hex(datos: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", datos as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function conformidadVigente(r: Recibo): boolean {
  return !!r.conformidad && r.conformidad.sha256 === r.sha256;
}

// ---------------------------------------------------------------------------------------------
// Certificados del chofer: los carga el chofer con foto; personal los valida.
// ---------------------------------------------------------------------------------------------
export const TIPOS_CERTIFICADO = ["licencia_profesional", "psicofisico", "curso_manejo", "libreta_sanitaria", "otro"] as const;
export const NOMBRE_CERTIFICADO: Record<(typeof TIPOS_CERTIFICADO)[number], string> = {
  licencia_profesional: "Licencia profesional",
  psicofisico: "Psicofísico",
  curso_manejo: "Curso de manejo",
  libreta_sanitaria: "Libreta sanitaria",
  otro: "Otro",
};
export const Certificado = z.object({
  id: z.string().min(1),
  lineaId: z.string().min(1),
  choferId: z.string().min(1),
  tipo: z.enum(TIPOS_CERTIFICADO),
  vence: Fecha,
  ruta: z.string().min(1),
  estado: z.enum(["pendiente", "validado", "rechazado"]),
  motivo: z.string().max(200).optional(),
  cargadoEn: z.number().int().nonnegative(),
});
export type Certificado = z.infer<typeof Certificado>;

export type NivelVencimiento = "vencido" | "urgente" | "pronto" | "al_dia";

/** Días que faltan (negativo si ya venció), contando días de calendario en la zona del usuario. */
export function diasParaVencer(vence: string, hoy: string): number {
  const a = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  const b = Date.UTC(+vence.slice(0, 4), +vence.slice(5, 7) - 1, +vence.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function nivelVencimiento(vence: string, hoy: string): NivelVencimiento {
  const d = diasParaVencer(vence, hoy);
  if (d < 0) return "vencido";
  if (d <= 7) return "urgente";
  if (d <= 30) return "pronto";
  return "al_dia";
}

/** Días en que se avisa antes del vencimiento (la función programada manda push esos días). */
export const AVISOS_VENCIMIENTO = [30, 15, 7, 1, 0] as const;
export function tocaAvisar(vence: string, hoy: string): boolean {
  return (AVISOS_VENCIMIENTO as readonly number[]).includes(diasParaVencer(vence, hoy));
}

// ---------------------------------------------------------------------------------------------
// Pedidos del chofer a personal/tráfico, con una máquina de estados por tipo.
// ---------------------------------------------------------------------------------------------
export const TIPOS_PEDIDO = ["certificado_trabajo", "certificado_haberes", "parte_enfermo", "vacaciones", "cambio_turno"] as const;
export type TipoPedido = (typeof TIPOS_PEDIDO)[number];
export const NOMBRE_PEDIDO: Record<TipoPedido, string> = {
  certificado_trabajo: "Certificado de trabajo",
  certificado_haberes: "Certificado de haberes",
  parte_enfermo: "Parte de enfermo",
  vacaciones: "Vacaciones",
  cambio_turno: "Cambio de turno",
};

export const EstadoPedido = z.enum(["pendiente", "ofrecido", "tomado", "aprobado", "rechazado", "entregado", "cancelado"]);
export type EstadoPedido = z.infer<typeof EstadoPedido>;

export const Pedido = z.object({
  id: z.string().min(1),
  lineaId: z.string().min(1),
  choferId: z.string().min(1),
  choferNombre: z.string().min(1),
  tipo: z.enum(TIPOS_PEDIDO),
  detalle: z.string().max(500).default(""),
  desde: Fecha.optional(),
  hasta: Fecha.optional(),
  /** Cambio de turno: el día que se ofrece. */
  fecha: Fecha.optional(),
  tomadoPor: z.string().optional(),
  tomadoPorNombre: z.string().optional(),
  adjuntos: z.array(z.string()).max(4).default([]),
  estado: EstadoPedido,
  respuesta: z.string().max(500).optional(),
  rutaRespuesta: z.string().optional(),
  creadoEn: z.number().int().nonnegative(),
  actualizadoEn: z.number().int().nonnegative().optional(),
});
export type Pedido = z.infer<typeof Pedido>;

export type Actor = { uid: string; rol: "chofer" | "trafico" | "taller" | "personal" | "admin" | "delegado" };
export type AccionPedido = "tomar" | "soltar" | "aprobar" | "rechazar" | "entregar" | "cancelar";

/** Estado inicial según el tipo: el cambio de turno se "ofrece" a los compañeros; el resto va directo a la empresa. */
export function estadoInicial(tipo: TipoPedido): EstadoPedido {
  return tipo === "cambio_turno" ? "ofrecido" : "pendiente";
}

const esEmpresa = (a: Actor) => a.rol === "trafico" || a.rol === "personal" || a.rol === "admin";

/**
 * Quién puede hacer qué. Devuelve el estado nuevo o un motivo de rechazo.
 * Las reglas de Firestore repiten lo esencial; esta función es la fuente de verdad y está probada.
 */
export function transicionPedido(p: Pedido, a: Actor, accion: AccionPedido): { ok: true; estado: EstadoPedido } | { ok: false; motivo: string } {
  const no = (motivo: string) => ({ ok: false as const, motivo });
  const propio = p.choferId === a.uid;
  switch (accion) {
    case "tomar":
      if (p.tipo !== "cambio_turno") return no("Solo se toman cambios de turno");
      if (a.rol !== "chofer") return no("Solo un chofer toma un turno");
      if (propio) return no("No podés tomar tu propio turno");
      if (p.estado !== "ofrecido") return no("Ese turno ya no está ofrecido");
      return { ok: true, estado: "tomado" };
    case "soltar":
      if (p.estado !== "tomado" || p.tomadoPor !== a.uid) return no("No tomaste ese turno");
      return { ok: true, estado: "ofrecido" };
    case "aprobar":
      if (!esEmpresa(a)) return no("Aprueba la empresa");
      if (p.tipo === "cambio_turno" && p.estado !== "tomado") return no("Primero lo tiene que tomar un compañero");
      if (p.tipo !== "cambio_turno" && p.estado !== "pendiente") return no("Ya fue respondido");
      return { ok: true, estado: "aprobado" };
    case "rechazar":
      if (!esEmpresa(a)) return no("Rechaza la empresa");
      if (!["pendiente", "ofrecido", "tomado"].includes(p.estado)) return no("Ya fue respondido");
      return { ok: true, estado: "rechazado" };
    case "entregar":
      if (!esEmpresa(a)) return no("Entrega la empresa");
      if (!(p.tipo === "certificado_trabajo" || p.tipo === "certificado_haberes")) return no("Solo se entregan certificados");
      if (p.estado !== "pendiente" && p.estado !== "aprobado") return no("Ya fue respondido");
      return { ok: true, estado: "entregado" };
    case "cancelar":
      if (!propio) return no("Solo lo cancela quien lo pidió");
      if (!["pendiente", "ofrecido", "tomado"].includes(p.estado)) return no("Ya fue respondido");
      return { ok: true, estado: "cancelado" };
  }
}

/** Al aprobarse un cambio de turno, las planillas de ese día se intercambian (coche, horarios y todo). */
export function intercambiarPlanillas(a: Planilla, b: Planilla): [Planilla, Planilla] {
  if (a.fecha !== b.fecha) throw new Error("Las planillas tienen que ser del mismo día");
  const ahora = Date.now();
  return [
    { ...b, id: a.id, choferId: a.choferId, choferNombre: a.choferNombre, publicadaEn: ahora },
    { ...a, id: b.id, choferId: b.choferId, choferNombre: b.choferNombre, publicadaEn: ahora },
  ];
}

// ---------------------------------------------------------------------------------------------
// Comunicados de la empresa, con "leído" por chofer.
// ---------------------------------------------------------------------------------------------
export const Comunicado = z.object({
  id: z.string().min(1),
  lineaId: z.string().min(1),
  titulo: z.string().min(1).max(120),
  texto: z.string().min(1).max(3000),
  importante: z.boolean().default(false),
  creadoEn: z.number().int().nonnegative(),
  leidos: z.array(z.string()).default([]),
});
export type Comunicado = z.infer<typeof Comunicado>;

/** Planilla cargada como texto (lo que tráfico pega desde su Excel): una línea por vuelta, "05:10-06:52". */
export function leerVueltas(texto: string): { vueltas: { sale: string; llega: string }[]; errores: string[] } {
  const vueltas: { sale: string; llega: string }[] = [];
  const errores: string[] = [];
  texto
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((l, i) => {
      const m = l.match(/^(\d{1,2})[:.](\d{2})\s*(?:-|a|–)\s*(\d{1,2})[:.](\d{2})$/i);
      if (!m) return errores.push(`Renglón ${i + 1}: «${l}» no es HH:MM-HH:MM`);
      const norm = (h: string, mm: string) => `${h.padStart(2, "0")}:${mm}`;
      const v = { sale: norm(m[1]!, m[2]!), llega: norm(m[3]!, m[4]!) };
      if (!Vuelta.safeParse(v).success) return errores.push(`Renglón ${i + 1}: hora inválida`);
      vueltas.push(v);
    });
  return { vueltas, errores };
}
