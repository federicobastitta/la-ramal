import { useEffect, useMemo, useRef, useState, type PointerEvent as PE, type ReactElement } from "react";
import { MAX_BYTES_ADJUNTO, NOMBRE_ESTADO, NOMBRE_TIPO, NuevoReporte, TIPOS_REPORTE, progresoPanico, type Adjunto as TAdjunto, type Reporte, type TipoReporte } from "@la-ramal/nucleo";
import type { Cola } from "@la-ramal/nucleo";
import { crearFuente, type ArchivoLocal, type Fuente, type Sesion } from "../datos";
import { crearColaDeReportes, type EnvioReporte } from "../datos/cola-idb";
import { useUbicacion } from "../dispositivo/ubicacion";
import { useGrabadora } from "../dispositivo/grabadora";
import { BotonBluetooth, type EstadoBoton } from "../dispositivo/boton-bluetooth";
import { Icono } from "../compartido/iconos";
import { Adjunto } from "../compartido/Adjunto";
import { haceCuanto, hora, useAviso } from "../compartido/useAviso";
import { usePanico } from "./usePanico";
import { UBICACION_DEMO } from "../datos/demo";

type Tab = "inicio" | "reportar" | "calle" | "papeles" | "terminal";
type Borrador = { tipo: TipoReporte; archivos: { tipo: TAdjunto["tipo"]; blob: Blob; url: string }[] };

export function AppChofer() {
  const [fuente, setFuente] = useState<Fuente | null>(null);
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  const [cola, setCola] = useState<Cola<EnvioReporte> | null>(null);
  const [tab, setTab] = useState<Tab>("inicio");
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [enCola, setEnCola] = useState(0);
  const [boton, setBoton] = useState<{ estado: EstadoBoton; bateria: number | null }>({ estado: "desconectado", bateria: null });
  const aviso = useAviso();
  const panico = usePanico(fuente, sesion ?? null);
  const bt = useRef<BotonBluetooth | null>(null);

  useEffect(() => {
    void crearFuente("chofer").then(async (f) => {
      setFuente(f);
      setSesion(await f.sesion());
      setCola(crearColaDeReportes(f));
    });
  }, []);

  useEffect(() => {
    if (!fuente || !sesion) return;
    return fuente.escucharReportes(sesion.lineaId, setReportes);
  }, [fuente, sesion]);

  useEffect(() => {
    if (!cola) return;
    const medir = () => void cola.cantidad().then(setEnCola);
    medir();
    const id = setInterval(medir, 3000);
    return () => clearInterval(id);
  }, [cola]);

  // El botón Bluetooth alimenta la misma máquina de estados que la pantalla.
  useEffect(() => {
    bt.current = new BotonBluetooth(
      (e) => panico.despachar(e),
      (b) => setBoton({ estado: b.estado, bateria: b.bateria }),
    );
    setBoton({ estado: bt.current.estado, bateria: null });
    return () => bt.current?.desvincular();
  }, [panico.despachar]);

  if (sesion === undefined) return <div className="cargando">Abriendo LA RAMAL…</div>;
  if (!sesion || !fuente) return <SinAlta />;

  const pantallas: Record<Tab, ReactElement> = {
    inicio: <Inicio sesion={sesion} panico={panico} boton={boton} vincular={() => bt.current?.vincular().catch((e: Error) => aviso.avisar(e.message))} ir={setTab} avisar={aviso.avisar} />,
    reportar: <Reportar fuente={fuente} sesion={sesion} cola={cola} enCola={enCola} mios={reportes.filter((r) => r.choferId === sesion.uid)} avisar={aviso.avisar} />,
    calle: <Calle reportes={reportes} ir={setTab} />,
    papeles: <Papeles />,
    terminal: <Terminal />,
  };
  const tabs: [Tab, string, keyof typeof Icono][] = [["inicio", "Inicio", "inicio"], ["reportar", "Reportar", "camara"], ["calle", "Calle", "calle"], ["papeles", "Papeles", "papel"], ["terminal", "Terminal", "taza"]];

  return (
    <>
      <div className="phone">
        <div className="bar">
          <div>
            <div className="who">{sesion.lineaNombre} · {sesion.cocheId}</div>
            <h2>Hola, {sesion.nombre.split(" ")[0]}</h2>
          </div>
          <span className={`chip ${boton.estado === "conectado" ? "ok" : "warn"}`}>
            <span className="dot" />
            {boton.estado === "conectado" ? `Botón conectado${boton.bateria !== null ? ` · ${boton.bateria}%` : ""}` : boton.estado === "sin_soporte" ? "Botón: usá Chrome" : "Botón sin conectar"}
          </span>
        </div>
        <div className="screen">{pantallas[tab]}</div>
        <nav className="tabs" aria-label="Secciones">
          {tabs.map(([k, t, ic]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}>
              {Icono[ic]!()}
              {t}
            </button>
          ))}
        </nav>
      </div>
      {aviso.texto && <div className="toast" role="status">{aviso.texto}</div>}
    </>
  );
}

