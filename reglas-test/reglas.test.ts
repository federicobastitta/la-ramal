import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";

let env: RulesTestEnvironment;
const L = "linea-22";
const ubicacion = { lat: -34.72, lng: -58.25, precisionM: 10, en: 1 };
const reporte = (id: string, choferId: string, extra: Record<string, unknown> = {}) => ({
  id, lineaId: L, cocheId: "Interno 23", choferId, tipo: "coche", texto: "ruido en el freno", ubicacion, creadoEn: 1, adjuntos: [], estado: "recibido", ...extra,
});
const alerta = (id: string, choferId: string, extra: Record<string, unknown> = {}) => ({
  id, lineaId: L, cocheId: "Interno 23", choferId, estado: "activa", desde: 1, ubicaciones: [ubicacion], origen: "pantalla", ...extra,
});

const chofer = (uid = "chofer1", linea = L) => env.authenticatedContext(uid, { rol: "chofer", linea }).firestore();
const trafico = () => env.authenticatedContext("trafico1", { rol: "trafico", linea: L }).firestore();
const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-la-ramal", firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

describe("reportes", () => {
  it("el chofer crea su reporte", async () => {
    await assertSucceeds(setDoc(doc(chofer(), `lineas/${L}/reportes/${R1}`), reporte(R1, "chofer1")));
  });
  it("no puede crear a nombre de otro chofer", async () => {
    await assertFails(setDoc(doc(chofer(), `lineas/${L}/reportes/${R1}`), reporte(R1, "otro")));
  });
  it("no puede mandar la clasificación (la pone el servidor)", async () => {
    await assertFails(setDoc(doc(chofer(), `lineas/${L}/reportes/${R1}`), reporte(R1, "chofer1", { clasificacion: { area: "taller", urgencia: "baja" } })));
  });
  it("no puede crear en otra línea", async () => {
    await assertFails(setDoc(doc(chofer("chofer1", "linea-159"), `lineas/${L}/reportes/${R1}`), reporte(R1, "chofer1")));
  });
  it("no puede reescribir un reporte que ya mandó", async () => {
    await setDoc(doc(chofer(), `lineas/${L}/reportes/${R1}`), reporte(R1, "chofer1"));
    await assertFails(setDoc(doc(chofer(), `lineas/${L}/reportes/${R1}`), reporte(R1, "chofer1", { texto: "otra cosa" })));
  });
  it("el chofer no cambia el estado; tráfico sí, pero solo el estado", async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), `lineas/${L}/reportes/${R1}`), reporte(R1, "chofer1")));
    await assertFails(updateDoc(doc(chofer(), `lineas/${L}/reportes/${R1}`), { estado: "cerrado" }));
    await assertSucceeds(updateDoc(doc(trafico(), `lineas/${L}/reportes/${R1}`), { estado: "en_taller" }));
    await assertFails(updateDoc(doc(trafico(), `lineas/${L}/reportes/${R1}`), { texto: "cambiado" }));
    await assertFails(deleteDoc(doc(trafico(), `lineas/${L}/reportes/${R1}`)));
  });
  it("el chofer ve sus reportes y los cortes de otros, pero no los desperfectos de otros", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), `lineas/${L}/reportes/${R1}`), reporte(R1, "otro"));
      await setDoc(doc(c.firestore(), `lineas/${L}/reportes/${R2}`), reporte(R2, "otro", { tipo: "corte" }));
    });
    await assertFails(getDoc(doc(chofer(), `lineas/${L}/reportes/${R1}`)));
    await assertSucceeds(getDoc(doc(chofer(), `lineas/${L}/reportes/${R2}`)));
    await assertSucceeds(getDocs(query(collection(chofer(), `lineas/${L}/reportes`), where("tipo", "in", ["corte", "embotellamiento", "choque"]))));
    await assertFails(getDocs(collection(chofer(), `lineas/${L}/reportes`)));
  });
});

