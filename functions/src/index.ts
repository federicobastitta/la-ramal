import Anthropic from "@anthropic-ai/sdk";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { z } from "zod";
import { AlertaPanico, Certificado, NOMBRE_CERTIFICADO, NuevoReporte, Pedido, Planilla, clasificarPorReglas, diasParaVencer, hashearPin, intercambiarPlanillas, pinValido, tocaAvisar, unirClasificacion, verificarPin, type HashPin } from "@la-ramal/nucleo";
import { MODELO_POR_DEFECTO, clasificarConIA } from "./clasificar-ia";

initializeApp();
setGlobalOptions({ region: "southamerica-east1", maxInstances: 20 });

const CLAVE_ANTHROPIC = defineSecret("ANTHROPIC_API_KEY");
const MODELO = defineString("CLAUDE_MODELO", { default: MODELO_POR_DEFECTO });

const db = () => getFirestore();
const MAX_BYTES_IMAGEN_IA = 4 * 1024 * 1024;
const MAX_INTENTOS_PIN = 5;
const VENTANA_PIN_MS = 10 * 60_000;

/** Temas de notificación: cada área de cada línea tiene el suyo (la terminal se suscribe al de tráfico). */
const tema = (lineaId: string, area: string) => `linea-${lineaId}-${area}`.replace(/[^a-zA-Z0-9-_.~%]/g, "_");

async function auditar(lineaId: string, que: string, datos: Record<string, unknown>) {
  await db().collection("lineas").doc(lineaId).collection("auditoria").add({ que, ...datos, en: FieldValue.serverTimestamp() });
}

// ---------------------------------------------------------------------------------------------
// Reporte nuevo: clasificación por reglas en el acto, aviso si es urgente, y después la lectura con IA.
// ---------------------------------------------------------------------------------------------
export const alLlegarReporte = onDocumentCreated({ document: "lineas/{lineaId}/reportes/{id}", secrets: [CLAVE_ANTHROPIC], timeoutSeconds: 60 }, async (ev) => {
  const snap = ev.data;
  if (!snap) return;
  const r = NuevoReporte.safeParse(snap.data());
  if (!r.success) {
    logger.warn("Reporte con forma inválida", { id: ev.params.id, error: r.error.message });
    await snap.ref.update({ estado: "cerrado", invalido: r.error.issues.map((i) => i.message).slice(0, 5) });
    return;
  }
  const regla = clasificarPorReglas(r.data);
  await snap.ref.update({ clasificacion: regla });
  if (regla.urgencia === "alta") {
    await getMessaging().send({
      topic: tema(r.data.lineaId, regla.area),
      notification: { title: `URGENTE · ${r.data.cocheId}`, body: regla.resumen },
      android: { priority: "high" },
      data: { reporte: r.data.id },
    });
  }

  const clave = CLAVE_ANTHROPIC.value();
  if (!clave) return;
  try {
    const foto = r.data.adjuntos.find((a) => a.tipo === "foto" && a.bytes <= MAX_BYTES_IMAGEN_IA && /^image\/(jpeg|png|webp|gif)$/.test(a.mime));
    const imagen = foto
      ? { mime: foto.mime as "image/jpeg", base64: (await getStorage().bucket().file(foto.ruta).download())[0].toString("base64") }
      : undefined;
    const ia = await clasificarConIA(new Anthropic({ apiKey: clave }), r.data, imagen, MODELO.value());
    if (!ia) return;
    const final = unirClasificacion(regla, ia);
    await snap.ref.update({ clasificacion: final });
    // Si la IA descubrió algo urgente que la regla no vio, avisa ahora.
    if (final.urgencia === "alta" && regla.urgencia !== "alta") {
      await getMessaging().send({ topic: tema(r.data.lineaId, final.area), notification: { title: `URGENTE · ${r.data.cocheId}`, body: final.resumen }, android: { priority: "high" } });
    }
  } catch (err) {
    // La IA es una mejora: si falla, el reporte ya está clasificado por reglas.
    logger.error("Falló la clasificación con IA", { id: r.data.id, err: String(err) });
  }
});

// ---------------------------------------------------------------------------------------------
// Pánico: aviso de máxima prioridad a tráfico y seguridad, y registro de auditoría.
// ---------------------------------------------------------------------------------------------
export const alDispararPanico = onDocumentCreated({ document: "lineas/{lineaId}/panicos/{id}" }, async (ev) => {
  const a = AlertaPanico.safeParse(ev.data?.data());
  if (!a.success) return;
  const u = a.data.ubicaciones.at(-1);
  const cuerpo = u ? `Ubicación ±${u.precisionM} m: https://www.google.com/maps?q=${u.lat},${u.lng}` : "Sin ubicación todavía";
  await Promise.all(
    ["trafico", "seguridad"].map((area) =>
      getMessaging().send({
        topic: tema(a.data.lineaId, area),
        notification: { title: `PÁNICO · ${a.data.cocheId}`, body: cuerpo },
        android: { priority: "high", notification: { channelId: "panico", sound: "default" } },
        data: { panico: a.data.id },
      }),
    ),
  );
  await auditar(a.data.lineaId, "panico_disparado", { alerta: a.data.id, chofer: a.data.choferId, coche: a.data.cocheId, origen: a.data.origen });
});