function SinAlta() {
  return (
    <div className="phone"><div className="screen"><div className="card">
      <h3>Todavía no estás dado de alta</h3>
      <p>Pedile a tráfico de tu línea que te agregue con tu número de celular. Cuando te den el alta, volvé a abrir la app.</p>
    </div></div></div>
  );
}

function Inicio(p: { sesion: Sesion; panico: ReturnType<typeof usePanico>; boton: { estado: EstadoBoton }; vincular: () => void; ir: (t: Tab) => void; avisar: (s: string) => void }) {
  const { estado, despachar, cancelar } = p.panico;
  const [pin, setPin] = useState("");
  const [, refrescar] = useState(0);
  useEffect(() => {
    if (estado.fase !== "apretando") return;
    const id = setInterval(() => refrescar((n) => n + 1), 40);
    return () => clearInterval(id);
  }, [estado.fase]);

  const apretar = (e: PE) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    despachar({ t: "presionar", en: Date.now() });
  };
  const soltar = () => despachar({ t: "soltar", en: Date.now() });

  return (
    <>
      {estado.fase === "activa" || estado.fase === "enviando" ? (
        <div className="alarm" role="alert">
          <h3>{estado.fase === "enviando" ? "Mandando la alerta…" : "Alerta de pánico enviada"}</h3>
          <div>
            {estado.fase === "enviando"
              ? "Si no hay señal, se sigue intentando sola."
              : <>La terminal ve tu ubicación desde las {hora(estado.desde)}{" · "}{estado.confirmada ? <b>Tráfico confirmó: la ayuda va en camino.</b> : "Esperando que la terminal confirme…"}</>}
          </div>
          {estado.fase === "activa" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await cancelar(pin);
                setPin("");
                p.avisar(r === "cerrada" ? "Alerta cancelada" : "PIN incorrecto: la alerta sigue activa");
              }}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <label className="f" htmlFor="pin">Para cancelar, tu PIN{p.sesion.uid.startsWith("demo") ? " (demo: 7391)" : ""}
                <input id="pin" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
              </label>
              <button className="btn alt" type="submit">Cancelar alerta</button>
            </form>
          )}
        </div>
      ) : (
        <button
          className="panic"
          data-fase={estado.fase}
          onPointerDown={apretar}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !e.repeat && despachar({ t: "presionar", en: Date.now() })}
          onKeyUp={(e) => (e.key === " " || e.key === "Enter") && soltar()}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Botón de pánico: mantener apretado 2 segundos o dos toques rápidos"
        >
          <span className="fill" style={{ transform: `scaleX(${progresoPanico(estado, Date.now())})` }} />
          <span>Mantené apretado 2 s · PÁNICO</span>
        </button>
      )}

      {p.boton.estado !== "conectado" && p.boton.estado !== "sin_soporte" && (
        <div className="card">
          <div className="row"><b>Botón de pánico Bluetooth</b><button className="btn yellow" onClick={p.vincular}>Vincular</button></div>
          <div className="muted">El botón chico que va en el tablero o en el llavero. Se vincula una vez y se reconecta solo.</div>
        </div>
      )}

      <div className="card">
        <div className="row"><span className="eyebrow">Tu planilla de hoy</span><span className="chip warn">Ejemplo</span></div>
        <div className="row">
          <div><div className="big">05:10</div><div className="muted">Salida de la cabecera</div></div>
          <div style={{ textAlign: "right" }}><div className="big">4</div><div className="muted">vueltas</div></div>
        </div>
        <div className="muted">La planilla real llega cuando la línea cargue los diagramas (etapa 2).</div>
      </div>

      <div className="grid2">
        <button className="act primary" onClick={() => p.ir("reportar")}>{Icono.camara!()}Reportar con foto</button>
        <button className="act" onClick={() => p.ir("reportar")}>{Icono.llave!()}Falla del coche</button>
        <button className="act" onClick={() => p.ir("calle")}>{Icono.calle!()}Cortes en vivo</button>
        <button className="act" onClick={() => p.ir("terminal")}>{Icono.taza!()}Terminal</button>
      </div>
    </>
  );
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg" };

