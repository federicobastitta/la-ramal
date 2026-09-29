import { useEffect, useMemo, useState } from "react";
import {
  NOMBRE_CERTIFICADO, NOMBRE_PEDIDO, TIPOS_CERTIFICADO, conformidadVigente, descansosMin, duracionTurnoMin, estadoInicial, horasDelPeriodo, horasExtra,
  nivelVencimiento, diasParaVencer, type Certificado, type Comunicado, type Pedido, type Planilla, type Recibo, type TipoPedido,
} from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { fechaLinda, hoyISO, plata } from "../compartido/pdf";

export type DatosPapeles = {
  planillas: Planilla[];
  recibos: Recibo[];
  certificados: Certificado[];
  pedidos: Pedido[];
  ofrecidos: Pedido[];
  comunicados: Comunicado[];
};

/** Todo lo del chofer, en vivo. Las consultas filtran por chofer (así lo exigen las reglas). */
export function usePapeles(fuente: Fuente | null, sesion: Sesion | null): DatosPapeles {
  const [d, setD] = useState<DatosPapeles>({ planillas: [], recibos: [], certificados: [], pedidos: [], ofrecidos: [], comunicados: [] });
  useEffect(() => {
    if (!fuente || !sesion) return;
    const L = sesion.lineaId;
    const mio = [{ campo: "choferId", igual: sesion.uid }];
    const set = <K extends keyof DatosPapeles>(k: K) => (v: DatosPapeles[K]) => setD((x) => ({ ...x, [k]: v }));
    const fin = [
      fuente.escuchar(L, "planillas", mio, (xs) => set("planillas")(xs.sort((a, b) => b.fecha.localeCompare(a.fecha)))),
      fuente.escuchar(L, "recibos", mio, (xs) => set("recibos")(xs.sort((a, b) => b.periodo.localeCompare(a.periodo)))),
      fuente.escuchar(L, "certificados", mio, (xs) => set("certificados")(xs.sort((a, b) => a.vence.localeCompare(b.vence)))),
      fuente.escuchar(L, "pedidos", mio, (xs) => set("pedidos")(xs.sort((a, b) => b.creadoEn - a.creadoEn))),
      fuente.escuchar(L, "pedidos", [{ campo: "tipo", igual: "cambio_turno" }, { campo: "estado", igual: "ofrecido" }], (xs) => set("ofrecidos")(xs.filter((p) => p.choferId !== sesion.uid))),
      fuente.escuchar(L, "comunicados", [], (xs) => set("comunicados")(xs.sort((a, b) => b.creadoEn - a.creadoEn))),
    ];
    return () => fin.forEach((f) => f());
  }, [fuente, sesion]);
  return d;
}

export function PlanillaDeHoy({ planillas }: { planillas: Planilla[] }) {
  const hoy = hoyISO();
  const p = planillas.find((x) => x.fecha === hoy);
  if (!p) return <div className="card"><span className="eyebrow">Tu planilla de hoy</span><div className="muted">Tráfico todavía no cargó tu planilla de hoy.</div></div>;
  if (p.franco) return <div className="card"><span className="eyebrow">Tu planilla de hoy</span><div className="big">Franco</div><div className="muted">Disfrutalo.</div></div>;
  const desc = descansosMin(p);
  return (
    <div className="card">
      <span className="eyebrow">Tu planilla de hoy</span>
      <div className="row">
        <div><div className="big">{p.vueltas[0]?.sale}</div><div className="muted">Salida de {p.cabecera}</div></div>
        <div style={{ textAlign: "right" }}><div className="big">{p.vueltas.length}</div><div className="muted">vueltas</div></div>
      </div>
      <div className="row"><span>{p.cocheId}{p.ramal ? ` · ramal ${p.ramal}` : ""}</span><span className="muted">Termina {p.vueltas.at(-1)?.llega}</span></div>
      <div className="thumbs">{p.vueltas.map((v, i) => <span key={i} className="chip ok">{v.sale}–{v.llega}</span>)}</div>
      {desc.length > 0 && <div className="muted">Descansos entre vueltas: {desc.map((m) => `${m} min`).join(", ")}</div>}
    </div>
  );
}

