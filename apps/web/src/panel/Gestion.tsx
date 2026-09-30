import { useEffect, useMemo, useState } from "react";
import {
  Escala,
  NOMBRE_CERTIFICADO, NOMBRE_PEDIDO, conformidadVigente, exigenciaPorRecorrido, leerVueltas, nivelVencimiento, sha256Hex,
  MensajeRadio, textoDeAvisoParaLeer, textoParaLeer,
  type Certificado, type Comunicado, type Jornada, type Pedido, type Planilla, type Recibo,
} from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import type { Persona } from "../datos/fuente";
import { fechaLinda, hoyISO, pdfSimple, sumarDias } from "../compartido/pdf";
import { hora } from "../compartido/useAviso";
import { anunciar, vozDisponible } from "../radio/locutor";

type P = { fuente: Fuente; sesion: Sesion; avisar: (s: string) => void };

function useColeccion<K extends "planillas" | "recibos" | "certificados" | "pedidos" | "comunicados" | "jornadas" | "escalas">(p: P, col: K) {
  const [xs, setXs] = useState<import("../datos/fuente").Colecciones[K][]>([]);
  useEffect(() => p.fuente.escuchar(p.sesion.lineaId, col, [], setXs), [p.fuente, p.sesion, col]);
  return xs;
}

function usePersonas(p: P) {
  const [xs, setXs] = useState<Persona[]>([]);
  useEffect(() => void p.fuente.personas(p.sesion.lineaId).then((ps) => setXs(ps.filter((x) => x.rol === "chofer"))), [p.fuente, p.sesion]);
  return xs;
}

const abrirArchivo = async (fuente: Fuente, ruta: string) => {
  const u = await fuente.urlAdjunto(ruta);
  if (u) window.open(u, "_blank", "noopener");
};

