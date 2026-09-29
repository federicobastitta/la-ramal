import { useEffect, useMemo, useState } from "react";
import { NOMBRE_ESTADO, NOMBRE_TIPO, type AlertaPanico, type Area, type EstadoReporte, type Reporte } from "@la-ramal/nucleo";
import { crearFuente, type Fuente, type Sesion } from "../datos";
import { Adjunto } from "../compartido/Adjunto";
import { hora, useAviso } from "../compartido/useAviso";

const NOMBRE_AREA: Record<Area, string> = { taller: "Taller", trafico: "Tráfico", siniestros: "Siniestros", seguridad: "Seguridad" };

/** Qué hace el botón principal de cada reporte, según el área que lo recibe. */
const ACCION: Record<Area, { texto: string; estado: EstadoReporte }> = {
  taller: { texto: "Mandar al taller", estado: "en_taller" },
  trafico: { texto: "Publicar a la flota", estado: "publicado" },
  siniestros: { texto: "Tomar el caso", estado: "caso_tomado" },
  seguridad: { texto: "Tomar el caso", estado: "caso_tomado" },
};

export function Panel() {
  const [fuente, setFuente] = useState<Fuente | null>(null);
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [alertas, setAlertas] = useState<AlertaPanico[]>([]);
  const [filtro, setFiltro] = useState<Area | "todas">("todas");
  const aviso = useAviso();

  useEffect(() => {
    void crearFuente("panel").then(async (f) => {
      setFuente(f);
      setSesion(await f.sesion());
    });
  }, []);

  useEffect(() => {
    if (!fuente || !sesion) return;
    const a = fuente.escucharReportes(sesion.lineaId, setReportes);
    const b = fuente.escucharPanicos(sesion.lineaId, setAlertas);
    return () => {
      a();
      b();
    };
  }, [fuente, sesion]);

  // Una alerta nueva suena (si el navegador ya tuvo un toque del operador) y cambia el título de la pestaña.
  useEffect(() => {
    document.title = alertas.length ? `(${alertas.length}) PÁNICO · LA RAMAL` : "Panel de la línea · LA RAMAL";
  }, [alertas.length]);

  const sinAtender = reportes.filter((r) => r.estado === "recibido");
  const visibles = useMemo(() => reportes.filter((r) => filtro === "todas" || r.clasificacion?.area === filtro), [reportes, filtro]);
  const coches = useMemo(() => {
    // Semáforo: rojo si el coche tiene un reporte urgente del taller sin cerrar; amarillo con aviso; verde el resto.
    const m = new Map<string, "ok" | "warn" | "bad">();
    for (const r of reportes) {
      if (r.clasificacion?.area !== "taller" || r.estado === "cerrado") continue;
      const nivel = r.clasificacion.urgencia === "alta" ? "bad" : "warn";
      if (m.get(r.cocheId) !== "bad") m.set(r.cocheId, nivel);
    }
    return [...m.entries()];
  }, [reportes]);

  if (sesion === undefined) return <div className="cargando">Abriendo el panel…</div>;
  if (!sesion || !fuente || sesion.rol === "chofer") return <div className="cargando">Este usuario no tiene acceso al panel de la línea.</div>;

  return (
    <div className="panel">
      <div className="kpis">
        <div className="kpi"><div className="muted">Reportes sin atender</div><div className="big" style={{ color: sinAtender.length ? "var(--warn)" : undefined }}>{sinAtender.length}</div></div>
        <div className="kpi"><div className="muted">Alertas de pánico</div><div className="big" style={{ color: alertas.length ? "var(--bad)" : undefined }}>{alertas.length}</div></div>
        <div className="kpi"><div className="muted">Urgentes</div><div className="big">{reportes.filter((r) => r.clasificacion?.urgencia === "alta" && r.estado !== "cerrado").length}</div></div>
        <div className="kpi"><div className="muted">Coches con aviso</div><div className="big">{coches.length}</div></div>
      </div>

      <div className="col">
        {alertas.map((a) => {
          const u = a.ubicaciones.at(-1);
          return (
            <div className="alarm" role="alert" key={a.id}>
              <h3>PÁNICO · {a.cocheId}{a.coaccion ? " · CANCELADA BAJO COACCIÓN" : ""}</h3>
              <div>
                Desde las {hora(a.desde)} · {a.ubicaciones.length} posiciones
                {u && <> · última ±{u.precisionM} m a las {hora(u.en)} · <a style={{ color: "#fff", fontWeight: 700 }} href={`https://www.google.com/maps?q=${u.lat},${u.lng}`} target="_blank" rel="noreferrer">abrir en el mapa</a></>}
              </div>
              {a.coaccion && <div><b>El chofer la "canceló" con el PIN de coacción: puede estar obligado. No lo llamen al celular; manden ayuda.</b></div>}
              {a.estado === "activa" ? (
                <button className="btn yellow" onClick={() => fuente.confirmarPanico(sesion.lineaId, a.id).then(() => aviso.avisar("El chofer ya ve que la ayuda va en camino"))}>
                  Confirmar al chofer: la ayuda va en camino
                </button>
              ) : <b>Confirmada al chofer.</b>}
            </div>
          );
        })}

        <div className="card">
          <div className="row" style={{ flexWrap: "wrap" }}>
            <h3>Reportes de los choferes</h3>
            <label className="f" style={{ flexDirection: "row", alignItems: "center", gap: 6 }} htmlFor="filtro-area">Área
              <select id="filtro-area" value={filtro} onChange={(e) => setFiltro(e.target.value as Area | "todas")} style={{ width: "auto" }}>
                <option value="todas">Todas</option>
                {Object.entries(NOMBRE_AREA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          {visibles.length === 0 ? <div className="muted">Todavía no llegaron reportes. Mandá uno desde la app del chofer: aparece acá al instante.</div> : (
            <div className="list">
              {visibles.map((r) => {
                const area = r.clasificacion?.area ?? "trafico";
                return (
                  <div className="it" key={r.id}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div className="row">
                        <b>{NOMBRE_TIPO[r.tipo]} · para {NOMBRE_AREA[area]}</b>
                        <span className="muted">{hora(r.creadoEn)}</span>
                      </div>
                      {r.clasificacion && (
                        <div className="row" style={{ justifyContent: "flex-start", gap: 6 }}>
                          <span className={`chip ${r.clasificacion.urgencia === "alta" ? "bad" : r.clasificacion.urgencia === "media" ? "warn" : "ok"}`}>Urgencia {r.clasificacion.urgencia}</span>
                          <span className="muted">{r.clasificacion.origen === "ia" ? "clasificado por IA" : "clasificado por reglas"}</span>
                        </div>
                      )}
                      {r.texto && <div>{r.texto}</div>}
                      {r.adjuntos.length > 0 && <div className="thumbs">{r.adjuntos.map((a) => <Adjunto key={a.ruta} fuente={fuente} a={a} />)}</div>}
                      <div className="muted">
                        {r.cocheId} · ±{r.ubicacion.precisionM} m · <a className="enlace" href={`https://www.google.com/maps?q=${r.ubicacion.lat},${r.ubicacion.lng}`} target="_blank" rel="noreferrer">ver en el mapa</a>
                      </div>
                      <div className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
                        <span className={`chip ${r.estado === "recibido" ? "warn" : "ok"}`}>{NOMBRE_ESTADO[r.estado]}</span>
                        {r.estado === "recibido" && <button className="btn" onClick={() => fuente.cambiarEstadoReporte(sesion.lineaId, r.id, ACCION[area].estado).then(() => aviso.avisar("Listo: el chofer lo ve en «Tus reportes»"))}>{ACCION[area].texto}</button>}
                        {r.estado !== "recibido" && r.estado !== "cerrado" && <button className="btn alt" onClick={() => fuente.cambiarEstadoReporte(sesion.lineaId, r.id, "cerrado")}>Cerrar</button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="col">
        <div className="card">
          <h3>Semáforo de la flota</h3>
          <div className="muted">Rojo: falla urgente sin cerrar (no debería salir). Amarillo: tiene un aviso. Los coches sin avisos no aparecen.</div>
          {coches.length === 0 ? <div className="muted">Ningún coche con avisos abiertos.</div> : (
            <div className="fleet">{coches.map(([c, s]) => <div key={c} className="bus" style={{ background: `var(--soft-${s})`, color: `var(--${s})` }}>{c.replace("Interno ", "")}</div>)}</div>
          )}
        </div>
        <div className="card">
          <h3>Modo</h3>
          <div className="muted">
            {fuente.modo === "demo"
              ? "Demo con datos de ejemplo: todo queda solo en este navegador."
              : "Conectado a Firebase: todo en vivo."}
          </div>
        </div>
      </div>
      {aviso.texto && <div className="toast" role="status">{aviso.texto}</div>}
    </div>
  );
}
