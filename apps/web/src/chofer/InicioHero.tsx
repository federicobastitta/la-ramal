import { useEffect, useMemo, useState } from "react";
import { aMinutos, estimarSueldo, type Escala, type Planilla, type Recibo } from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { hoyISO, plata } from "../compartido/pdf";

/** Hora argentina en minutos desde la medianoche. */
const minutosAR = (d = new Date()) => {
  const [h, m] = d.toLocaleTimeString("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function saludo(min: number) {
  if (min < 12 * 60 && min >= 5 * 60) return "Buen día";
  if (min < 20 * 60 && min >= 12 * 60) return "Buenas tardes";
  return "Buenas noches";
}

const enPalabras = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim());

/**
 * La entrada de la app: saludo según la hora, la fecha, la próxima salida con cuánto falta,
 * lo que lleva ganado en el mes y las vueltas de hoy. Todo en un vistazo.
 */
export function InicioHero(p: { fuente: Fuente; sesion: Sesion; planillas: Planilla[]; recibos: Recibo[]; vueltasHoy: number; ir: (t: "numeros" | "papeles") => void }) {
  const [ahora, setAhora] = useState(() => minutosAR());
  const [escala, setEscala] = useState<Escala | undefined>(undefined);
  useEffect(() => {
    const id = setInterval(() => setAhora(minutosAR()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => p.fuente.escuchar(p.sesion.lineaId, "escalas", [], (xs) => setEscala(xs[0])), [p.fuente, p.sesion]);

  const hoy = hoyISO();
  const planilla = p.planillas.find((x) => x.fecha === hoy);
  const fecha = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  const proxima = useMemo(() => {
    if (!planilla || planilla.franco) return null;
    const v = planilla.vueltas.find((x) => aMinutos(x.sale) >= ahora);
    if (v) return { texto: `Tu próxima salida es a las ${v.sale}`, falta: aMinutos(v.sale) - ahora };
    const ultima = planilla.vueltas.at(-1)!;
    return aMinutos(ultima.llega) > ahora ? { texto: `Última vuelta: llegás ${ultima.llega}`, falta: null } : { texto: "Terminaste tu turno de hoy", falta: null };
  }, [planilla, ahora]);

  const ganado = useMemo(() => {
    if (!escala) return null;
    const anios = [...p.recibos].sort((a, b) => b.periodo.localeCompare(a.periodo)).find((r) => r.antiguedadAnios !== undefined)?.antiguedadAnios ?? 0;
    return estimarSueldo(escala, p.planillas, hoy, anios).total;
  }, [escala, p.recibos, p.planillas, hoy]);

  return (
    <div className="hero">
      <div className="hero-saludo">{saludo(ahora)}, {p.sesion.nombre.split(" ")[0]}</div>
      <div className="hero-fecha">{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</div>
      <div className="hero-salida">
        {planilla?.franco ? (
          <b>Hoy es franco. Disfrutalo.</b>
        ) : proxima ? (
          <>
            <b>{proxima.texto}</b>
            {proxima.falta !== null && <span className="hero-falta">{proxima.falta === 0 ? "ahora" : `en ${enPalabras(proxima.falta)}`}</span>}
          </>
        ) : (
          <b>Tráfico todavía no cargó tu planilla de hoy.</b>
        )}
      </div>
      <div className="hero-datos">
        <button onClick={() => p.ir("numeros")}>
          <span className="hero-num">{ganado !== null ? plata(ganado) : "—"}</span>
          <span className="hero-lbl">llevás este mes</span>
        </button>
        <button onClick={() => p.ir("numeros")}>
          <span className="hero-num">{p.vueltasHoy}{planilla && !planilla.franco ? ` / ${planilla.vueltas.length}` : ""}</span>
          <span className="hero-lbl">vueltas de hoy</span>
        </button>
      </div>
    </div>
  );
}
