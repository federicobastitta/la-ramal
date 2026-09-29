import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  deleteField,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  limit,
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { AlertaPanico, Certificado, Comunicado, ConfigRecorrido, Jornada, Pedido, Planilla, Recibo, Reporte, transicionPedido, type AccionPedido, type EstadoReporte, type NuevoReporte, type Ubicacion } from "@la-ramal/nucleo";
import { ErrorPermanente } from "@la-ramal/nucleo";
import type { ArchivoLocal, Colecciones, Filtro, Fuente, NombreColeccion, Persona, Rol, Sesion } from "./fuente";
import type { ZodType } from "zod";

const ESQUEMAS: { [K in NombreColeccion]: ZodType<Colecciones[K]> } = { planillas: Planilla, recibos: Recibo, certificados: Certificado, pedidos: Pedido, comunicados: Comunicado, jornadas: Jornada, configuracion: ConfigRecorrido } as never;

/**
 * Fuente real: Firestore (con caché local persistente, así la app abre y muestra datos sin señal),
 * Storage para fotos/videos/audios y Functions para lo que el celular no puede decidir solo (cancelar pánico).
 *
 * Estructura:
 *   lineas/{lineaId}/reportes/{reporteId}
 *   lineas/{lineaId}/panicos/{alertaId}
 *   adjuntos: lineas/{lineaId}/reportes/{uid}/{reporteId}/{n}
 * El rol y la línea vienen en los "custom claims" del usuario (los pone la función altaDeChofer).
 */
export class FuenteFirebase implements Fuente {
  readonly modo = "firebase" as const;
  private readonly app;
  private readonly db;
  private readonly auth;
  private readonly storage;
  private readonly functions;
  private rol: Rol | null = null;

