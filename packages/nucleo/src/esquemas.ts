import { z } from "zod";

/** Lo que el chofer puede reportar desde la calle. */
export const TIPOS_REPORTE = ["coche", "embotellamiento", "choque", "agresor", "corte", "otro"] as const;
export const TipoReporte = z.enum(TIPOS_REPORTE);
export type TipoReporte = z.infer<typeof TipoReporte>;

export const NOMBRE_TIPO: Record<TipoReporte, string> = {
  coche: "Desperfecto del coche",
  embotellamiento: "Embotellamiento",
  choque: "Choque",
  agresor: "Agresor",
  corte: "Corte o piquete",
  otro: "Otra cosa",
};

/** Área de la línea que recibe el reporte. */
export const AREAS = ["taller", "trafico", "siniestros", "seguridad"] as const;
export const Area = z.enum(AREAS);
export type Area = z.infer<typeof Area>;

export const Urgencia = z.enum(["baja", "media", "alta"]);
export type Urgencia = z.infer<typeof Urgencia>;

export const Ubicacion = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Radio de error del GPS, en metros. */
  precisionM: z.number().nonnegative(),
  /** Momento de la lectura (ms desde 1970). */
  en: z.number().int().nonnegative(),
});
export type Ubicacion = z.infer<typeof Ubicacion>;

export const MAX_BYTES_ADJUNTO = 50 * 1024 * 1024;
export const Adjunto = z.object({
  tipo: z.enum(["foto", "video", "audio"]),
  /** Ruta en el almacenamiento (Firebase Storage o IndexedDB en modo demo). */
  ruta: z.string().min(1),
  mime: z.string().regex(/^(image|video|audio)\//),
  bytes: z.number().int().positive().max(MAX_BYTES_ADJUNTO),
});
export type Adjunto = z.infer<typeof Adjunto>;

export const EstadoReporte = z.enum(["recibido", "en_taller", "publicado", "caso_tomado", "cerrado"]);
export type EstadoReporte = z.infer<typeof EstadoReporte>;

export const NOMBRE_ESTADO: Record<EstadoReporte, string> = {
  recibido: "Recibido",
  en_taller: "En el taller",
  publicado: "Publicado a la flota",
  caso_tomado: "Caso tomado",
  cerrado: "Cerrado",
};

export const Clasificacion = z.object({
  area: Area,
  urgencia: Urgencia,
  /** Una línea para el tablero de la línea. */
  resumen: z.string().max(140),
  origen: z.enum(["reglas", "ia"]),
});
export type Clasificacion = z.infer<typeof Clasificacion>;

/** El reporte tal como lo manda el celular. El id lo genera el celular (UUID) y sirve de clave de idempotencia. */
export const NuevoReporte = z.object({
  id: z.uuid(),
  lineaId: z.string().min(1),
  cocheId: z.string().min(1),
  choferId: z.string().min(1),
  tipo: TipoReporte,
  texto: z.string().trim().max(1000),
  ubicacion: Ubicacion,
  creadoEn: z.number().int().nonnegative(),
  adjuntos: z.array(Adjunto).max(6),
});
export type NuevoReporte = z.infer<typeof NuevoReporte>;

export const Reporte = NuevoReporte.extend({
  estado: EstadoReporte,
  clasificacion: Clasificacion.optional(),
  actualizadoEn: z.number().int().nonnegative().optional(),
});
export type Reporte = z.infer<typeof Reporte>;

export const EstadoAlerta = z.enum(["activa", "confirmada", "cerrada"]);
export type EstadoAlerta = z.infer<typeof EstadoAlerta>;

export const AlertaPanico = z.object({
  id: z.uuid(),
  lineaId: z.string().min(1),
  cocheId: z.string().min(1),
  choferId: z.string().min(1),
  estado: EstadoAlerta,
  desde: z.number().int().nonnegative(),
  /** Últimas posiciones, la más nueva al final. Se sigue mandando hasta cerrar el caso. */
  ubicaciones: z.array(Ubicacion).max(500),
  origen: z.enum(["boton_bluetooth", "pantalla", "prueba"]),
  /** Lo marca el servidor si se "canceló" con el PIN de coacción. El celular nunca lo ve. */
  coaccion: z.boolean().optional(),
});
export type AlertaPanico = z.infer<typeof AlertaPanico>;
