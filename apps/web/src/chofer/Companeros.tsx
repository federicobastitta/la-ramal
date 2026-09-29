import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { accionesPosibles, jugadaRobot, jugar, nuevaPartida, tablaProde, type Accion, type Carta, type EstadoTruco, type Partido, type Pronostico } from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { hoyISO, sumarDias, fechaLinda } from "../compartido/pdf";
import { useDetenido } from "../dispositivo/detenido";

/** Ventana que se abre y se cierra. */
function Ventana({ titulo, nota, abierta = false, children }: { titulo: string; nota?: string; abierta?: boolean; children: ReactNode }) {
  return (
    <details className="card" open={abierta}>
      <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="ventana-titulo">{titulo}</span>
        {nota && <span className="chip warn" style={{ alignSelf: "flex-start" }}>{nota}</span>}
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>{children}</div>
    </details>
  );
}

export function Companeros(p: { fuente: Fuente; sesion: Sesion; avisar: (s: string) => void }) {
  const demo = p.fuente.modo === "demo";
  const parado = useDetenido(demo);
  return (
    <>
      <Cumpleanos {...p} />
      <Ventana titulo="Truco en vivo" nota="solo con el coche en detención" abierta>
        <Truco detenido={parado.detenido} motivo={parado.motivo} avisar={p.avisar} />
      </Ventana>
      <Ventana titulo="Prode del fútbol argentino" nota={demo ? "ejemplo" : undefined}>
        <Prode nombre={p.sesion.nombre.split(" ")[0]!} avisar={p.avisar} />
      </Ventana>
      <Ventana titulo="Calendario de actividades" nota={demo ? "ejemplo" : undefined}>
        <Calendario avisar={p.avisar} />
      </Ventana>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Cumpleaños: en la demo, hoy cumple Marcela y ya la saludaron algunos compañeros.
// ---------------------------------------------------------------------------------------------
function Cumpleanos(p: { sesion: Sesion; avisar: (s: string) => void }) {
  const [saludos, setSaludos] = useState([
    { de: "Jorge Benítez", texto: "¡Feliz cumple, Marce! Que la pases lindo, hoy te cubro la última vuelta." },
    { de: "Rubén Acosta", texto: "Feliz cumpleaños compañera. Abrazo grande de todo el turno mañana." },
    { de: "Tráfico (ejemplo)", texto: "¡Feliz cumpleaños de parte de toda la cabecera!" },
  ]);
  const [texto, setTexto] = useState("");
  const [enviado, setEnviado] = useState(false);
  return (
    <div className="card" style={{ background: "var(--accent)", color: "var(--on-accent)", borderColor: "transparent" }}>
      <span className="eyebrow" style={{ color: "var(--on-accent)" }}>Hoy cumple años</span>
      <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 26 }}>Marcela Ríos</div>
      <div style={{ fontSize: 14 }}>Turno tarde · Interno 12 · {saludos.length} saludos</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {saludos.map((s, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.55)", borderRadius: 10, padding: "6px 10px", fontSize: 14 }}>
            <b>{s.de}:</b> {s.texto}
          </div>
        ))}
      </div>
      {!enviado ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!texto.trim()) return;
            setSaludos((s) => [...s, { de: p.sesion.nombre, texto: texto.trim() }]);
            setTexto("");
            setEnviado(true);
            p.avisar("Le llegó tu saludo a Marcela");
          }}
          style={{ display: "flex", gap: 6 }}
        >
          <input type="text" aria-label="Tu saludo" placeholder="Escribile un saludo…" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={200} />
          <button className="btn" type="submit">Saludar</button>
        </form>
      ) : (
        <div style={{ fontWeight: 700 }}>Ya la saludaste.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Truco: partida libre contra un compañero (en la demo, "Gómez" es el robot del núcleo).
// ---------------------------------------------------------------------------------------------
const PALO_CORTO: Record<Carta["palo"], string> = { espada: "Espada", basto: "Basto", oro: "Oro", copa: "Copa" };
const COLOR_PALO: Record<Carta["palo"], string> = { espada: "#3a6ea5", basto: "#2f7d4f", oro: "#c28a00", copa: "#c2361a" };

function Naipe({ c, onClick, deshabilitada }: { c: Carta; onClick?: () => void; deshabilitada?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitada || !onClick}
      aria-label={`${c.n} de ${c.palo}`}
      style={{ width: 66, height: 96, borderRadius: 10, border: `2px solid ${COLOR_PALO[c.palo]}`, background: "#fffdf7", color: COLOR_PALO[c.palo], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, fontFamily: "var(--display)", cursor: onClick ? "pointer" : "default", opacity: deshabilitada ? 0.55 : 1 }}
    >
      <span style={{ fontSize: 28, fontWeight: 800 }}>{c.n}</span>
      <span style={{ fontSize: 12, fontWeight: 700 }}>{PALO_CORTO[c.palo]}</span>
    </button>
  );
}