function Reportar(p: { fuente: Fuente; sesion: Sesion; cola: Cola<EnvioReporte> | null; enCola: number; mios: Reporte[]; avisar: (s: string) => void }) {
  const [b, setB] = useState<Borrador>({ tipo: "coche", archivos: [] });
  const [texto, setTexto] = useState("");
  const [mandando, setMandando] = useState(false);
  const gpsReal = useUbicacion();
  // En la demo, si el navegador no da el GPS, se usa un punto de ejemplo (y se avisa). En producción nunca.
  const deEjemplo = p.fuente.modo === "demo" && !gpsReal.ubicacion && !!gpsReal.error;
  const gps = deEjemplo ? { ubicacion: { ...UBICACION_DEMO, en: Date.now() }, error: null } : gpsReal;
  const grab = useGrabadora(30);

  const sumar = (tipo: TAdjunto["tipo"], blob: Blob | null | undefined) => {
    if (!blob) return;
    if (blob.size > MAX_BYTES_ADJUNTO) return p.avisar("El archivo pesa más de 50 MB: grabá un video más corto");
    if (b.archivos.length >= 6) return p.avisar("Hasta 6 archivos por reporte");
    setB((x) => ({ ...x, archivos: [...x.archivos, { tipo, blob, url: URL.createObjectURL(blob) }] }));
  };

  const enviar = async () => {
    if (!p.cola) return;
    if (!gps.ubicacion) return p.avisar(gps.error ?? "Esperando el GPS… probá en unos segundos");
    setMandando(true);
    const id = crypto.randomUUID();
    const archivos: ArchivoLocal[] = b.archivos.map((a, i) => ({
      ruta: `lineas/${p.sesion.lineaId}/reportes/${p.sesion.uid}/${id}/${i}.${EXT[a.blob.type.split(";")[0]!] ?? "bin"}`,
      blob: a.blob,
    }));
    const reporte = NuevoReporte.safeParse({
      id,
      lineaId: p.sesion.lineaId,
      cocheId: p.sesion.cocheId,
      choferId: p.sesion.uid,
      tipo: b.tipo,
      texto,
      ubicacion: gps.ubicacion,
      creadoEn: Date.now(),
      adjuntos: b.archivos.map((a, i) => ({ tipo: a.tipo, ruta: archivos[i]!.ruta, mime: a.blob.type || "application/octet-stream", bytes: a.blob.size })),
    });
    if (!reporte.success) {
      setMandando(false);
      return p.avisar("Revisá el reporte: " + reporte.error.issues[0]?.message);
    }
    await p.cola.encolar(id, { reporte: reporte.data, archivos });
    const r = await p.cola.vaciar();
    setMandando(false);
    b.archivos.forEach((a) => URL.revokeObjectURL(a.url));
    setB({ tipo: b.tipo, archivos: [] });
    setTexto("");
    p.avisar(r.enviados.includes(id) ? "Enviado a la línea" : "Sin señal: queda guardado y sale solo cuando vuelva");
  };

  return (
    <>
      <div className="card">
        <h3>¿Qué querés reportar?</h3>
        <div className="types">
          {TIPOS_REPORTE.map((t) => (
            <button key={t} className="type" aria-pressed={b.tipo === t} onClick={() => setB((x) => ({ ...x, tipo: t }))}>{NOMBRE_TIPO[t]}</button>
          ))}
        </div>
        {b.tipo === "agresor" && <p style={{ color: "var(--bad)", margin: 0 }}><b>Si estás en peligro, usá primero el botón de pánico.</b> Sacá la foto solo si es seguro.</p>}
        <div className="media">
          <label>{Icono.camara!()}Foto<input type="file" accept="image/*" capture="environment" onChange={(e) => { sumar("foto", e.target.files?.[0]); e.target.value = ""; }} /></label>
          <label>{Icono.video!()}Video<input type="file" accept="video/*" capture="environment" onChange={(e) => { sumar("video", e.target.files?.[0]); e.target.value = ""; }} /></label>
          <button type="button" className="type" onClick={async () => (grab.grabando ? grab.parar() : sumar("audio", await grab.grabar()))}>
            {Icono.micro!()}<br />{grab.grabando ? `Parar (${grab.segundos}s)` : "Grabar el ruido"}
          </button>
        </div>
        {grab.error && <div className="muted">{grab.error}</div>}
        {b.archivos.length > 0 && (
          <div className="thumbs">
            {b.archivos.map((a, i) => a.tipo === "foto" ? <img key={i} src={a.url} alt="Foto adjunta" /> : a.tipo === "video" ? <video key={i} src={a.url} style={{ width: 96, borderRadius: 8 }} /> : <audio key={i} src={a.url} controls style={{ width: 200 }} />)}
          </div>
        )}
        <label className="f" htmlFor="r-texto">Contalo en pocas palabras
          <textarea id="r-texto" rows={2} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: el freno delantero hace ruido al frenar fuerte" />
        </label>
        <div className="muted">
          {deEjemplo ? <>Ubicación de ejemplo: este navegador no da el GPS. En el celular va la ubicación real.</> : gps.ubicacion ? <>Ubicación lista (±{gps.ubicacion.precisionM} m). Va directo a la línea con {p.sesion.cocheId}, la hora y el lugar.</> : gps.error ?? "Buscando tu ubicación…"}
        </div>
        <button className="btn yellow" onClick={enviar} disabled={mandando || !p.cola}>{mandando ? "Mandando…" : "Enviar a la línea"}</button>
        {p.enCola > 0 && <div className="chip warn" style={{ alignSelf: "flex-start" }}><span className="dot" />{p.enCola} esperando señal</div>}
      </div>

      <div className="card">
        <span className="eyebrow">Tus reportes</span>
        {p.mios.length === 0 ? <div className="muted">Todavía no mandaste reportes. Cuando mandes uno, acá ves qué hizo la línea.</div> : (
          <div className="list">
            {p.mios.map((r) => (
              <div className="it" key={r.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row"><b>{NOMBRE_TIPO[r.tipo]}</b><span className={`chip ${r.estado === "recibido" ? "warn" : "ok"}`}>{NOMBRE_ESTADO[r.estado]}</span></div>
                  {r.texto && <div>{r.texto}</div>}
                  <div className="thumbs">{r.adjuntos.map((a) => <Adjunto key={a.ruta} fuente={p.fuente} a={a} chico />)}</div>
                  <div className="muted">{r.cocheId} · {hora(r.creadoEn)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Calle({ reportes, ir }: { reportes: Reporte[]; ir: (t: Tab) => void }) {
  const ahora = Date.now();
  const enLaCalle = useMemo(
    () => reportes.filter((r) => ["corte", "embotellamiento", "choque"].includes(r.tipo) && ahora - r.creadoEn < 3 * 3_600_000),
    [reportes, ahora],
  );
  return (
    <div className="card">
      <span className="eyebrow">Cortes y desvíos en vivo · últimas 3 horas</span>
      {enLaCalle.length === 0 ? <div className="muted">Nadie reportó cortes ni choques en las últimas 3 horas.</div> : (
        <div className="list">
          {enLaCalle.map((r) => (
            <div className="it" key={r.id}>
              <div style={{ flex: 1 }}>
                <b>{NOMBRE_TIPO[r.tipo]}</b>
                {r.texto && <div>{r.texto}</div>}
                <div className="muted">{haceCuanto(r.creadoEn, ahora)} · {r.cocheId} · <a className="enlace" href={`https://www.google.com/maps?q=${r.ubicacion.lat},${r.ubicacion.lng}`} target="_blank" rel="noreferrer">ver en el mapa</a></div>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="btn alt" onClick={() => ir("reportar")}>Avisar un corte</button>
    </div>
  );
}

function Papeles() {
  return (
    <>
      <div className="card"><div className="row"><span className="eyebrow">Recibos de sueldo</span><span className="chip warn">Etapa 2</span></div>
        <div className="muted">Acá van a estar tus recibos firmados, con la conformidad desde la app.</div></div>
      <div className="card"><div className="row"><span className="eyebrow">Tus certificados</span><span className="chip warn">Etapa 2</span></div>
        <div className="muted">Licencia, psicofísico y cursos, con aviso antes de que venzan. Pedido de certificados y parte de enfermo con foto.</div></div>
    </>
  );
}

function Terminal() {
  return (
    <>
      <div className="card"><div className="row"><span className="eyebrow">Truco</span><span className="chip warn">Etapa 2</span></div>
        <div className="muted">Partida libre y campeonato por horarios, con aviso cuando tu rival está parado. Solo con el coche parado.</div></div>
      <div className="card"><div className="row"><span className="eyebrow">Prode, cumpleaños y dónde comer</span><span className="chip warn">Etapa 2</span></div>
        <div className="muted">El prode de la cabecera, los saludos de cumpleaños y los lugares con descuento para choferes.</div></div>
    </>
  );
}
