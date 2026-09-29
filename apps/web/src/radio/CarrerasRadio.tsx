import { useEffect, useState } from "react";
import { CATEGORIAS, buscarCarreras, conCalendarioLocal, proximasCarreras, type Carrera, type IdCategoria, type SugerenciaCarrera } from "./automovilismo";
import { RADIOS_DE_FUTBOL } from "./futbol";
import type { Emisora } from "./emisoras";

const CLAVE = "la-ramal-categorias";
const leerFavoritas = (): IdCategoria[] => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? "[]") as IdCategoria[];
  } catch {
    return [];
  }
};

const tz = { timeZone: "America/Argentina/Buenos_Aires" } as const;
const cuando = (s: SugerenciaCarrera) => {
  if (s.estado === "en_vivo") return "se está corriendo";
  if (s.carrera.horaConfirmada === false) {
    if (s.estado === "hoy") return "hoy · horario a confirmar";
    const dia = new Date(s.carrera.inicio).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short", ...tz });
    const dias = Math.max(1, Math.round(s.faltaMin / 1440));
    return `${dia} (en ${dias} ${dias === 1 ? "día" : "días"}) · horario a confirmar`;
  }
  const hora = new Date(s.carrera.inicio).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", ...tz });
  if (s.estado === "hoy") return s.faltaMin < 60 ? `larga en ${s.faltaMin} min` : `hoy a las ${hora}`;
  const dia = new Date(s.carrera.inicio).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short", ...tz });
  const dias = Math.round(s.faltaMin / 1440);
  return `${dia}, ${hora} (en ${dias} ${dias === 1 ? "día" : "días"})`;
};

export function useCarreras(demo: boolean) {
  const [carreras, setCarreras] = useState<Carrera[] | null>(null);
  const [ejemplo, setEjemplo] = useState(false);
  useEffect(() => {
    let vivo = true;
    buscarCarreras()
      .then((c) => vivo && setCarreras(c))
      .catch(() => {
        if (!vivo) return;
        // Sin conexión igual se ven las fechas argentinas del calendario local (reales, sin hora).
        setCarreras(conCalendarioLocal([]));
      });
    return () => {
      vivo = false;
    };
  }, [demo]);
  return { carreras, ejemplo };
}

/** Aviso corto para la barra: una categoría favorita largando en menos de 1 hora o corriendo ahora. */
export function avisoDeCarrera(carreras: Carrera[] | null): SugerenciaCarrera | null {
  const favs = leerFavoritas();
  if (!carreras || !favs.length) return null;
  const s = proximasCarreras(carreras, favs, Date.now()).find((x) => x.favorita);
  if (!s) return null;
  if (s.carrera.horaConfirmada === false) return s.estado === "hoy" ? s : null;
  return s.estado === "en_vivo" || s.faltaMin <= 60 ? s : null;
}

export function CarrerasRadio({ carreras, ejemplo, emisoras, tocar }: { carreras: Carrera[] | null; ejemplo: boolean; emisoras: Emisora[]; tocar: (e: Emisora) => void }) {
  const [favoritas, setFavoritas] = useState<IdCategoria[]>(leerFavoritas());
  const alternar = (id: IdCategoria) => {
    const nuevas = favoritas.includes(id) ? favoritas.filter((x) => x !== id) : [...favoritas, id];
    setFavoritas(nuevas);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(nuevas));
    } catch {
      /* sin almacenamiento */
    }
  };
  const sugerencias = carreras ? proximasCarreras(carreras, favoritas, Date.now()) : [];
  const nombre = (id: IdCategoria) => CATEGORIAS.find((c) => c.id === id)!.nombre;
  const deportivas = RADIOS_DE_FUTBOL.map((id) => emisoras.find((e) => e.id === id)).filter((e): e is Emisora => !!e);

  return (
    <div className="futbol">
      <div className="row" style={{ alignItems: "center" }}>
        <b>Automovilismo</b>
        {ejemplo && <span className="chip warn">carreras de ejemplo</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Tus categorías</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CATEGORIAS.map((c) => (
          <button key={c.id} className="type" aria-pressed={favoritas.includes(c.id)} onClick={() => alternar(c.id)} style={{ padding: "6px 10px", fontSize: 13 }}>
            {c.nombre}
          </button>
        ))}
      </div>
      {carreras === null ? (
        <div className="muted" style={{ fontSize: 13 }}>Buscando las carreras…</div>
      ) : sugerencias.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No hay carreras en los próximos 30 días{carreras.length === 0 && !ejemplo ? " (o no se pudo traer el calendario)" : ""}.</div>
      ) : (
        sugerencias.map((s) => (
          <div key={s.carrera.id} className={`partido ${s.favorita ? "mio" : ""} ${s.estado === "en_vivo" ? "vivo" : ""}`}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--amber)" }}>{nombre(s.carrera.categoria)}</div>
            <b>{s.carrera.nombre}</b>
            <div style={{ fontSize: 13 }}>
              {s.estado === "en_vivo" && <span className="en-vivo">EN VIVO</span>} {cuando(s)}
              {s.carrera.circuito ? ` · ${s.carrera.circuito}` : ""}
            </div>
          </div>
        ))
      )}
      {sugerencias.length > 0 && (
        <>
          <div style={{ fontSize: 13 }}>Escuchala en una radio deportiva:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {deportivas.map((e) => (
              <button key={e.id} className="btn alt" style={{ padding: "8px 10px" }} onClick={() => tocar(e)}>
                {e.nombre} {e.banda} {e.frecuencia}
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>La app no sabe qué radio transmite cada carrera: te sugiere radios deportivas. Fórmula 1: TheSportsDB. Categorías argentinas: {sugerencias.find((x) => x.carrera.fuente)?.carrera.fuente ?? "TheSportsDB"}</div>
        </>
      )}
    </div>
  );
}