describe("pánico", () => {
  it("el chofer dispara y suma posiciones, pero no la cierra", async () => {
    const d = doc(chofer(), `lineas/${L}/panicos/${R1}`);
    await assertSucceeds(setDoc(d, alerta(R1, "chofer1")));
    await assertSucceeds(updateDoc(d, { ubicaciones: [ubicacion, ubicacion] }));
    await assertFails(updateDoc(d, { estado: "cerrada" }));
  });
  it("no puede marcarse coacción al crearla", async () => {
    await assertFails(setDoc(doc(chofer(), `lineas/${L}/panicos/${R1}`), alerta(R1, "chofer1", { coaccion: false })));
  });
  it("tráfico confirma; no puede cerrarla", async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), `lineas/${L}/panicos/${R1}`), alerta(R1, "chofer1")));
    await assertFails(updateDoc(doc(trafico(), `lineas/${L}/panicos/${R1}`), { estado: "cerrada" }));
    await assertSucceeds(updateDoc(doc(trafico(), `lineas/${L}/panicos/${R1}`), { estado: "confirmada", confirmadaEn: 2 }));
  });
  it("con coacción, el chofer ya no la puede leer (y la empresa sí)", async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), `lineas/${L}/panicos/${R1}`), alerta(R1, "chofer1", { coaccion: true })));
    await assertFails(getDoc(doc(chofer(), `lineas/${L}/panicos/${R1}`)));
    await assertSucceeds(getDoc(doc(trafico(), `lineas/${L}/panicos/${R1}`)));
  });
});

describe("privacidad", () => {
  it("nadie lee los PIN", async () => {
    await assertFails(getDoc(doc(chofer(), `lineas/${L}/privado/chofer1`)));
    await assertFails(getDoc(doc(env.authenticatedContext("a", { rol: "admin", linea: L }).firestore(), `lineas/${L}/privado/chofer1`)));
  });
  it("la empresa no lee el canal del gremio; el chofer sí", async () => {
    await assertFails(getDoc(doc(trafico(), `lineas/${L}/gremio/aviso1`)));
    await assertSucceeds(getDoc(doc(chofer(), `lineas/${L}/gremio/aviso1`)));
  });
  it("sin sesión no se lee nada", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `lineas/${L}`)));
  });
});

