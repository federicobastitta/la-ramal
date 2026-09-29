import type { AlertaPanico, EstadoReporte, NuevoReporte, Reporte, Ubicacion } from "@la-ramal/nucleo";

export type Rol = "chofer" | "trafico" | "taller" | "personal" | "admin";

export type Sesion = {
  uid: string;
  nombre: string;
  rol: Rol;
  lineaId: string;
  lineaNombre: string;
  cocheId: string;
};

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
}
