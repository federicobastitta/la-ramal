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