// ---------------------------------------------------------------------------------------------
export function Personal(p: P) {
  const pedidos = useColeccion(p, "pedidos");
  const certificados = useColeccion(p, "certificados");
  const recibos = useColeccion(p, "recibos");
  const choferes = usePersonas(p);
  const [respuesta, setRespuesta] = useState<Record<string, string>>({});
  const abiertos = pedidos.filter((x) => ["pendiente", "tomado"].includes(x.estado)).sort((a, b) => a.creadoEn - b.creadoEn);
  const sinValidar = certificados.filter((c) => c.estado === "pendiente");
  const hoy = hoyISO();
  const porVencer = certificados.filter((c) => c.estado === "validado" && nivelVencimiento(c.vence, hoy) !== "al_dia").sort((a, b) => a.vence.localeCompare(b.vence));
  const nombre = (uid: string) => choferes.find((c) => c.uid === uid)?.nombre ?? uid;

  const accion = async (x: Pedido, a: "aprobar" | "rechazar" | "entregar") => {
    let rutaRespuesta: string | undefined;
    if (a === "entregar") {
      // El certificado se arma solo con los datos del legajo.
      const pdf = pdfSimple(NOMBRE_PEDIDO[x.tipo], [
        `Se certifica que ${x.choferNombre} trabaja en ${p.sesion.lineaNombre} como conductor.`,
        `Emitido el ${new Date().toLocaleDateString("es-AR")} a pedido del interesado.`,
        "",
        p.fuente.modo === "demo" ? "Documento de ejemplo generado por la demo de LA RAMAL." : "Firma y sello de la empresa.",
      ]);
      rutaRespuesta = `lineas/${p.sesion.lineaId}/respuestas/${x.choferId}/${x.id}.pdf`;
      await p.fuente.subirArchivo(rutaRespuesta, pdf);
    }
    await p.fuente
      .accionPedido(p.sesion.lineaId, x, p.sesion, a, { ...(respuesta[x.id] ? { respuesta: respuesta[x.id] } : {}), ...(rutaRespuesta ? { rutaRespuesta } : {}) })
      .then(() => p.avisar(a === "aprobar" && x.tipo === "cambio_turno" ? "Aprobado: las planillas se intercambiaron" : "Listo: el chofer ya lo ve"))
      .catch((e: Error) => p.avisar(e.message));
  };

  return (
    <div className="panel">
      <div className="col">
        <div className="card">
          <h3>Pedidos para responder ({abiertos.length})</h3>
          {abiertos.length === 0 ? <div className="muted">No hay pedidos pendientes.</div> : (
            <div className="list">
              {abiertos.map((x) => (
                <div className="it" key={x.id} style={{ display: "block" }}>
                  <div className="row"><b>{NOMBRE_PEDIDO[x.tipo]} · {x.choferNombre}</b><span className="muted">{new Date(x.creadoEn).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span></div>
                  {x.tipo === "cambio_turno" && <div>{x.fecha && fechaLinda(x.fecha)}: lo toma <b>{x.tomadoPorNombre}</b>. Al aprobar, se intercambian las planillas de ese día.</div>}
                  {x.tipo === "vacaciones" && x.desde && x.hasta && <div>Del {fechaLinda(x.desde)} al {fechaLinda(x.hasta)}</div>}
                  {x.detalle && <div className="muted">{x.detalle}</div>}
                  {x.adjuntos.map((r) => <button key={r} className="btn alt" style={{ marginTop: 4 }} onClick={() => abrirArchivo(p.fuente, r)}>Ver foto</button>)}
                  <input type="text" aria-label="Respuesta al chofer" placeholder="Respuesta (opcional)" value={respuesta[x.id] ?? ""} onChange={(e) => setRespuesta((r) => ({ ...r, [x.id]: e.target.value }))} style={{ marginTop: 6 }} />
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {x.tipo === "certificado_trabajo" || x.tipo === "certificado_haberes" ? (
                      <button className="btn" onClick={() => accion(x, "entregar")}>Generar y entregar PDF</button>
                    ) : (
                      <button className="btn" onClick={() => accion(x, "aprobar")}>Aprobar</button>
                    )}
                    <button className="btn alt" onClick={() => accion(x, "rechazar")}>Rechazar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <SubirRecibo {...p} choferes={choferes} recibos={recibos} />
        <EscalaConvenio {...p} />
      </div>
      <div className="col">
        <div className="card">
          <h3>Certificados para validar ({sinValidar.length})</h3>
          {sinValidar.length === 0 ? <div className="muted">Nada para validar.</div> : sinValidar.map((c) => <CertificadoFila key={c.id} c={c} nombre={nombre(c.choferId)} {...p} />)}
        </div>
        <div className="card">
          <h3>Vencen pronto</h3>
          {porVencer.length === 0 ? <div className="muted">Ningún certificado vence en los próximos 30 días.</div> : (
            <div className="list">
              {porVencer.map((c) => (
                <div className="it" key={c.id}>
                  <div style={{ flex: 1 }}><b>{nombre(c.choferId)}</b><div className="muted">{NOMBRE_CERTIFICADO[c.tipo]} · {fechaLinda(c.vence)}</div></div>
                  <span className={`chip ${nivelVencimiento(c.vence, hoy) === "pronto" ? "warn" : "bad"}`}>{nivelVencimiento(c.vence, hoy) === "vencido" ? "Vencido" : "Pronto"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Recibos sin conformidad</h3>
          {recibos.filter((r) => r.origen !== "chofer" && !conformidadVigente(r)).map((r) => <div key={r.id} className="muted">{nombre(r.choferId)} · {r.periodo}</div>)}
          {recibos.every((r) => r.origen === "chofer" || conformidadVigente(r)) && <div className="muted">Todos los recibos tienen conformidad.</div>}
        </div>
      </div>
    </div>
  );
}

function CertificadoFila(p: P & { c: Certificado; nombre: string }) {
  const [motivo, setMotivo] = useState("");
  return (
    <div className="it" style={{ display: "block" }}>
      <div className="row"><b>{p.nombre}</b><span className="muted">{NOMBRE_CERTIFICADO[p.c.tipo]} · vence {fechaLinda(p.c.vence)}</span></div>
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        {p.c.ruta && <button className="btn alt" onClick={() => abrirArchivo(p.fuente, p.c.ruta)}>Ver</button>}
        <button className="btn" onClick={() => p.fuente.actualizar(p.sesion.lineaId, "certificados", p.c.id, { estado: "validado" }).then(() => p.avisar("Validado"))}>Validar</button>
        <input type="text" aria-label="Motivo del rechazo" placeholder="Motivo si se rechaza" value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
        <button className="btn alt" onClick={() => motivo && p.fuente.actualizar(p.sesion.lineaId, "certificados", p.c.id, { estado: "rechazado", motivo }).then(() => p.avisar("Rechazado"))}>Rechazar</button>
      </div>
    </div>
  );
}

function SubirRecibo(p: P & { choferes: Persona[]; recibos: Recibo[] }) {
  const [chofer, setChofer] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const subir = async () => {
    if (!chofer || !/^\d{4}-\d{2}$/.test(periodo) || !archivo) return p.avisar("Elegí chofer, período y el PDF o la foto del recibo");
    const ruta = `lineas/${p.sesion.lineaId}/recibos/${chofer}/${periodo}`;
    await p.fuente.subirArchivo(ruta, archivo);
    const id = `${chofer}-${periodo}`;
    const sha256 = await sha256Hex(await archivo.arrayBuffer());
    const existe = p.recibos.find((x) => x.id === id);
    // Si se reemplaza el archivo, cambia el hash: la conformidad anterior deja de valer y el chofer la vuelve a dar.
    if (existe) await p.fuente.actualizar(p.sesion.lineaId, "recibos", id, { ruta, sha256, mime: archivo.type, subidoEn: Date.now() });
    else
      await p.fuente.crear(p.sesion.lineaId, "recibos", {
        id, lineaId: p.sesion.lineaId, choferId: chofer, periodo, neto: 0, ruta, sha256, mime: archivo.type || "application/pdf", origen: "personal", lectura: "pendiente", subidoEn: Date.now(),
      });
    setArchivo(null);
    p.avisar(p.fuente.modo === "demo" ? "Recibo subido. En la demo no se lee con IA; en la app real completa los montos solo." : "Recibo subido: la IA lo lee y completa los montos");
  };
  return (
    <div className="card">
      <h3>Subir un recibo</h3>
      <div className="muted">Solo el PDF o una foto: la IA lee básico, antigüedad, viáticos, presentismo, extras y neto.</div>
      <label className="f" htmlFor="r-chofer">Chofer
        <select id="r-chofer" value={chofer} onChange={(e) => setChofer(e.target.value)}>
          <option value="">Elegí</option>
          {p.choferes.map((c) => <option key={c.uid} value={c.uid}>{c.nombre}</option>)}
        </select>
      </label>
      <label className="f" htmlFor="r-periodo">Período<input id="r-periodo" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></label>
      <label className="f" htmlFor="r-pdf">Recibo (PDF o foto)<input id="r-pdf" type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} /></label>
      <button className="btn yellow" onClick={subir}>Subir</button>
    </div>
  );
}

function EscalaConvenio(p: P) {
  const escalas = useColeccion(p, "escalas");
  const actual = escalas[0];
  const [e, setE] = useState<Record<string, string>>({});
  const campos: [keyof Escala, string][] = [
    ["desde", "Vigente desde (AAAA-MM-DD)"], ["basico", "Básico ($)"], ["antiguedadPctPorAnio", "Antigüedad (% del básico por año)"], ["viaticoPorDia", "Viático por día ($)"],
    ["presentismo", "Presentismo ($)"], ["recargoExtraComunPct", "Hora extra día común (% de recargo)"], ["recargoExtraDomingoFeriadoPct", "Hora extra domingo y feriado (%)"],
    ["recargoNocturnoPct", "Recargo nocturno 21 a 6 h (%)"], ["jornadaHoras", "Jornada (horas)"], ["divisorHoras", "Divisor para el valor hora"], ["bonoPorKm", "Bono por km ($, 0 si no hay)"], ["fuente", "De dónde salen estos números"],
  ];
  const valor = (k: string) => e[k] ?? String((actual as Record<string, unknown> | undefined)?.[k] ?? "");
  const guardar = async () => {
    const num = (k: string) => Number(valor(k).replace(/\./g, "").replace(",", "."));
    const nueva = {
      id: "vigente" as const, lineaId: p.sesion.lineaId, desde: valor("desde"), basico: num("basico"), antiguedadPctPorAnio: num("antiguedadPctPorAnio"), viaticoPorDia: num("viaticoPorDia"),
      presentismo: num("presentismo"), recargoExtraComunPct: num("recargoExtraComunPct"), recargoExtraDomingoFeriadoPct: num("recargoExtraDomingoFeriadoPct"), recargoNocturnoPct: num("recargoNocturnoPct"),
      jornadaHoras: num("jornadaHoras"), divisorHoras: num("divisorHoras"), bonoPorKm: num("bonoPorKm"), feriados: actual?.feriados ?? [], fuente: valor("fuente"), ejemplo: false,
    };
    const ok = Escala.safeParse(nueva);
    if (!ok.success) return p.avisar("Revisá: " + (ok.error.issues[0]?.path.join(".") ?? "") + " " + (ok.error.issues[0]?.message ?? ""));
    if (actual) await p.fuente.actualizar(p.sesion.lineaId, "escalas", "vigente", ok.data);
    else await p.fuente.crear(p.sesion.lineaId, "escalas", ok.data);
    setE({});
    p.avisar("Escala guardada: los choferes ven la cuenta nueva");
  };
  return (
    <div className="card">
      <h3>Escala del convenio (CCT 460/73)</h3>
      <div className="muted">Se actualiza con cada paritaria. Con esto cada chofer ve cuánto lleva ganado, concepto por concepto.{actual?.ejemplo ? " Ahora hay una escala de EJEMPLO." : ""}</div>
      <div className="grid2">
        {campos.map(([k, t]) => (
          <label key={k} className="f" htmlFor={`esc-${k}`} style={k === "fuente" ? { gridColumn: "1 / -1" } : undefined}>{t}
            <input id={`esc-${k}`} type="text" value={valor(k)} onChange={(ev) => setE((x) => ({ ...x, [k]: ev.target.value }))} />
          </label>
        ))}
      </div>
      <button className="btn yellow" onClick={guardar}>Guardar escala</button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function Planillas(p: P) {
  const choferes = usePersonas(p);
  const planillas = useColeccion(p, "planillas");
  const [fecha, setFecha] = useState(sumarDias(hoyISO(), 1));
  const [chofer, setChofer] = useState("");
  const [coche, setCoche] = useState("");
  const [cabecera, setCabecera] = useState("Terminal Quilmes Oeste");
  const [ramal, setRamal] = useState("A");
  const [texto, setTexto] = useState("05:10-06:52\n07:05-08:50\n09:05-10:47\n11:00-12:45");
  const [franco, setFranco] = useState(false);
  const leidas = useMemo(() => leerVueltas(texto), [texto]);
  const delDia = planillas.filter((x) => x.fecha === fecha).sort((a, b) => a.choferNombre.localeCompare(b.choferNombre));

  const publicar = async () => {
    const c = choferes.find((x) => x.uid === chofer);
    if (!c || (!franco && (!coche || leidas.vueltas.length === 0 || leidas.errores.length))) return p.avisar("Revisá chofer, coche y vueltas");
    const pl: Planilla = {
      id: `${c.uid}-${fecha}`, lineaId: p.sesion.lineaId, choferId: c.uid, choferNombre: c.nombre, fecha, cocheId: coche || "-", cabecera, ramal,
      vueltas: franco ? [{ sale: "00:00", llega: "00:00" }] : leidas.vueltas, franco, publicadaEn: Date.now(),
    };
    const existe = planillas.some((x) => x.id === pl.id);
    if (existe) await p.fuente.actualizar(p.sesion.lineaId, "planillas", pl.id, pl);
    else await p.fuente.crear(p.sesion.lineaId, "planillas", pl);
    p.avisar(`Planilla publicada: ${c.nombre} la ve en su celular`);
  };

  return (
    <div className="panel">
      <div className="col">
        <div className="card">
          <h3>Cargar planilla</h3>
          <div className="grid2">
            <label className="f" htmlFor="pl-fecha">Día<input id="pl-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
            <label className="f" htmlFor="pl-chofer">Chofer
              <select id="pl-chofer" value={chofer} onChange={(e) => setChofer(e.target.value)}>
                <option value="">Elegí</option>
                {choferes.map((c) => <option key={c.uid} value={c.uid}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="f" htmlFor="pl-coche">Coche<input id="pl-coche" type="text" placeholder="Interno 23" value={coche} onChange={(e) => setCoche(e.target.value)} /></label>
            <label className="f" htmlFor="pl-ramal">Ramal<input id="pl-ramal" type="text" value={ramal} onChange={(e) => setRamal(e.target.value)} /></label>
          </div>
          <label className="f" htmlFor="pl-cabecera">Cabecera<input id="pl-cabecera" type="text" value={cabecera} onChange={(e) => setCabecera(e.target.value)} /></label>
          <label className="f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }} htmlFor="pl-franco"><input id="pl-franco" type="checkbox" checked={franco} onChange={(e) => setFranco(e.target.checked)} /> Franco</label>
          {!franco && (
            <label className="f" htmlFor="pl-vueltas">Vueltas (una por renglón, se puede pegar desde el Excel)
              <textarea id="pl-vueltas" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} style={{ fontVariantNumeric: "tabular-nums" }} />
            </label>
          )}
          {!franco && <div className={leidas.errores.length ? "chip bad" : "chip ok"} style={{ alignSelf: "flex-start" }}>{leidas.errores.length ? leidas.errores[0] : `${leidas.vueltas.length} vueltas leídas`}</div>}
          <button className="btn yellow" onClick={publicar}>Publicar planilla</button>
        </div>
      </div>
      <div className="col">
        <div className="card">
          <h3>Planillas del {fechaLinda(fecha)}</h3>
          {delDia.length === 0 ? <div className="muted">No hay planillas cargadas ese día.</div> : (
            <div className="list">
              {delDia.map((x) => (
                <div className="it" key={x.id}>
                  <div style={{ flex: 1 }}><b>{x.choferNombre}</b><div className="muted">{x.franco ? "Franco" : `${x.cocheId} · ${x.vueltas[0]?.sale}–${x.vueltas.at(-1)?.llega} · ${x.vueltas.length} vueltas`}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
/** Mensajes de la terminal por la radio: en el celular del chofer suena un «ding», la radio baja y una voz lo lee. */
export function MensajesRadio(p: P) {
  const [desde] = useState(() => Date.now() - 7 * 24 * 3600_000);
  const [enviados, setEnviados] = useState<MensajeRadio[]>([]);
  useEffect(() => p.fuente.escuchar(p.sesion.lineaId, "mensajesRadio", [{ campo: "creadoEn", desde }], setEnviados), [p.fuente, p.sesion, desde]);
  const [texto, setTexto] = useState("");
  const [para, setPara] = useState("");
  const [enviando, setEnviando] = useState(false);
  const RAPIDOS = ["Hay un corte más adelante: tomen el desvío.", "Presentarse en la cabecera al terminar la vuelta.", "Demoras por tránsito: mantengan la frecuencia.", "Comunicarse con tráfico."];
  const armar = (): MensajeRadio | null => {
    const r = MensajeRadio.safeParse({ id: crypto.randomUUID(), lineaId: p.sesion.lineaId, texto, para: para.trim() || "todos", autor: p.sesion.nombre, creadoEn: Date.now() });
    return r.success ? r.data : null;
  };
  const enviar = async () => {
    const m = armar();
    if (!m) return p.avisar("Escribí el mensaje (hasta 280 letras)");
    setEnviando(true);
    try {
      await p.fuente.crear(p.sesion.lineaId, "mensajesRadio", m);
      setTexto("");
      p.avisar(m.para === "todos" ? "Mensaje enviado a toda la flota" : `Mensaje enviado al ${m.para}`);
    } catch {
      p.avisar("No se pudo enviar: revisá la conexión");
    } finally {
      setEnviando(false);
    }
  };
  const escuchar = () => {
    const m = armar();
    if (!m) return p.avisar("Escribí el mensaje para escucharlo");
    void anunciar(textoParaLeer(m));
  };
  return (
    <div className="panel">
      <div className="col">
        <div className="card">
          <h3>📻 Mensaje por la radio</h3>
          <div className="muted">En el celular del chofer suena un «ding», la radio baja y una voz lee el mensaje. Así se entera sin mirar la pantalla.</div>
          <label className="f" htmlFor="mr-texto">Mensaje<textarea id="mr-texto" rows={3} maxLength={280} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: Corte en Mitre y 12 de Octubre, tomen por Rivadavia." /></label>
          <div className="muted" style={{ fontSize: 12, textAlign: "right" }}>{texto.trim().length} / 280</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-start" }}>
            {RAPIDOS.map((r) => <button key={r} className="chip" style={{ cursor: "pointer", border: 0 }} onClick={() => setTexto(r)}>{r}</button>)}
          </div>
          <label className="f" htmlFor="mr-para">Para<input id="mr-para" type="text" maxLength={40} value={para} onChange={(e) => setPara(e.target.value)} placeholder="Vacío = toda la flota · o el coche, ej. Interno 23" /></label>
          <div className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
            <button className="btn yellow" onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Enviar por la radio"}</button>
            <button className="btn" onClick={escuchar} disabled={!vozDisponible()}>🔊 Escuchar cómo suena</button>
          </div>
          {!vozDisponible() && <div className="muted">Este navegador no tiene voz: el mensaje llega igual y en el celular se lee con la voz del teléfono.</div>}
        </div>
      </div>
      <div className="col">
        <div className="card">
          <h3>Enviados</h3>
          {enviados.length === 0 ? <div className="muted">Todavía no se mandó ningún mensaje.</div> : [...enviados].sort((a, b) => b.creadoEn - a.creadoEn).slice(0, 30).map((m) => (
            <div className="it" key={m.id} style={{ display: "block" }}>
              <div className="row"><b>{m.para === "todos" ? "Toda la flota" : m.para}</b><span className="muted">{hora(m.creadoEn)}{m.autor ? ` · ${m.autor}` : ""}</span></div>
              <div>{m.texto}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function Avisos(p: P) {
  const comunicados = useColeccion(p, "comunicados");
  const choferes = usePersonas(p);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [importante, setImportante] = useState(false);
  const publicar = async () => {
    if (!titulo.trim() || !texto.trim()) return p.avisar("Poné título y texto");
    const c: Comunicado = { id: crypto.randomUUID(), lineaId: p.sesion.lineaId, titulo: titulo.trim(), texto: texto.trim(), importante, creadoEn: Date.now(), leidos: [] };
    await p.fuente.crear(p.sesion.lineaId, "comunicados", c);
    setTitulo("");
    setTexto("");
    p.avisar("Aviso publicado: se escucha en los celulares de los choferes");
  };
  const escuchar = () => {
    if (!titulo.trim() || !texto.trim()) return p.avisar("Poné título y texto para escucharlo");
    void anunciar(textoDeAvisoParaLeer({ titulo, texto, importante }));
  };
  return (
    <div className="panel">
      <div className="col">
        <div className="card">
          <h3>Nuevo aviso</h3>
          <label className="f" htmlFor="a-titulo">Título<input id="a-titulo" type="text" maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
          <label className="f" htmlFor="a-texto">Texto<textarea id="a-texto" rows={4} maxLength={3000} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
          <label className="f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }} htmlFor="a-imp"><input id="a-imp" type="checkbox" checked={importante} onChange={(e) => setImportante(e.target.checked)} /> Importante</label>
          <div className="muted">Al publicarlo, en el celular de cada chofer suena un «ding», la radio baja y una voz lo lee.</div>
          <button className="btn yellow" onClick={publicar}>Publicar</button>
          <button className="btn" onClick={escuchar} disabled={!vozDisponible()}>🔊 Escuchar cómo suena</button>
        </div>
      </div>
      <div className="col">
        <div className="card">
          <h3>Avisos publicados</h3>
          {comunicados.sort((a, b) => b.creadoEn - a.creadoEn).map((c) => {
            const faltan = choferes.filter((x) => !c.leidos.includes(x.uid));
            return (
              <div className="it" key={c.id} style={{ display: "block" }}>
                <div className="row"><b>{c.titulo}</b><span className={`chip ${faltan.length ? "warn" : "ok"}`}>Leído por {c.leidos.length} de {choferes.length}</span></div>
                {faltan.length > 0 && <div className="muted">Falta: {faltan.map((x) => x.nombre).join(", ")}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function Recorridos(p: P) {
  const jornadas = useColeccion(p, "jornadas") as Jornada[];
  const filas = useMemo(
    () => exigenciaPorRecorrido(jornadas.flatMap((j) => j.vueltas.map((v) => ({ recorrido: `Ramal ${j.ramal || "?"} · ${v.desde} → ${v.hasta}`, sale: v.sale, duracionMin: (v.llega - v.sale) / 60_000, puntos: v.puntos })))),
    [jornadas],
  );
  const ejemplo = jornadas.some((j) => j.ejemplo);
  const max = Math.max(0, ...filas.map((f) => f.puntosPorHora));
  return (
    <div className="panel" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <div className="card">
        <div className="row"><h3>Índice de exigencia por recorrido y franja horaria</h3>{ejemplo && <span className="chip warn">Datos de ejemplo</span>}</div>
        <div className="muted">Medido solo por el GPS de los choferes. Puntos por hora manejada: 1 por parada, 0,5 por minuto trabado en el tránsito, 0,5 por km y 5 por vuelta en hora pico. Con menos de 5 vueltas no se informa.</div>
        {filas.length === 0 ? <div className="muted">Todavía no hay vueltas medidas.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
              <thead><tr style={{ textAlign: "left" }}><th style={{ padding: 6 }}>Recorrido</th><th style={{ padding: 6 }}>Franja</th><th style={{ padding: 6 }}>Vueltas</th><th style={{ padding: 6 }}>Puntos por hora</th><th style={{ padding: 6 }}>Contra el promedio</th></tr></thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.recorrido + f.franja} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: 6 }}>{f.recorrido}</td>
                    <td style={{ padding: 6 }}>{f.franja.charAt(0).toUpperCase() + f.franja.slice(1)}</td>
                    <td style={{ padding: 6 }}>{f.vueltas}</td>
                    <td style={{ padding: 6, minWidth: 160 }}>
                      <span style={{ display: "inline-block", width: `${Math.round((f.puntosPorHora / max) * 100)}px`, height: 10, background: "var(--coral)", borderRadius: 4, marginRight: 6 }} />
                      {f.puntosPorHora}
                    </td>
                    <td style={{ padding: 6 }}><span className={`chip ${f.contraPromedioPct > 10 ? "bad" : f.contraPromedioPct < -10 ? "ok" : "warn"}`}>{f.contraPromedioPct > 0 ? "+" : ""}{f.contraPromedioPct} %</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