// ---------------------------------------------------------------------------------------------
// Cancelar pánico: el PIN se verifica acá, nunca en el celular. Con el PIN de coacción responde
// igual que con el normal, pero la alerta sigue activa y marcada para la terminal.
// ---------------------------------------------------------------------------------------------
const PedidoCancelar = z.object({ lineaId: z.string().min(1), id: z.uuid(), pin: z.string().max(12) });

export const cancelarPanico = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Hay que iniciar sesión");
  const p = PedidoCancelar.safeParse(req.data);
  if (!p.success) throw new HttpsError("invalid-argument", "Pedido inválido");
  const { lineaId, id, pin } = p.data;
  if (req.auth?.token.linea !== lineaId) throw new HttpsError("permission-denied", "No es tu línea");

  const refAlerta = db().collection("lineas").doc(lineaId).collection("panicos").doc(id);
  const refPrivado = db().collection("lineas").doc(lineaId).collection("privado").doc(uid);

  return db().runTransaction(async (tx) => {
    const [alerta, privado] = await Promise.all([tx.get(refAlerta), tx.get(refPrivado)]);
    if (!alerta.exists || alerta.get("choferId") !== uid) throw new HttpsError("not-found", "No existe esa alerta");
    if (alerta.get("estado") === "cerrada") return { resultado: "cerrada" as const };
    const pines = privado.data() as { pinNormal?: HashPin; pinCoaccion?: HashPin; fallos?: number[] } | undefined;
    if (!pines?.pinNormal) throw new HttpsError("failed-precondition", "Todavía no definiste tu PIN");

    // Freno a la fuerza bruta: 5 intentos fallidos en 10 minutos bloquean la cancelación.
    const ahora = Date.now();
    const fallos = (pines.fallos ?? []).filter((t) => ahora - t < VENTANA_PIN_MS);
    if (fallos.length >= MAX_INTENTOS_PIN) {
      await auditar(lineaId, "pin_bloqueado", { alerta: id, chofer: uid });
      return { resultado: "pin_incorrecto" as const };
    }

    const r = await verificarPin(pin, pines.pinNormal, pines.pinCoaccion);
    if (r === "invalido") {
      tx.update(refPrivado, { fallos: [...fallos, ahora] });
      return { resultado: "pin_incorrecto" as const };
    }
    if (r === "coaccion") {
      tx.update(refAlerta, { coaccion: true, coaccionEn: ahora });
      tx.set(db().collection("lineas").doc(lineaId).collection("auditoria").doc(), { que: "panico_coaccion", alerta: id, chofer: uid, en: FieldValue.serverTimestamp() });
    } else {
      tx.update(refAlerta, { estado: "cerrada", cerradaEn: ahora, cerradaPor: uid });
      tx.set(db().collection("lineas").doc(lineaId).collection("auditoria").doc(), { que: "panico_cancelado", alerta: id, chofer: uid, en: FieldValue.serverTimestamp() });
    }
    tx.update(refPrivado, { fallos: [] });
    return { resultado: "cerrada" as const };
  });
});

// ---------------------------------------------------------------------------------------------
// El chofer define sus dos PIN (normal y de coacción). Se guardan solo los hashes.
// ---------------------------------------------------------------------------------------------
const PedidoPin = z.object({ pinNormal: z.string(), pinCoaccion: z.string() });

export const definirPin = onCall(async (req) => {
  const uid = req.auth?.uid;
  const lineaId = req.auth?.token.linea as string | undefined;
  if (!uid || !lineaId) throw new HttpsError("unauthenticated", "Hay que iniciar sesión");
  const p = PedidoPin.safeParse(req.data);
  if (!p.success) throw new HttpsError("invalid-argument", "Pedido inválido");
  const { pinNormal, pinCoaccion } = p.data;
  if (!pinValido(pinNormal) || !pinValido(pinCoaccion)) throw new HttpsError("invalid-argument", "El PIN tiene que tener de 4 a 8 números y no ser obvio (1234, 0000…)");
  if (pinNormal === pinCoaccion) throw new HttpsError("invalid-argument", "Los dos PIN tienen que ser distintos");
  const [n, c] = await Promise.all([hashearPin(pinNormal), hashearPin(pinCoaccion)]);
  await db().collection("lineas").doc(lineaId).collection("privado").doc(uid).set({ pinNormal: n, pinCoaccion: c, fallos: [], definidoEn: FieldValue.serverTimestamp() });
  return { ok: true };
});

// ---------------------------------------------------------------------------------------------
// Alta de una persona en la línea (la hace tráfico o un admin): usuario por celular + rol + línea.
// ---------------------------------------------------------------------------------------------
const PedidoAlta = z.object({
  telefono: z.string().regex(/^\+549\d{10}$/, "Formato: +549 y 10 números (ej. +5491123456789)"),
  nombre: z.string().trim().min(2).max(80),
  rol: z.enum(["chofer", "trafico", "taller", "personal", "delegado"]),
});