type Pantalla = "planillas" | "recibos" | "certificados" | "pedidos" | "comunicados";

export function Papeles(p: { fuente: Fuente; sesion: Sesion; datos: DatosPapeles; avisar: (s: string) => void }) {
  const [ver, setVer] = useState<Pantalla>("planillas");
  const sinLeer = p.datos.comunicados.filter((c) => !c.leidos.includes(p.sesion.uid)).length;
  const sinConformidad = p.datos.recibos.filter((r) => !conformidadVigente(r)).length;
  const porVencer = p.datos.certificados.filter((c) => nivelVencimiento(c.vence, hoyISO()) !== "al_dia").length;
  const opciones: [Pantalla, string, number][] = [
    ["planillas", "Planillas", 0],
    ["recibos", "Recibos", sinConformidad],
    ["certificados", "Certificados", porVencer],
    ["pedidos", "Pedidos", p.datos.ofrecidos.length],
    ["comunicados", "Avisos", sinLeer],
  ];
  return (
    <>
      <div className="types" role="tablist" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {opciones.map(([k, t, n]) => (
          <button key={k} role="tab" className="type" aria-pressed={ver === k} onClick={() => setVer(k)} style={{ fontSize: 13, padding: "8px 2px" }}>
            {t}{n > 0 && <span className="chip bad" style={{ marginLeft: 4, padding: "0 6px" }}>{n}</span>}
          </button>
        ))}
      </div>
      {ver === "planillas" && <Planillas planillas={p.datos.planillas} />}
      {ver === "recibos" && <Recibos {...p} />}
      {ver === "certificados" && <Certificados {...p} />}
      {ver === "pedidos" && <Pedidos {...p} />}
      {ver === "comunicados" && <Comunicados {...p} />}
    </>
  );
}

function Planillas({ planillas }: { planillas: Planilla[] }) {
  const hoy = hoyISO();
  const mes = hoy.slice(0, 7);
  const delMes = planillas.filter((x) => x.fecha.startsWith(mes) && x.fecha <= hoy);
  const proximas = planillas.filter((x) => x.fecha > hoy).reverse();
  const pasadas = planillas.filter((x) => x.fecha <= hoy);
  return (
    <>
      <PlanillaDeHoy planillas={planillas} />
      <div className="card">
        <span className="eyebrow">Este mes, hasta hoy</span>
        <div className="row">
          <div><div className="big">{horasDelPeriodo(delMes)} h</div><div className="muted">trabajadas en {delMes.filter((x) => !x.franco).length} días</div></div>
          <div style={{ textAlign: "right" }}><div className="big">{horasExtra(delMes)} h</div><div className="muted">por encima de 8 h por día</div></div>
        </div>
        <div className="muted">Sale de tus planillas. Sirve para controlar el recibo.</div>
      </div>
      {proximas.length > 0 && <ListaPlanillas titulo="Próximos días" xs={proximas} />}
      <ListaPlanillas titulo="Planillas pasadas" xs={pasadas.slice(0, 31)} />
    </>
  );
}

