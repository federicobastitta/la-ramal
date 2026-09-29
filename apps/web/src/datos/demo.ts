import { hashearPin, verificarPin, type AlertaPanico, type EstadoReporte, type HashPin, type NuevoReporte, type Reporte, type Ubicacion } from "@la-ramal/nucleo";
import { clasificarPorReglas } from "@la-ramal/nucleo";
import { idb } from "./idb";
import type { ArchivoLocal, Fuente, Sesion } from "./fuente";

/**
 * Modo demo: hace de "servidor" dentro del navegador.
 * Los datos quedan en IndexedDB y un BroadcastChannel avisa a las otras pestañas,
 * así la app del chofer y el panel de la línea (abiertos en dos pestañas) se ven en vivo.
 */
const CANAL = "la-ramal-demo";

// PIN de la demo: 7391 cierra la alerta; 7392 es el de coacción. Con pocas iteraciones: es solo demo.
const PINES: Promise<{ normal: HashPin; coaccion: HashPin }> = Promise.all([hashearPin("7391", undefined, 5_000), hashearPin("7392", undefined, 5_000)]).then(
  ([normal, coaccion]) => ({ normal, coaccion }),
);

export class FuenteDemo implements Fuente {
  readonly modo = "demo" as const;
  private readonly canal = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CANAL) : null;
  private readonly oyentes = new Set<() => void>();

  constructor(private readonly quien: Sesion) {
    this.canal?.addEventListener("message", () => this.avisarLocal());
  }

  private avisarLocal() {
    for (const o of this.oyentes) o();
  }
  private avisar() {
    this.canal?.postMessage("cambio");
    this.avisarLocal();
  }
  private escuchar(fn: () => void): () => void {
    this.oyentes.add(fn);
    fn();
    return () => this.oyentes.delete(fn);
  }

  async sesion() {
    return this.quien;
  }

  async enviarReporte(r: NuevoReporte, archivos: ArchivoLocal[]) {
    if (await idb.leer("reportes", r.id)) return; // ya estaba: idempotente
    for (const a of archivos) await idb.poner("archivos", a.ruta, a.blob);
    const guardado: Reporte = { ...r, estado: "recibido", clasificacion: clasificarPorReglas(r) };
    await idb.poner("reportes", r.id, guardado);
    this.avisar();
  }

  escucharReportes(lineaId: string, cb: (rs: Reporte[]) => void) {
    return this.escuchar(() => {
      void idb.todos<Reporte>("reportes").then((rs) => cb(rs.filter((r) => r.lineaId === lineaId).sort((a, b) => b.creadoEn - a.creadoEn)));
    });
  }

  async cambiarEstadoReporte(_lineaId: string, id: string, estado: EstadoReporte) {
    const r = await idb.leer<Reporte>("reportes", id);
    if (!r) return;
    await idb.poner("reportes", id, { ...r, estado, actualizadoEn: Date.now() });
    this.avisar();
  }

  async urlAdjunto(ruta: string) {
    const b = await idb.leer<Blob>("archivos", ruta);
    return b ? URL.createObjectURL(b) : null;
  }

  async dispararPanico(a: AlertaPanico) {
    if (await idb.leer("panicos", a.id)) return;
    await idb.poner("panicos", a.id, a);
    this.avisar();
  }

  async sumarUbicacionPanico(_lineaId: string, id: string, u: Ubicacion) {
    const a = await idb.leer<AlertaPanico>("panicos", id);
    if (!a || a.estado === "cerrada") return;
    await idb.poner("panicos", id, { ...a, ubicaciones: [...a.ubicaciones, u].slice(-500) });
    this.avisar();
  }

  escucharPanicos(lineaId: string, cb: (as: AlertaPanico[]) => void) {
    return this.escuchar(() => {
      void idb.todos<AlertaPanico>("panicos").then((as) => cb(as.filter((a) => a.lineaId === lineaId && a.estado !== "cerrada")));
    });
  }

  escucharMiPanico(_lineaId: string, id: string, cb: (a: AlertaPanico | null) => void) {
    return this.escuchar(() => {
      void idb.leer<AlertaPanico>("panicos", id).then((a) => cb(a && a.estado !== "cerrada" && !a.coaccion ? a : null));
    });
  }

  async confirmarPanico(_lineaId: string, id: string) {
    const a = await idb.leer<AlertaPanico>("panicos", id);
    if (!a || a.estado !== "activa") return;
    await idb.poner("panicos", id, { ...a, estado: "confirmada" });
    this.avisar();
  }

  async cancelarPanico(_lineaId: string, id: string, pin: string): Promise<"cerrada" | "pin_incorrecto"> {
    const a = await idb.leer<AlertaPanico>("panicos", id);
    if (!a) return "cerrada";
    const { normal, coaccion } = await PINES;
    const r = await verificarPin(pin, normal, coaccion);
    if (r === "invalido") return "pin_incorrecto";
    if (r === "coaccion") {
      // Al chofer se le dice que se cerró; la terminal la sigue viendo, marcada.
      await idb.poner("panicos", id, { ...a, coaccion: true });
    } else {
      await idb.poner("panicos", id, { ...a, estado: "cerrada" });
    }
    this.avisar();
    return "cerrada";
  }
}

export const SESION_DEMO_CHOFER: Sesion = {
  uid: "demo-chofer-medina",
  nombre: "Carlos Medina",
  rol: "chofer",
  lineaId: "linea-22",
  lineaNombre: "Línea 22 (ejemplo)",
  cocheId: "Interno 23",
};

export const SESION_DEMO_TRAFICO: Sesion = { ...SESION_DEMO_CHOFER, uid: "demo-trafico", nombre: "Tráfico (ejemplo)", rol: "trafico", cocheId: "" };

/** Solo demo: si el navegador no da el GPS (por ejemplo dentro de un marco), se usa este punto de Quilmes. */
export const UBICACION_DEMO = { lat: -34.7206, lng: -58.2546, precisionM: 25 };