export const altaDePersona = onCall(async (req) => {
  const rolQuien = req.auth?.token.rol;
  const lineaId = req.auth?.token.linea as string | undefined;
  if (!lineaId || (rolQuien !== "admin" && rolQuien !== "trafico")) throw new HttpsError("permission-denied", "Solo tráfico o un administrador pueden dar altas");
  const p = PedidoAlta.safeParse(req.data);
  if (!p.success) throw new HttpsError("invalid-argument", p.error.issues[0]?.message ?? "Pedido inválido");
  if (rolQuien === "trafico" && p.data.rol !== "chofer") throw new HttpsError("permission-denied", "Tráfico solo da de alta choferes");

  const auth = getAuth();
  const usuario = await auth.getUserByPhoneNumber(p.data.telefono).catch(() => auth.createUser({ phoneNumber: p.data.telefono, displayName: p.data.nombre }));
  const actuales = usuario.customClaims ?? {};
  if (actuales.linea && actuales.linea !== lineaId) throw new HttpsError("already-exists", "Ese celular ya está dado de alta en otra línea");
  await auth.setCustomUserClaims(usuario.uid, { rol: p.data.rol, linea: lineaId });
  await db().collection("lineas").doc(lineaId).collection("personas").doc(usuario.uid).set(
    { nombre: p.data.nombre, rol: p.data.rol, telefono: p.data.telefono, altaPor: req.auth?.uid, altaEn: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await auditar(lineaId, "alta_persona", { persona: usuario.uid, rol: p.data.rol, por: req.auth?.uid });
  return { uid: usuario.uid };
});

// ---------------------------------------------------------------------------------------------
// Etapa 2: al aprobarse un cambio de turno, se intercambian las planillas de ese día (en una transacción).
// ---------------------------------------------------------------------------------------------
export const alAprobarCambioDeTurno = onDocumentUpdated({ document: "lineas/{lineaId}/pedidos/{id}" }, async (ev) => {
  const antes = Pedido.safeParse(ev.data?.before.data());
  const despues = Pedido.safeParse(ev.data?.after.data());
  if (!antes.success || !despues.success) return;
  const p = despues.data;
  if (p.tipo !== "cambio_turno" || antes.data.estado === "aprobado" || p.estado !== "aprobado" || !p.fecha || !p.tomadoPor) return;
  const col = db().collection("lineas").doc(p.lineaId).collection("planillas");
  await db().runTransaction(async (tx) => {
    const refA = col.doc(`${p.choferId}-${p.fecha}`);
    const refB = col.doc(`${p.tomadoPor}-${p.fecha}`);
    const [a, b] = await Promise.all([tx.get(refA), tx.get(refB)]);
    const pa = Planilla.safeParse(a.data());
    const pb = Planilla.safeParse(b.data());
    if (!pa.success || !pb.success) {
      tx.update(ev.data!.after.ref, { respuesta: "Aprobado, pero falta una de las dos planillas de ese día: tráfico tiene que cargarla a mano." });
      return;
    }
    const [na, nb] = intercambiarPlanillas(pa.data, pb.data);
    tx.set(refA, na);
    tx.set(refB, nb);
  });
  await auditar(p.lineaId, "cambio_turno_aprobado", { pedido: p.id, de: p.choferId, a: p.tomadoPor, fecha: p.fecha });
  await Promise.all(
    [p.choferId, p.tomadoPor].map((uid) =>
      getMessaging().send({ topic: `chofer-${uid}`, notification: { title: "Cambio de turno aprobado", body: `Tu planilla del ${p.fecha} ya está actualizada.` } }).catch(() => undefined),
    ),
  );
});

// ---------------------------------------------------------------------------------------------
// Todos los días a las 8 (hora argentina): aviso a cada chofer de lo que vence a 30, 15, 7, 1 y 0 días.
// ---------------------------------------------------------------------------------------------
export const avisoDeVencimientos = onSchedule({ schedule: "0 8 * * *", timeZone: "America/Argentina/Buenos_Aires" }, async () => {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }); // AAAA-MM-DD
  const snap = await db().collectionGroup("certificados").where("estado", "==", "validado").get();
  let avisos = 0;
  for (const d of snap.docs) {
    const c = Certificado.safeParse(d.data());
    if (!c.success || !tocaAvisar(c.data.vence, hoy)) continue;
    const dias = diasParaVencer(c.data.vence, hoy);
    await getMessaging()
      .send({
        topic: `chofer-${c.data.choferId}`,
        notification: { title: `${NOMBRE_CERTIFICADO[c.data.tipo]}: ${dias === 0 ? "vence hoy" : `vence en ${dias} días`}`, body: "Renovalo y cargá la foto nueva en LA RAMAL › Papeles." },
      })
      .catch(() => undefined);
    avisos++;
  }
  logger.info("Avisos de vencimiento enviados", { avisos, hoy });
});