  constructor(config: FirebaseOptions) {
    this.app = initializeApp(config);
    try {
      this.db = initializeFirestore(this.app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch {
      this.db = getFirestore(this.app);
    }
    this.auth = getAuth(this.app);
    this.storage = getStorage(this.app);
    this.functions = getFunctions(this.app, "southamerica-east1");
  }

  get autenticacion() {
    return this.auth;
  }

  private usuario(): Promise<User | null> {
    return new Promise((ok) => {
      const fin = onAuthStateChanged(this.auth, (u) => {
        fin();
        ok(u);
      });
    });
  }

  async sesion(): Promise<Sesion | null> {
    const u = await this.usuario();
    if (!u) return null;
    const { claims } = await u.getIdTokenResult();
    const rol = claims.rol as Rol | undefined;
    const lineaId = claims.linea as string | undefined;
    if (!rol || !lineaId) return null; // sin alta en la línea: no ve nada
    this.rol = rol;
    const perfil = await getDoc(doc(this.db, "lineas", lineaId, "personas", u.uid));
    const p = perfil.data() ?? {};
    return { uid: u.uid, rol, lineaId, nombre: String(p.nombre ?? u.phoneNumber ?? ""), lineaNombre: String(p.lineaNombre ?? lineaId), cocheId: String(p.cocheHoy ?? "") };
  }

  async enviarReporte(r: NuevoReporte, archivos: ArchivoLocal[]) {
    const destino = doc(this.db, "lineas", r.lineaId, "reportes", r.id);
    // Primero los adjuntos (la ruta ya va en el reporte), después el documento.
    for (const a of archivos) await uploadBytes(ref(this.storage, a.ruta), a.blob, { contentType: a.blob.type });
    try {
      await setDoc(destino, { ...r, estado: "recibido", recibidoEn: serverTimestamp() });
    } catch (err) {
      // Las reglas no dejan al chofer reescribir un reporte: si ya existe, el reintento ya había llegado.
      if ((err as { code?: string }).code === "permission-denied") {
        const ya = await getDoc(destino).catch(() => null);
        if (ya?.exists()) return;
        throw new ErrorPermanente("La línea rechazó el reporte (permiso denegado)");
      }
      throw err;
    }
  }

  escucharReportes(lineaId: string, cb: (rs: Reporte[]) => void) {
    const col = collection(this.db, "lineas", lineaId, "reportes");
    const leer = (docs: { data(): unknown }[]) => docs.map((d) => Reporte.safeParse(d.data())).flatMap((p) => (p.success ? [p.data] : []));
    if (this.rol !== "chofer") {
      return onSnapshot(query(col, orderBy("creadoEn", "desc"), limit(200)), (snap) => cb(leer(snap.docs)));
    }
    // Las reglas solo dejan al chofer ver sus reportes y los cortes/choques de la línea: son dos consultas que se unen.
    const uid = this.auth.currentUser?.uid ?? "";
    let mios: Reporte[] = [];
    let calle: Reporte[] = [];
    const unir = () => {
      const m = new Map<string, Reporte>();
      for (const r of [...mios, ...calle]) m.set(r.id, r);
      cb([...m.values()].sort((a, b) => b.creadoEn - a.creadoEn));
    };
    const a = onSnapshot(query(col, where("choferId", "==", uid), orderBy("creadoEn", "desc"), limit(50)), (s) => ((mios = leer(s.docs)), unir()));
    const b = onSnapshot(query(col, where("tipo", "in", ["corte", "embotellamiento", "choque", "calle"]), where("creadoEn", ">", Date.now() - 3 * 3_600_000), orderBy("creadoEn", "desc"), limit(100)), (s) => ((calle = leer(s.docs)), unir()));
    return () => (a(), b());
  }

  async cambiarEstadoReporte(lineaId: string, id: string, estado: EstadoReporte) {
    await updateDoc(doc(this.db, "lineas", lineaId, "reportes", id), { estado, actualizadoEn: Date.now() });
  }

  async urlAdjunto(ruta: string) {
    return getDownloadURL(ref(this.storage, ruta)).catch(() => null);
  }

  async dispararPanico(a: AlertaPanico) {
    const d = doc(this.db, "lineas", a.lineaId, "panicos", a.id);
    try {
      await setDoc(d, a);
    } catch (err) {
      if ((err as { code?: string }).code === "permission-denied" && (await getDoc(d).catch(() => null))?.exists()) return;
      throw err;
    }
  }

  async sumarUbicacionPanico(lineaId: string, id: string, u: Ubicacion) {
    await updateDoc(doc(this.db, "lineas", lineaId, "panicos", id), { ubicaciones: arrayUnion(u) });
  }

  escucharPanicos(lineaId: string, cb: (as: AlertaPanico[]) => void) {
    const q = query(collection(this.db, "lineas", lineaId, "panicos"), where("estado", "in", ["activa", "confirmada"]));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => AlertaPanico.safeParse(d.data())).flatMap((p) => (p.success ? [p.data] : []))));
  }

  escucharMiPanico(lineaId: string, id: string, cb: (a: AlertaPanico | null) => void) {
    // Si la alerta se "canceló" con el PIN de coacción, las reglas le niegan la lectura al chofer: se ve como cerrada.
    return onSnapshot(
      doc(this.db, "lineas", lineaId, "panicos", id),
      (d) => {
        const a = AlertaPanico.safeParse(d.data());
        cb(a.success && a.data.estado !== "cerrada" ? a.data : null);
      },
      () => cb(null),
    );
  }

  async confirmarPanico(lineaId: string, id: string) {
    await updateDoc(doc(this.db, "lineas", lineaId, "panicos", id), { estado: "confirmada", confirmadaEn: Date.now() });
  }

  async cancelarPanico(lineaId: string, id: string, pin: string) {
    const cancelar = httpsCallable<{ lineaId: string; id: string; pin: string }, { resultado: "cerrada" | "pin_incorrecto" }>(this.functions, "cancelarPanico");
    return (await cancelar({ lineaId, id, pin })).data.resultado;
  }

  // ---- Etapa 2 ----
  async personas(lineaId: string): Promise<Persona[]> {
    const snap = await getDocs(collection(this.db, "lineas", lineaId, "personas"));
    return snap.docs.map((d) => ({ uid: d.id, nombre: String(d.get("nombre") ?? ""), rol: d.get("rol") as Rol }));
  }

  escuchar<K extends NombreColeccion>(lineaId: string, col: K, filtros: Filtro[], cb: (xs: Colecciones[K][]) => void) {
    const q = query(collection(this.db, "lineas", lineaId, col), ...filtros.map((f) => where(f.campo, "==", f.igual)), limit(300));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ESQUEMAS[col].safeParse(d.data())).flatMap((p) => (p.success ? [p.data] : []))));
  }

  async crear<K extends NombreColeccion>(lineaId: string, col: K, d: Colecciones[K]) {
    await setDoc(doc(this.db, "lineas", lineaId, col, (d as { id: string }).id), d as Record<string, unknown>);
  }

  async guardarJornada(j: Jornada) {
    await setDoc(doc(this.db, "lineas", j.lineaId, "jornadas", j.id), j);
  }

  async actualizar<K extends NombreColeccion>(lineaId: string, col: K, id: string, cambios: Partial<Colecciones[K]>) {
    await updateDoc(doc(this.db, "lineas", lineaId, col, id), cambios as Record<string, unknown>);
  }

  async subirArchivo(ruta: string, blob: Blob) {
    await uploadBytes(ref(this.storage, ruta), blob, { contentType: blob.type });
  }

  async accionPedido(lineaId: string, p: Pedido, quien: Sesion, accion: AccionPedido, extra: { respuesta?: string; rutaRespuesta?: string } = {}) {
    const t = transicionPedido(p, { uid: quien.uid, rol: quien.rol }, accion);
    if (!t.ok) throw new Error(t.motivo);
    const cambios: Record<string, unknown> = { estado: t.estado, actualizadoEn: Date.now(), ...extra };
    if (accion === "tomar") Object.assign(cambios, { tomadoPor: quien.uid, tomadoPorNombre: quien.nombre });
    if (accion === "soltar") Object.assign(cambios, { tomadoPor: deleteField(), tomadoPorNombre: deleteField() });
    // El intercambio de planillas al aprobar un cambio de turno lo hace la función alAprobarCambioDeTurno.
    await updateDoc(doc(this.db, "lineas", lineaId, "pedidos", p.id), cambios);
  }

  async marcarLeido(lineaId: string, id: string, uid: string) {
    await updateDoc(doc(this.db, "lineas", lineaId, "comunicados", id), { leidos: arrayUnion(uid) });
  }
}
