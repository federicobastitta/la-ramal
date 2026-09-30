import { diasDelCambio, hashearPin, intercambiarPlanillas, transicionFranco, transicionPedido, verificarPin, type AccionFranco, type AccionPedido, type PublicacionFranco, type AlertaPanico, type Comunicado, type EstadoReporte, type HashPin, type Jornada, type NuevoReporte, type Pedido, type Planilla, type Reporte, type Ubicacion } from "@la-ramal/nucleo";
import { clasificarPorReglas } from "@la-ramal/nucleo";
import { abrir, idb } from "./idb";
import type { ArchivoLocal, Colecciones, Filtro, Fuente, NombreColeccion, Persona, Sesion } from "./fuente";
import { CHOFERES_DEMO, sembrarDemo, sembrarRecorridoDemo } from "./semilla-demo";

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
  private escuchar_(fn: () => void): () => void {
    this.oyentes.add(fn);
    fn();
    return () => this.oyentes.delete(fn);
  }

  private semilla: Promise<void> | null = null;

  async sesion() {
    this.semilla ??= sembrarDemo().then(sembrarRecorridoDemo).then(() => this.avisar());
    await this.semilla;
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
    return this.escuchar_(() => {
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
    return this.escuchar_(() => {
      void idb.todos<AlertaPanico>("panicos").then((as) => cb(as.filter((a) => a.lineaId === lineaId && a.estado !== "cerrada")));
    });
  }

  escucharMiPanico(_lineaId: string, id: string, cb: (a: AlertaPanico | null) => void) {
    return this.escuchar_(() => {
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

  // ---- Etapa 2 ----
  async personas(): Promise<Persona[]> {
    return [...CHOFERES_DEMO.map((c) => ({ uid: c.uid, nombre: c.nombre, rol: "chofer" as const })), { uid: "demo-trafico", nombre: "Tráfico (ejemplo)", rol: "trafico" }];
  }

  private async todos<K extends NombreColeccion>(col: K): Promise<Colecciones[K][]> {
    const prefijo = `${col}/`;
    const db = await abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction("docs", "readonly");
      const pedido = t.objectStore("docs").getAll(IDBKeyRange.bound(prefijo, prefijo + "\uffff"));
      pedido.onsuccess = () => ok(pedido.result as Colecciones[K][]);
      pedido.onerror = () => mal(pedido.error);
    });
  }

  escuchar<K extends NombreColeccion>(lineaId: string, col: K, filtros: Filtro[], cb: (xs: Colecciones[K][]) => void) {
    return this.escuchar_(() => {
      void this.todos(col).then((xs) =>
        cb(xs.filter((x) => (x as { lineaId: string }).lineaId === lineaId && filtros.every((f) => ("desde" in f ? Number((x as Record<string, unknown>)[f.campo]) >= f.desde : (x as Record<string, unknown>)[f.campo] === f.igual)))),
      );
    });
  }

  async crear<K extends NombreColeccion>(_lineaId: string, col: K, doc: Colecciones[K]) {
    const clave = `${col}/${(doc as { id: string }).id}`;
    if (await idb.leer("docs", clave)) return;
    await idb.poner("docs", clave, doc);
    this.avisar();
  }

  async actualizar<K extends NombreColeccion>(_lineaId: string, col: K, id: string, cambios: Partial<Colecciones[K]>) {
    const clave = `${col}/${id}`;
    const actual = await idb.leer<Colecciones[K]>("docs", clave);
    if (!actual) return;
    await idb.poner("docs", clave, { ...actual, ...cambios });
    this.avisar();
  }

  async subirArchivo(ruta: string, blob: Blob) {
    await idb.poner("archivos", ruta, blob);
  }

  async accionPedido(lineaId: string, p: Pedido, quien: Sesion, accion: AccionPedido, extra: { respuesta?: string; rutaRespuesta?: string } = {}) {
    const t = transicionPedido(p, { uid: quien.uid, rol: quien.rol }, accion);
    if (!t.ok) throw new Error(t.motivo);
    const cambios: Partial<Pedido> = { estado: t.estado, actualizadoEn: Date.now(), ...extra };
    if (accion === "tomar") Object.assign(cambios, { tomadoPor: quien.uid, tomadoPorNombre: quien.nombre });
    if (accion === "soltar") Object.assign(cambios, { tomadoPor: undefined, tomadoPorNombre: undefined });
    // En Firebase esto lo hace la función alAprobarCambioDeTurno; en la demo, acá mismo.
    if (accion === "aprobar" && p.tipo === "cambio_turno" && p.fecha && p.tomadoPor) {
      const a = await idb.leer<Planilla>("docs", `planillas/${p.choferId}-${p.fecha}`);
      const b = await idb.leer<Planilla>("docs", `planillas/${p.tomadoPor}-${p.fecha}`);
      if (a && b) {
        const [na, nb] = intercambiarPlanillas(a, b);
        await idb.poner("docs", `planillas/${na.id}`, na);
        await idb.poner("docs", `planillas/${nb.id}`, nb);
      }
    }
    await this.actualizar(lineaId, "pedidos", p.id, cambios);
  }

  async accionFranco(lineaId: string, p: PublicacionFranco, quien: Sesion, accion: AccionFranco, respuesta?: string) {
    const actual = (await idb.leer<PublicacionFranco>("docs", `francos/${p.id}`)) ?? p;
    const t = transicionFranco(actual, { uid: quien.uid, rol: quien.rol }, accion);
    if (!t.ok) throw new Error(t.motivo);
    const cambios: Partial<PublicacionFranco> = { estado: t.estado, actualizadoEn: Date.now(), ...(respuesta ? { respuesta } : {}) };
    if (accion === "tomar") Object.assign(cambios, { contraparteId: quien.uid, contraparteNombre: quien.nombre });
    if (accion === "soltar") Object.assign(cambios, { contraparteId: undefined, contraparteNombre: undefined });
    // En Firebase esto lo hace la función alAprobarFranco; en la demo, acá mismo.
    if (accion === "aprobar" && actual.contraparteId) {
      const faltan: string[] = [];
      for (const fecha of diasDelCambio(actual)) {
        const a = await idb.leer<Planilla>("docs", `planillas/${actual.choferId}-${fecha}`);
        const b = await idb.leer<Planilla>("docs", `planillas/${actual.contraparteId}-${fecha}`);
        if (!a || !b) {
          faltan.push(fecha);
          continue;
        }
        const [na, nb] = intercambiarPlanillas(a, b);
        await idb.poner("docs", `planillas/${na.id}`, na);
        await idb.poner("docs", `planillas/${nb.id}`, nb);
      }
      if (faltan.length) cambios.respuesta = `Aprobado, pero falta una planilla del ${faltan.join(" y ")}: tráfico la tiene que cargar a mano.`;
    }
    await this.actualizar(lineaId, "francos", p.id, cambios);
  }

  async guardarJornada(j: Jornada) {
    await idb.poner("docs", `jornadas/${j.id}`, j);
    this.avisar();
  }

  async marcarLeido(_lineaId: string, id: string, uid: string) {
    const c = await idb.leer<Comunicado>("docs", `comunicados/${id}`);
    if (!c || c.leidos.includes(uid)) return;
    await idb.poner("docs", `comunicados/${id}`, { ...c, leidos: [...c.leidos, uid] });
    this.avisar();
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