const TEXTO_ACCION = (a: Accion, e: EstadoTruco) => {
  switch (a.t) {
    case "truco": return e.truco.pendiente ? (e.truco.pendiente.nivel === 2 ? "Retruco" : "Vale cuatro") : e.truco.valor === 1 ? "Truco" : e.truco.valor === 2 ? "Retruco" : "Vale cuatro";
    case "envido": return a.tipo === "envido" ? "Envido" : a.tipo === "real" ? "Real envido" : "Falta envido";
    case "quiero": return "Quiero";
    case "noquiero": return "No quiero";
    case "mazo": return "Me voy al mazo";
    case "siguiente": return "Repartir";
    default: return "";
  }
};

function Truco({ detenido, motivo, avisar }: { detenido: boolean; motivo: string; avisar: (s: string) => void }) {
  const [e, setE] = useState<EstadoTruco | null>(null);
  const robot = 1 as const;
  const quienResponde = (x: EstadoTruco) => (x.envido.pendiente ? (x.envido.de === 0 ? 1 : 0) : x.truco.pendiente ? (x.truco.pendiente.de === 0 ? 1 : 0) : x.turno);

  // El robot juega solo, con una pausa para que se vea.
  useEffect(() => {
    if (!e || e.rondaTerminada || e.ganador !== null || !detenido) return;
    if (quienResponde(e) !== robot) return;
    const t = setTimeout(() => {
      const a = jugadaRobot(e, robot);
      if (!a) return;
      const r = jugar(e, robot, a);
      if (r.ok) setE(r.estado);
    }, 900);
    return () => clearTimeout(t);
  }, [e, detenido]);

  const hacer = (a: Accion) => {
    if (!e) return;
    const r = jugar(e, 0, a);
    if (!r.ok) return avisar(r.motivo);
    setE(r.estado);
  };

  if (!e)
    return (
      <>
        <div className={`chip ${detenido ? "ok" : "bad"}`} style={{ alignSelf: "flex-start" }}><span className="dot" />{motivo}</div>
        <div className="notif"><span>Gómez está parado en la terminal y busca rival.</span><button className="btn" disabled={!detenido} onClick={() => setE(nuevaPartida(Math.floor(Math.random() * 1e9)))}>Jugar</button></div>
        <div className="muted">Partida libre: jugás con el que esté parado. En el campeonato por horarios te avisamos cuando tu rival y vos estén detenidos a la vez.</div>
        <CampeonatoTruco />
      </>
    );

  const posibles = accionesPosibles(e, 0);
  const botones = posibles.filter((a) => a.t !== "jugar");
  const puedoJugar = posibles.some((a) => a.t === "jugar") && detenido;
  const baza = e.bazas.at(-1) ?? [];
  // En la mesa, la baza que se está jugando (o la última, si la actual todavía está vacía).
  const nBaza = baza.length > 0 || e.bazas.length === 1 ? e.bazas.length : e.bazas.length - 1;
  const mesa = (baza.length > 0 || e.bazas.length === 1 ? baza : e.bazas.at(-2) ?? []).map((x) => ({ ...x }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row">
        <span className={`chip ${detenido ? "ok" : "bad"}`}><span className="dot" />{detenido ? "Detenido" : "En movimiento: esperá"}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>Vos {e.puntos[0]} · Gómez {e.puntos[1]}</span>
      </div>
      <div className="muted">Gómez tiene {e.cartas[1].length} {e.cartas[1].length === 1 ? "carta" : "cartas"}. {e.truco.valor > 1 ? `La ronda vale ${e.truco.valor}.` : ""}</div>
      <div style={{ background: "var(--bg)", borderRadius: 12, padding: 10, minHeight: 110, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="muted" style={{ width: "100%", fontSize: 12 }}>{["Primera", "Segunda", "Tercera"][nBaza - 1]} baza</span>
        {mesa.length === 0 ? <span className="muted">Mesa vacía</span> : mesa.map((x, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <Naipe c={x.c} />
            <span className="muted" style={{ fontSize: 12 }}>{x.j === 0 ? "vos" : "Gómez"}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {e.cartas[0].map((c, i) => <Naipe key={`${c.n}${c.palo}`} c={c} onClick={() => hacer({ t: "jugar", carta: i })} deshabilitada={!puedoJugar} />)}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {botones.map((a, i) => (
          <button key={i} className={`btn ${a.t === "quiero" || a.t === "siguiente" ? "yellow" : a.t === "mazo" || a.t === "noquiero" ? "alt" : ""}`} onClick={() => hacer(a)} disabled={!detenido}>
            {TEXTO_ACCION(a, e)}
          </button>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        {e.historial.slice(-4).map((h, i) => <div key={i}>{h.replace(/El otro/g, "Gómez")}</div>)}
        {!e.rondaTerminada && quienResponde(e) === 1 && baza.length < 2 && <div>Gómez está pensando…</div>}
      </div>
      {e.ganador !== null && (
        <div className="notif"><span>{e.ganador === 0 ? "¡Ganaste la partida!" : "Ganó Gómez. La próxima."}</span><button className="btn" onClick={() => setE(null)}>Salir</button></div>
      )}
      {e.ganador === null && <button className="btn alt" onClick={() => setE(null)}>Dejar la partida</button>}
    </div>
  );
}

function CampeonatoTruco() {
  const tabla = [["Carlos Medina (vos)", 5], ["Julio Gómez", 4], ["Marcela Ríos", 4], ["Jorge Benítez", 2]] as const;
  return (
    <div>
      <b>Campeonato del turno mañana</b>
      <div className="list">
        {tabla.map(([n, pts], i) => (
          <div className="it" key={n}><b style={{ width: 24 }}>{i + 1}°</b><span style={{ flex: 1 }}>{n}</span><span className="muted">{pts} pts</span></div>
        ))}
      </div>
      <div className="muted">Tu próxima partida: contra Marcela Ríos. Te llega un aviso cuando los dos estén detenidos.</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Prode: fecha de EJEMPLO (los partidos reales se cargarían de la Liga Profesional).
// ---------------------------------------------------------------------------------------------
function Prode({ nombre, avisar }: { nombre: string; avisar: (s: string) => void }) {
  const partidos: Partido[] = useMemo(() => {
    const d = (n: number) => fechaLinda(sumarDias(hoyISO(), n));
    return [
      { id: "p1", local: "Boca Juniors", visitante: "Racing", cuando: `${d(3)} 17:00` },
      { id: "p2", local: "River Plate", visitante: "Independiente", cuando: `${d(3)} 19:30` },
      { id: "p3", local: "San Lorenzo", visitante: "Huracán", cuando: `${d(4)} 15:00` },
      { id: "p4", local: "Vélez", visitante: "Estudiantes", cuando: `${d(4)} 17:30` },
      { id: "p5", local: "Rosario Central", visitante: "Newell's", cuando: `${d(4)} 20:00` },
    ];
  }, []);
  const anterior: Partido[] = [
    { id: "a1", local: "Talleres", visitante: "Belgrano", cuando: "", golesLocal: 2, golesVisitante: 0 },
    { id: "a2", local: "Lanús", visitante: "Banfield", cuando: "", golesLocal: 1, golesVisitante: 1 },
  ];
  const [mios, setMios] = useState<Record<string, { local: string; visitante: string }>>({});
  const tabla = tablaProde(
    [
      { quien: `${nombre} (vos)`, pronosticos: [{ partidoId: "a1", local: 2, visitante: 0 }, { partidoId: "a2", local: 0, visitante: 1 }] },
      { quien: "Gómez", pronosticos: [{ partidoId: "a1", local: 1, visitante: 0 }, { partidoId: "a2", local: 1, visitante: 1 }] },
      { quien: "Ríos", pronosticos: [{ partidoId: "a1", local: 0, visitante: 0 }, { partidoId: "a2", local: 2, visitante: 1 }] },
    ] satisfies { quien: string; pronosticos: Pronostico[] }[],
    anterior,
  );
  return (
    <>
      <b>Próxima fecha (partidos de ejemplo)</b>
      {partidos.map((pa) => (
        <div key={pa.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 44px 12px 44px minmax(0,1fr)", gap: 6, alignItems: "center", fontSize: 14 }}>
          <span style={{ textAlign: "right" }}>{pa.local}</span>
          <input aria-label={`Goles de ${pa.local}`} inputMode="numeric" maxLength={2} value={mios[pa.id]?.local ?? ""} onChange={(ev) => setMios((m) => ({ ...m, [pa.id]: { local: ev.target.value.replace(/\D/g, ""), visitante: m[pa.id]?.visitante ?? "" } }))} style={{ textAlign: "center", padding: 6 }} />
          <span>-</span>
          <input aria-label={`Goles de ${pa.visitante}`} inputMode="numeric" maxLength={2} value={mios[pa.id]?.visitante ?? ""} onChange={(ev) => setMios((m) => ({ ...m, [pa.id]: { local: m[pa.id]?.local ?? "", visitante: ev.target.value.replace(/\D/g, "") } }))} style={{ textAlign: "center", padding: 6 }} />
          <span>{pa.visitante}</span>
        </div>
      ))}
      <button className="btn yellow" onClick={() => avisar(Object.keys(mios).length ? "Pronósticos guardados" : "Cargá al menos un partido")}>Guardar mis pronósticos</button>
      <b>Tabla de la cabecera</b>
      <div className="list">
        {tabla.map((t, i) => <div className="it" key={t.quien}><b style={{ width: 24 }}>{i + 1}°</b><span style={{ flex: 1 }}>{t.quien}</span><span className="muted">{t.puntos} pts · {t.exactos} exactos</span></div>)}
      </div>
      <div className="muted">3 puntos por resultado exacto, 1 por acertar quién gana o el empate.</div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Calendario de actividades de la línea (EJEMPLO).
// ---------------------------------------------------------------------------------------------
function Calendario({ avisar }: { avisar: (s: string) => void }) {
  const hoy = hoyISO();
  const [voy, setVoy] = useState<Record<string, boolean>>({});
  const actividades = [
    { id: "a1", fecha: sumarDias(hoy, 2), hora: "16:00", titulo: "Final del campeonato de truco", lugar: "Terminal Quilmes Oeste", van: 14 },
    { id: "a2", fecha: sumarDias(hoy, 5), hora: "20:00", titulo: "Fútbol: cabecera Quilmes vs cabecera Bernal", lugar: "Cancha de la Av. Calchaquí", van: 22 },
    { id: "a3", fecha: sumarDias(hoy, 9), hora: "12:30", titulo: "Asado por la jubilación de Rubén", lugar: "Quincho del sindicato", van: 31 },
    { id: "a4", fecha: sumarDias(hoy, 12), hora: "10:00", titulo: "Asamblea del gremio", lugar: "Seccional", van: 48 },
  ];
  return (
    <div className="list">
      {actividades.map((a) => (
        <div className="it" key={a.id}>
          <div style={{ width: 64, textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22 }}>{a.fecha.slice(8)}</div>
            <div className="muted" style={{ fontSize: 12 }}>{fechaLinda(a.fecha).split(" ")[0]}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{a.titulo}</b>
            <div className="muted">{a.hora} · {a.lugar} · van {a.van + (voy[a.id] ? 1 : 0)}</div>
          </div>
          <button className={`btn ${voy[a.id] ? "alt" : "yellow"}`} onClick={() => { setVoy((v) => ({ ...v, [a.id]: !v[a.id] })); avisar(voy[a.id] ? "Listo, no vas" : "Anotado: vas"); }}>{voy[a.id] ? "No voy" : "Voy"}</button>
        </div>
      ))}
    </div>
  );
}
