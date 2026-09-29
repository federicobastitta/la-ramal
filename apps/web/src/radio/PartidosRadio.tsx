import { useEffect, useState } from "react";
import { EQUIPOS, RADIOS_DE_FUTBOL, buscarPartidos, partidosDeEjemplo, sugerirPartidos, type Partido, type Sugerencia } from "./futbol";
import type { Emisora } from "./emisoras";

const CLAVE_EQUIPO = "la-ramal-equipo";
const leerEquipo = () => {
  try {
    return localStorage.getItem(CLAVE_EQUIPO);
  } catch {
    return null;
  }
};

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
const cuando = (s: Sugerencia) =>
  s.estado === "en_vivo" ? "se está jugando" : s.faltaMin < 60 ? `empieza en ${s.faltaMin} min` : s.estado === "hoy" ? `hoy a las ${hora(s.partido.inicio)} (en ${Math.round(s.faltaMin / 60)} h)` : new Date(s.partido.inicio).toLocaleDateString("es-AR", { weekday: "long", timeZone: "America/Argentina/Buenos_Aires" }) + ` a las ${hora(s.partido.inicio)}`;

/** Partidos traídos una vez por sesión (TheSportsDB); en la demo, si no hay conexión, partidos de ejemplo. */
export function usePartidos(demo: boolean) {
  const [partidos, setPartidos] = useState<Partido[] | null>(null);
  const [ejemplo, setEjemplo] = useState(false);
  useEffect(() => {
    let vivo = true;
    buscarPartidos()
      .then((p) => vivo && setPartidos(p))
      .catch(() => {
        if (!vivo) return;
        if (demo) {
          setPartidos(partidosDeEjemplo(Date.now()));
          setEjemplo(true);
        } else setPartidos([]);
      });
    return () => {
      vivo = false;
    };
  }, [demo]);
  return { partidos, ejemplo };
}

/** Aviso corto para la barra de la radio cuando juega tu equipo. */
export function avisoDeMiEquipo(partidos: Partido[] | null): Sugerencia | null {
  const equipo = leerEquipo();
  if (!partidos || !equipo) return null;
  const s = sugerirPartidos(partidos, equipo, Date.now())[0];
  return s && s.esMiEquipo && (s.estado === "en_vivo" || s.faltaMin <= 120) ? s : null;
}

export function Futbol({ partidos, ejemplo, emisoras, tocar }: { partidos: Partido[] | null; ejemplo: boolean; emisoras: Emisora[]; tocar: (e: Emisora) => void }) {
  const [equipo, setEquipo] = useState<string | null>(leerEquipo());
  const elegir = (e: string) => {
    setEquipo(e || null);
    try {
      if (e) localStorage.setItem(CLAVE_EQUIPO, e);
      else localStorage.removeItem(CLAVE_EQUIPO);
    } catch {
      /* sin almacenamiento */
    }
  };
  const sugerencias = partidos ? sugerirPartidos(partidos, equipo, Date.now()).slice(0, 4) : [];
  const deFutbol = RADIOS_DE_FUTBOL.map((id) => emisoras.find((e) => e.id === id)).filter((e): e is Emisora => !!e);

  return (
    <div className="futbol">
      <div className="row" style={{ alignItems: "center" }}>
        <b>⚽ Fútbol</b>
        {ejemplo && <span className="chip warn">partidos de ejemplo</span>}
      </div>
      <label className="f" htmlFor="radio-equipo" style={{ fontWeight: 600 }}>Tu equipo
        <select id="radio-equipo" value={equipo ?? ""} onChange={(ev) => elegir(ev.target.value)}>
          <option value="">Elegí tu equipo</option>
          {EQUIPOS.slice().sort((a, b) => a.localeCompare(b)).map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </label>
      {partidos === null ? (
        <div className="muted" style={{ fontSize: 13 }}>Buscando los partidos…</div>
      ) : sugerencias.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No hay partidos de la Liga en los próximos dos días{partidos.length === 0 && !ejemplo ? " (o no se pudo traer el fixture)" : ""}.</div>
      ) : (
        sugerencias.map((s) => (
          <div key={s.partido.id} className={`partido ${s.esMiEquipo ? "mio" : ""} ${s.estado === "en_vivo" ? "vivo" : ""}`}>
            <div>
              <b>{s.partido.local} – {s.partido.visitante}</b>
              <div style={{ fontSize: 13 }}>{s.estado === "en_vivo" && <span className="en-vivo">EN VIVO</span>} {cuando(s)}{s.esMiEquipo ? " · juega tu equipo" : ""}</div>
            </div>
          </div>
        ))
      )}
      {sugerencias.length > 0 && (
        <>
          <div style={{ fontSize: 13 }}>Escuchalo en una radio que suele pasar fútbol:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {deFutbol.map((e) => (
              <button key={e.id} className="btn alt" style={{ padding: "8px 10px" }} onClick={() => tocar(e)}>
                {e.nombre} {e.banda} {e.frecuencia}
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>La app no sabe qué radio transmite cada partido: te sugiere las que suelen pasar fútbol. Fixture de TheSportsDB.</div>
        </>
      )}
    </div>
  );
}