describe("etapa 2: papeles y personal", () => {
  const personal = () => env.authenticatedContext("personal1", { rol: "personal", linea: L }).firestore();
  const taller = () => env.authenticatedContext("taller1", { rol: "taller", linea: L }).firestore();
  const beto = () => chofer("chofer2");
  const H = "a".repeat(64);
  const pedido = (extra: Record<string, unknown> = {}) => ({ id: "ped1", lineaId: L, choferId: "chofer1", choferNombre: "Ana", tipo: "cambio_turno", detalle: "", adjuntos: [], estado: "ofrecido", creadoEn: 1, fecha: "2026-10-04", ...extra });
  const semilla = (ruta: string, datos: Record<string, unknown>) => env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), ruta), datos));

  it("planillas: el chofer ve la suya, no la de otro, y no puede editarla", async () => {
    await semilla(`lineas/${L}/planillas/p1`, { id: "p1", lineaId: L, choferId: "chofer1" });
    await semilla(`lineas/${L}/planillas/p2`, { id: "p2", lineaId: L, choferId: "chofer2" });
    await assertSucceeds(getDoc(doc(chofer(), `lineas/${L}/planillas/p1`)));
    await assertFails(getDoc(doc(chofer(), `lineas/${L}/planillas/p2`)));
    await assertFails(updateDoc(doc(chofer(), `lineas/${L}/planillas/p1`), { cocheId: "Interno 1" }));
    await assertSucceeds(updateDoc(doc(trafico(), `lineas/${L}/planillas/p1`), { cocheId: "Interno 1" }));
  });

  it("recibos: el chofer da conformidad solo con el hash del PDF; el taller no ve sueldos", async () => {
    await semilla(`lineas/${L}/recibos/r1`, { id: "r1", lineaId: L, choferId: "chofer1", sha256: H, neto: 1 });
    await assertFails(getDoc(doc(taller(), `lineas/${L}/recibos/r1`)));
    await assertFails(getDoc(doc(trafico(), `lineas/${L}/recibos/r1`)));
    await assertFails(updateDoc(doc(chofer(), `lineas/${L}/recibos/r1`), { conformidad: { en: 1, sha256: "b".repeat(64) } }));
    await assertFails(updateDoc(doc(chofer(), `lineas/${L}/recibos/r1`), { neto: 999 }));
    await assertSucceeds(updateDoc(doc(chofer(), `lineas/${L}/recibos/r1`), { conformidad: { en: 1, sha256: H } }));
    await assertFails(updateDoc(doc(personal(), `lineas/${L}/recibos/r1`), { conformidad: null }));
  });

  it("certificados: el chofer carga pendiente; no se autovalida", async () => {
    const c = { id: "c1", lineaId: L, choferId: "chofer1", tipo: "psicofisico", vence: "2027-01-01", ruta: "x", estado: "pendiente", cargadoEn: 1 };
    await assertFails(setDoc(doc(chofer(), `lineas/${L}/certificados/c1`), { ...c, estado: "validado" }));
    await assertSucceeds(setDoc(doc(chofer(), `lineas/${L}/certificados/c1`), c));
    await assertFails(updateDoc(doc(chofer(), `lineas/${L}/certificados/c1`), { estado: "validado" }));
    await assertSucceeds(updateDoc(doc(personal(), `lineas/${L}/certificados/c1`), { estado: "validado" }));
  });

  it("cambio de turno: se ofrece, lo toma otro, tráfico aprueba solo si está tomado", async () => {
    await assertSucceeds(setDoc(doc(chofer(), `lineas/${L}/pedidos/ped1`), pedido()));
    await assertFails(updateDoc(doc(trafico(), `lineas/${L}/pedidos/ped1`), { estado: "aprobado" }));
    await assertFails(updateDoc(doc(chofer(), `lineas/${L}/pedidos/ped1`), { estado: "tomado", tomadoPor: "chofer1" }));
    await assertSucceeds(getDocs(query(collection(beto(), `lineas/${L}/pedidos`), where("tipo", "==", "cambio_turno"), where("estado", "==", "ofrecido"))));
    await assertFails(updateDoc(doc(beto(), `lineas/${L}/pedidos/ped1`), { estado: "tomado", tomadoPor: "otro" }));
    await assertSucceeds(updateDoc(doc(beto(), `lineas/${L}/pedidos/ped1`), { estado: "tomado", tomadoPor: "chofer2", tomadoPorNombre: "Beto" }));
    await assertFails(updateDoc(doc(beto(), `lineas/${L}/pedidos/ped1`), { estado: "aprobado" }));
    await assertSucceeds(updateDoc(doc(trafico(), `lineas/${L}/pedidos/ped1`), { estado: "aprobado", actualizadoEn: 2 }));
  });

  it("parte de enfermo: nace pendiente, no aprobado; el taller no lo ve", async () => {
    await assertFails(setDoc(doc(chofer(), `lineas/${L}/pedidos/ped2`), pedido({ id: "ped2", tipo: "parte_enfermo", estado: "aprobado" })));
    await assertSucceeds(setDoc(doc(chofer(), `lineas/${L}/pedidos/ped2`), pedido({ id: "ped2", tipo: "parte_enfermo", estado: "pendiente" })));
    await assertFails(getDoc(doc(taller(), `lineas/${L}/pedidos/ped2`)));
    await assertFails(getDoc(doc(beto(), `lineas/${L}/pedidos/ped2`)));
  });

  it("avisos: el chofer solo se marca como leído a sí mismo", async () => {
    await semilla(`lineas/${L}/comunicados/a1`, { id: "a1", lineaId: L, titulo: "t", texto: "x", leidos: ["chofer2"] });
    await assertFails(updateDoc(doc(chofer(), `lineas/${L}/comunicados/a1`), { leidos: ["chofer2", "otro"] }));
    await assertFails(updateDoc(doc(chofer(), `lineas/${L}/comunicados/a1`), { leidos: ["chofer1"] }));
    await assertFails(updateDoc(doc(chofer(), `lineas/${L}/comunicados/a1`), { titulo: "cambiado" }));
    await assertSucceeds(updateDoc(doc(chofer(), `lineas/${L}/comunicados/a1`), { leidos: ["chofer2", "chofer1"] }));
  });

  it("mensajes por la radio: los manda tráfico, los oye toda la línea y no se tocan", async () => {
    const msj = (x: Record<string, unknown> = {}) => ({ id: "m1", lineaId: L, texto: "Desvío por Mitre", para: "todos", autor: "Tráfico", creadoEn: 1, ...x });
    await assertFails(setDoc(doc(chofer(), `lineas/${L}/mensajesRadio/m1`), msj()));
    await assertFails(setDoc(doc(trafico(), `lineas/${L}/mensajesRadio/m1`), msj({ texto: "a".repeat(281) })));
    await assertFails(setDoc(doc(trafico(), `lineas/${L}/mensajesRadio/m1`), msj({ lineaId: "otra" })));
    await assertSucceeds(setDoc(doc(trafico(), `lineas/${L}/mensajesRadio/m1`), msj()));
    await assertSucceeds(getDoc(doc(chofer(), `lineas/${L}/mensajesRadio/m1`)));
    await assertFails(getDoc(doc(chofer("x", "otra-linea"), `lineas/${L}/mensajesRadio/m1`)));
    await assertFails(updateDoc(doc(trafico(), `lineas/${L}/mensajesRadio/m1`), { texto: "otro" }));
    await assertFails(deleteDoc(doc(trafico(), `lineas/${L}/mensajesRadio/m1`)));
  });

  it("jornadas: cada chofer escribe solo la suya", async () => {
    const j = { id: "chofer1-2026-09-29", lineaId: L, choferId: "chofer1", fecha: "2026-09-29", ramal: "A", vueltas: [], km: 0, actualizadaEn: 1, ejemplo: false };
    await assertSucceeds(setDoc(doc(chofer(), `lineas/${L}/jornadas/${j.id}`), j));
    await assertFails(setDoc(doc(beto(), `lineas/${L}/jornadas/${j.id}`), { ...j, choferId: "chofer2" }));
    await assertFails(setDoc(doc(beto(), `lineas/${L}/jornadas/chofer1-2026-09-30`), { ...j, id: "chofer1-2026-09-30", choferId: "chofer2" }));
    await assertFails(getDoc(doc(beto(), `lineas/${L}/jornadas/${j.id}`)));
    await assertSucceeds(getDoc(doc(trafico(), `lineas/${L}/jornadas/${j.id}`)));
  });
});