function ListaPlanillas({ titulo, xs }: { titulo: string; xs: Planilla[] }) {
  return (
    <div className="card">
      <span className="eyebrow">{titulo}</span>
      {xs.length === 0 ? <div className="muted">No hay planillas.</div> : (
        <div className="list">
          {xs.map((x) => (
            <details className="it" key={x.id} style={{ display: "block" }}>
              <summary className="row" style={{ cursor: "pointer" }}>
                <b>{fechaLinda(x.fecha)}</b>
                <span className="muted">{x.franco ? "Franco" : `${x.cocheId} · ${x.vueltas[0]?.sale}–${x.vueltas.at(-1)?.llega} · ${Math.round(duracionTurnoMin(x) / 6) / 10} h`}</span>
              </summary>
              {!x.franco && <div className="thumbs" style={{ marginTop: 6 }}>{x.vueltas.map((v, i) => <span key={i} className="chip ok">{v.sale}–{v.llega}</span>)}</div>}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function Recibos(p: { fuente: Fuente; sesion: Sesion; datos: DatosPapeles; avisar: (s: string) => void }) {
  const abrir = async (r: Recibo) => {
    const url = await p.fuente.urlAdjunto(r.ruta);
    if (url) window.open(url, "_blank", "noopener");
  };
  return (
    <div className="card">
      <span className="eyebrow">Recibos de sueldo</span>
      {p.datos.recibos.length === 0 ? <div className="muted">Personal todavía no subió recibos.</div> : (
        <div className="list">
          {p.datos.recibos.map((r) => (
            <div className="it" key={r.id}>
              <div style={{ flex: 1 }}>
                <b>{r.periodo}</b> · {plata(r.neto)}
                <div className="muted">{conformidadVigente(r) ? `Conformidad dada el ${new Date(r.conformidad!.en).toLocaleDateString("es-AR")}` : r.conformidad ? "El recibo cambió después de tu conformidad: revisalo de nuevo" : "Sin conformidad"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn alt" onClick={() => abrir(r)}>Ver</button>
                {!conformidadVigente(r) && (
                  <button className="btn yellow" onClick={() => p.fuente.actualizar(p.sesion.lineaId, "recibos", r.id, { conformidad: { en: Date.now(), sha256: r.sha256 } }).then(() => p.avisar("Conformidad registrada"))}>
                    Dar conformidad
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="muted">La conformidad queda atada a ese archivo exacto: si el recibo cambia, te lo vuelve a pedir.</div>
    </div>
  );
}

const COLOR_NIVEL = { vencido: "bad", urgente: "bad", pronto: "warn", al_dia: "ok" } as const;

function Certificados(p: { fuente: Fuente; sesion: Sesion; datos: DatosPapeles; avisar: (s: string) => void }) {
  const hoy = hoyISO();
  const [tipo, setTipo] = useState<(typeof TIPOS_CERTIFICADO)[number]>("psicofisico");
  const [vence, setVence] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const cargar = async () => {
    if (!vence || !foto) return p.avisar("Poné la fecha de vencimiento y sacale una foto");
    const id = crypto.randomUUID();
    const ruta = `lineas/${p.sesion.lineaId}/certificados/${p.sesion.uid}/${id}`;
    await p.fuente.subirArchivo(ruta, foto);
    await p.fuente.crear(p.sesion.lineaId, "certificados", { id, lineaId: p.sesion.lineaId, choferId: p.sesion.uid, tipo, vence, ruta, estado: "pendiente", cargadoEn: Date.now() });
    setFoto(null);
    setVence("");
    p.avisar("Certificado cargado: personal lo va a validar");
  };
  return (
    <>
      <div className="card">
        <span className="eyebrow">Tus certificados</span>
        {p.datos.certificados.length === 0 ? <div className="muted">Todavía no cargaste certificados.</div> : (
          <div className="list">
            {p.datos.certificados.map((c) => {
              const nivel = nivelVencimiento(c.vence, hoy);
              const dias = diasParaVencer(c.vence, hoy);
              return (
                <div className="it" key={c.id}>
                  <div style={{ flex: 1 }}>
                    <b>{NOMBRE_CERTIFICADO[c.tipo]}</b>
                    <div className="muted">Vence {fechaLinda(c.vence)} · {c.estado === "pendiente" ? "esperando validación" : c.estado === "rechazado" ? `rechazado: ${c.motivo ?? ""}` : "validado"}</div>
                  </div>
                  <span className={`chip ${COLOR_NIVEL[nivel]}`}>{dias < 0 ? "Vencido" : dias === 0 ? "Vence hoy" : `${dias} días`}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="muted">Te avisamos a los 30, 15, 7 y 1 día del vencimiento.</div>
      </div>
      <div className="card">
        <span className="eyebrow">Cargar un certificado</span>
        <label className="f" htmlFor="c-tipo">Qué es
          <select id="c-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            {TIPOS_CERTIFICADO.map((t) => <option key={t} value={t}>{NOMBRE_CERTIFICADO[t]}</option>)}
          </select>
        </label>
        <label className="f" htmlFor="c-vence">Vence el<input id="c-vence" type="date" value={vence} min={hoy} onChange={(e) => setVence(e.target.value)} /></label>
        <label className="f" htmlFor="c-foto">Foto del certificado<input id="c-foto" type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} /></label>
        <button className="btn yellow" onClick={cargar}>Cargar</button>
      </div>
    </>
  );
}

const ESTADO_PEDIDO: Record<Pedido["estado"], [string, "ok" | "warn" | "bad"]> = {
  pendiente: ["Pendiente", "warn"], ofrecido: ["Ofrecido a compañeros", "warn"], tomado: ["Tomado, falta tráfico", "warn"],
  aprobado: ["Aprobado", "ok"], rechazado: ["Rechazado", "bad"], entregado: ["Entregado", "ok"], cancelado: ["Cancelado", "bad"],
};

function Pedidos(p: { fuente: Fuente; sesion: Sesion; datos: DatosPapeles; avisar: (s: string) => void }) {
  const [tipo, setTipo] = useState<TipoPedido | null>(null);
  const [detalle, setDetalle] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const hoy = hoyISO();
  const misPlanillas = useMemo(() => new Set(p.datos.planillas.filter((x) => x.fecha >= hoy && !x.franco).map((x) => x.fecha)), [p.datos.planillas, hoy]);

  const mandar = async () => {
    if (!tipo) return;
    if (tipo === "cambio_turno" && !misPlanillas.has(desde)) return p.avisar("Elegí un día en que trabajás");
    if (tipo === "vacaciones" && (!desde || !hasta || hasta < desde)) return p.avisar("Revisá las fechas");
    if (tipo === "parte_enfermo" && !foto) return p.avisar("Sacale una foto al certificado médico");
    const id = crypto.randomUUID();
    const adjuntos: string[] = [];
    if (foto) {
      const ruta = `lineas/${p.sesion.lineaId}/pedidos/${p.sesion.uid}/${id}`;
      await p.fuente.subirArchivo(ruta, foto);
      adjuntos.push(ruta);
    }
    const pedido: Pedido = {
      id, lineaId: p.sesion.lineaId, choferId: p.sesion.uid, choferNombre: p.sesion.nombre, tipo, detalle, adjuntos, estado: estadoInicial(tipo), creadoEn: Date.now(),
      ...(tipo === "vacaciones" ? { desde, hasta } : {}),
      ...(tipo === "cambio_turno" ? { fecha: desde } : {}),
      ...(tipo === "parte_enfermo" ? { desde: hoy } : {}),
    };
    await p.fuente.crear(p.sesion.lineaId, "pedidos", pedido);
    setTipo(null);
    setDetalle("");
    setFoto(null);
    p.avisar(tipo === "cambio_turno" ? "Tu turno quedó ofrecido a los compañeros" : "Pedido enviado");
  };

  const accion = (x: Pedido, a: "tomar" | "soltar" | "cancelar") =>
    p.fuente.accionPedido(p.sesion.lineaId, x, p.sesion, a).then(() => p.avisar(a === "tomar" ? "Lo tomaste: falta que tráfico lo apruebe" : "Listo")).catch((e: Error) => p.avisar(e.message));

  return (
    <>
      {p.datos.ofrecidos.length > 0 && (
        <div className="card">
          <span className="eyebrow">Compañeros que ofrecen su turno</span>
          <div className="list">
            {p.datos.ofrecidos.map((x) => (
              <div className="it" key={x.id}>
                <div style={{ flex: 1 }}><b>{x.choferNombre}</b> · {x.fecha && fechaLinda(x.fecha)}<div className="muted">{x.detalle || "Sin motivo"}</div></div>
                <button className="btn yellow" onClick={() => accion(x, "tomar")}>Lo tomo</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card">
        <span className="eyebrow">Pedir</span>
        <div className="types">
          {(["certificado_trabajo", "certificado_haberes", "parte_enfermo", "vacaciones", "cambio_turno"] as TipoPedido[]).map((t) => (
            <button key={t} className="type" aria-pressed={tipo === t} onClick={() => setTipo(t)} style={{ fontSize: 13 }}>{NOMBRE_PEDIDO[t]}</button>
          ))}
        </div>
        {tipo && (
          <>
            {tipo === "cambio_turno" && (
              <label className="f" htmlFor="p-dia">Qué día ofrecés
                <select id="p-dia" value={desde} onChange={(e) => setDesde(e.target.value)}>
                  <option value="">Elegí</option>
                  {[...misPlanillas].sort().map((f) => <option key={f} value={f}>{fechaLinda(f)}</option>)}
                </select>
              </label>
            )}
            {tipo === "vacaciones" && (
              <div className="grid2">
                <label className="f" htmlFor="p-desde">Desde<input id="p-desde" type="date" min={hoy} value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
                <label className="f" htmlFor="p-hasta">Hasta<input id="p-hasta" type="date" min={desde || hoy} value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
              </div>
            )}
            {tipo === "parte_enfermo" && (
              <label className="f" htmlFor="p-foto">Foto del certificado médico<input id="p-foto" type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} /></label>
            )}
            <label className="f" htmlFor="p-detalle">{tipo === "cambio_turno" ? "Motivo (lo ven tus compañeros)" : "Algo más (opcional)"}
              <input id="p-detalle" type="text" maxLength={500} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
            </label>
            <button className="btn yellow" onClick={mandar}>{tipo === "cambio_turno" ? "Ofrecer a los compañeros" : "Mandar a personal"}</button>
          </>
        )}
      </div>
      <div className="card">
        <span className="eyebrow">Tus pedidos</span>
        {p.datos.pedidos.length === 0 && !p.datos.ofrecidos.some((x) => x.tomadoPor === p.sesion.uid) ? <div className="muted">No hiciste pedidos todavía.</div> : (
          <div className="list">
            {p.datos.pedidos.map((x) => (
              <div className="it" key={x.id}>
                <div style={{ flex: 1 }}>
                  <b>{NOMBRE_PEDIDO[x.tipo]}</b>{x.fecha && ` · ${fechaLinda(x.fecha)}`}{x.desde && x.hasta && ` · ${fechaLinda(x.desde)} al ${fechaLinda(x.hasta)}`}
                  {x.tomadoPorNombre && <div className="muted">Lo toma {x.tomadoPorNombre}</div>}
                  {x.respuesta && <div className="muted">Respuesta: {x.respuesta}</div>}
                  {x.rutaRespuesta && <button className="btn alt" style={{ marginTop: 4 }} onClick={async () => { const u = await p.fuente.urlAdjunto(x.rutaRespuesta!); if (u) window.open(u, "_blank", "noopener"); }}>Ver PDF</button>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  <span className={`chip ${ESTADO_PEDIDO[x.estado][1]}`}>{ESTADO_PEDIDO[x.estado][0]}</span>
                  {["pendiente", "ofrecido", "tomado"].includes(x.estado) && <button className="btn alt" onClick={() => accion(x, "cancelar")}>Cancelar</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Comunicados(p: { fuente: Fuente; sesion: Sesion; datos: DatosPapeles }) {
  // Al ver la lista, los avisos quedan leídos (la empresa ve quién los leyó).
  useEffect(() => {
    for (const c of p.datos.comunicados) if (!c.leidos.includes(p.sesion.uid)) void p.fuente.marcarLeido(p.sesion.lineaId, c.id, p.sesion.uid);
  }, [p.datos.comunicados, p.fuente, p.sesion]);
  return (
    <div className="card">
      <span className="eyebrow">Avisos de la empresa</span>
      {p.datos.comunicados.length === 0 ? <div className="muted">No hay avisos.</div> : (
        <div className="list">
          {p.datos.comunicados.map((c) => (
            <div className="it" key={c.id} style={{ display: "block" }}>
              <div className="row"><b>{c.importante ? "⚠ " : ""}{c.titulo}</b><span className="muted">{new Date(c.creadoEn).toLocaleDateString("es-AR")}</span></div>
              <div style={{ whiteSpace: "pre-wrap" }}>{c.texto}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
