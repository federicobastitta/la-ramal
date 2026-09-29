import type { AccionPedido, AlertaPanico, Certificado, Comunicado, ConfigRecorrido, Escala, EstadoReporte, Jornada, NuevoReporte, Pedido, Planilla, Recibo, Reporte, Ubicacion } from "@la-ramal/nucleo";

export type Rol = "chofer" | "trafico" | "taller" | "personal" | "admin" | "delegado";

export type Sesion = {
  uid: string;
  nombre: string;
  rol: Rol;
  lineaId: string;
  lineaNombre: string;
  cocheId: string;
};

/** Colecciones de papeles y personal (etapa 2). */
export type Colecciones = { planillas: Planilla; recibos: Recibo; certificados: Certificado; pedidos: Pedido; comunicados: Comunicado; jornadas: Jornada; configuracion: ConfigRecorrido; escalas: Escala };
export type NombreColeccion = keyof Colecciones;
/** Filtro de igualdad (lo único que necesitan las pantallas y lo que las reglas pueden comprobar). */
export type Filtro = { campo: string; igual: string | boolean };
export type Persona = { uid: string; nombre: string; rol: Rol };

/** Archivo adjunto todavía en el celular, antes de subirlo. */
export type ArchivoLocal = { ruta: string; blob: Blob };

/**
 * Todo lo que la app necesita del servidor. Hay dos implementaciones:
 * - demo: IndexedDB + BroadcastChannel (anda sin servidor; el panel en otra pestaña ve los reportes al instante);
 * - firebase: Firestore + Storage + Functions.
 */
export interface Fuente {
  readonly modo: "demo" | "firebase";
  sesion(): Promise<Sesion | null>;

  /** Idempotente: mandar dos veces el mismo id no duplica el reporte. */
  enviarReporte(r: NuevoReporte, archivos: ArchivoLocal[]): Promise<void>;
  escucharReportes(lineaId: string, cb: (rs: Reporte[]) => void): () => void;
  cambiarEstadoReporte(lineaId: string, id: string, estado: EstadoReporte): Promise<void>;
  urlAdjunto(ruta: string): Promise<string | null>;

  dispararPanico(a: AlertaPanico): Promise<void>;
  sumarUbicacionPanico(lineaId: string, id: string, u: Ubicacion): Promise<void>;
  /** Alertas abiertas de la línea (panel). */
  escucharPanicos(lineaId: string, cb: (as: AlertaPanico[]) => void): () => void;
  /** La alerta propia del chofer. null = cerrada o ya no visible para el chofer. */
  escucharMiPanico(lineaId: string, id: string, cb: (a: AlertaPanico | null) => void): () => void;
  confirmarPanico(lineaId: string, id: string): Promise<void>;
  /** Lo verifica el servidor. Con el PIN de coacción responde "cerrada" igual, pero la alerta sigue en la terminal. */
  cancelarPanico(lineaId: string, id: string, pin: string): Promise<"cerrada" | "pin_incorrecto">;

  // ---- Etapa 2: papeles y personal ----
  personas(lineaId: string): Promise<Persona[]>;
  escuchar<K extends NombreColeccion>(lineaId: string, col: K, filtros: Filtro[], cb: (xs: Colecciones[K][]) => void): () => void;
  crear<K extends NombreColeccion>(lineaId: string, col: K, doc: Colecciones[K]): Promise<void>;
  actualizar<K extends NombreColeccion>(lineaId: string, col: K, id: string, cambios: Partial<Colecciones[K]>): Promise<void>;
  subirArchivo(ruta: string, blob: Blob): Promise<void>;
  /** Aplica una acción sobre un pedido (tomar, aprobar, entregar…). Valida con transicionPedido del núcleo. */
  accionPedido(lineaId: string, p: Pedido, quien: Sesion, accion: AccionPedido, extra?: { respuesta?: string; rutaRespuesta?: string }): Promise<void>;
  marcarLeido(lineaId: string, comunicadoId: string, uid: string): Promise<void>;
  /** Crea o reemplaza el resumen del día que midió el GPS. */
  guardarJornada(j: Jornada): Promise<void>;
}