describe("recibos propios y escala", () => {
  const personal = () => env.authenticatedContext("personal1", { rol: "personal", linea: L }).firestore();
  const delegado = () => env.authenticatedContext("del1", { rol: "delegado", linea: L }).firestore();
  const propio = { id: "chofer1-2026-08-propio", lineaId: L, choferId: "chofer1", periodo: "2026-08", neto: 0, ruta: "x", sha256: "a".repeat(64), mime: "image/jpeg", origen: "chofer", lectura: "pendiente", subidoEn: 1 };
  it("el chofer sube la foto de su recibo, sin poner montos", async () => {
    await assertSucceeds(setDoc(doc(chofer(), `lineas/${L}/recibos/${propio.id}`), propio));
    await assertFails(setDoc(doc(chofer(), `lineas/${L}/recibos/otro`), { ...propio, id: "otro", basico: 99 }));
    await assertFails(setDoc(doc(chofer(), `lineas/${L}/recibos/otro2`), { ...propio, id: "otro2", origen: "personal" }));
    await assertFails(setDoc(doc(chofer(), `lineas/${L}/recibos/otro3`), { ...propio, id: "otro3", choferId: "chofer2" }));
  });
  it("la escala la ve toda la línea y la cargan personal o el delegado", async () => {
    await assertSucceeds(setDoc(doc(delegado(), `lineas/${L}/escalas/vigente`), { id: "vigente", basico: 1 }));
    await assertSucceeds(getDoc(doc(chofer(), `lineas/${L}/escalas/vigente`)));
    await assertFails(setDoc(doc(chofer(), `lineas/${L}/escalas/vigente`), { id: "vigente", basico: 2 }));
    await assertFails(setDoc(doc(trafico(), `lineas/${L}/escalas/vigente`), { id: "vigente", basico: 2 }));
    await assertSucceeds(setDoc(doc(personal(), `lineas/${L}/escalas/vigente`), { id: "vigente", basico: 3 }));
  });
});
