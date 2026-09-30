import { useEffect, useMemo, useState } from "react";
import {
  NOMBRE_ESTADO_FRANCO, calendarioDelMes, puedePublicar, puedeTomar, resumenFranco, situacionDelDia,
  type AccionFranco, type Planilla, type PublicacionFranco, type TipoFranco,
} from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { fechaLinda, hoyISO, sumarDias } from "../compartido/pdf";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const moverMes = (mes: string, n: number) => {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Lo publicado en la bolsa (abierto) más lo mío y lo que tomé, en vivo. */
function useBolsa(fuente: Fuente, sesion: Sesion) {
  const [abiertos, setAbiertos] = useState<PublicacionFranco[]>([]);
  const [mios, setMios] = useState<PublicacionFranco[]>([]);
  const [tomados, setTomados] = useState<PublicacionFranco[]>([]);
  useEffect(() => {
    const L = sesion.lineaId;
    const fin = [
      fuente.escuchar(L, "francos", [{ campo: "estado", igual: "publicado" }], setAbiertos),
      fuente.escuchar(L, "francos", [{ campo: "choferId", igual: sesion.uid }], setMios),
      fuente.escuchar(L, "francos", [{ campo: "contraparteId", igual: sesion.uid }], setTomados),
    ];
    return () => fin.forEach((f) => f());
  }, [fuente, sesion]);
  return { abiertos, mios, tomados };
}

/**
 * Bolsa de francos: calendario del mes con mis francos y lo que ofrecen o piden los compañeros.
 * Se toca un día para ofrecer o pedir; lo que publica otro se toma desde ahí. La gerencia aprueba y cambia las planillas.
 */
export function BolsaDeFrancos(p: { fuente: Fuente; sesion: Sesion; planillas: Planilla[]; avisar: (s: string) => void }) {
  const hoy = hoyISO();
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [dia, setDia] = useState<string | null>(null);
  const [aCambioDe, setACambioDe] = useState("");
  const [detalle, setDetalle] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const { abiertos, mios, tomados } = useBolsa(p.fuente, p.sesion);
  const dias = useMemo(() => calendarioDelMes(mes, abiertos.filter((x) => x.choferId !== p.sesion.uid), p.planillas), [mes, abiertos, p.planillas, p.sesion.uid]);

  const situacion = dia ? situacionDelDia(p.planillas, dia) : null;
  const tipo: TipoFranco | null = situacion === "franco" ? "ofrezco" : situacion === "trabaja" ? "pido" : null;
  const delDia = dia ? abiertos.filter((x) => x.fecha === dia && x.choferId !== p.sesion.uid) : [];
  const yaPublique = dia ? mios.some((x) => x.fecha === dia && (x.estado === "publicado" || x.estado === "acordado")) : false;

  const publicar = async () => {
    if (!dia || !tipo) return;
    const ok = puedePublicar(tipo, dia, aCambioDe || undefined, p.planillas, hoy);
    if (!ok.ok) return p.avisar(ok.motivo);
    setOcupado(true);
    try {
      const nueva: PublicacionFranco = {
        id: crypto.randomUUID(), lineaId: p.sesion.lineaId, tipo, choferId: p.sesion.uid, choferNombre: p.sesion.nombre,
        fecha: dia, ...(aCambioDe ? { aCambioDe } : {}), detalle: detalle.trim().slice(0, 300), estado: "publicado", creadoEn: Date.now(),
      };
      await p.fuente.crear(p.sesion.lineaId, "francos", nueva);
      setACambioDe("");
      setDetalle("");
      p.avisar(tipo === "ofrezco" ? "Tu franco quedó ofrecido a los compañeros" : "Tu pedido de franco quedó publicado");
    } catch {
      p.avisar("No se pudo publicar: revisá la conexión");
    } finally {
      setOcupado(false);
    }
  };

  const accion = async (x: PublicacionFranco, a: AccionFranco, texto: string) => {
    setOcupado(true);
    try {
      await p.fuente.accionFranco(p.sesion.lineaId, x, p.sesion, a);
      p.avisar(texto);
    } catch (e) {
      p.avisar(e instanceof Error ? e.message : "No se pudo");
    } finally {
      setOcupado(false);
    }
  };

  const misMovimientos = [...mios, ...tomados.filter((t) => !mios.some((m) => m.id === t.id))]
    .filter((x) => x.estado !== "cancelado" && x.fecha >= sumarDias(hoy, -30))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <>
      <div className="card">
        <span className="eyebrow">Bolsa de francos</span>
        <div className="muted">Ofrecé o pedí un franco a tus compañeros. Cuando alguien lo toma, la gerencia lo aprueba y las planillas se cambian solas.</div>
        <div className="row">
          <button className="btn" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>‹</button>
          <b style={{ textTransform: "capitalize" }}>{nombreMes(mes)}</b>
          <button className="btn" aria-label="Mes siguiente" onClick={() => setMes(moverMes(mes, 1))}>›</button>
        </div>
        <div className="calendario" role="grid" aria-label={`Francos de ${nombreMes(mes)}`}>
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i} className="cal-cab">{d}</div>)}
          {dias.map((d) => (
            <button
              key={d.fecha}
              className={`cal-dia ${d.delMes ? "" : "fuera"} ${d.mio === "franco" ? "franco" : ""} ${d.fecha === hoy ? "hoy" : ""} ${d.fecha === dia ? "elegido" : ""}`}
              onClick={() => setDia(d.fecha)}
              aria-label={`${fechaLinda(d.fecha)}${d.mio === "franco" ? ", tu franco" : d.mio === "trabaja" ? ", trabajás" : ""}${d.ofrecen ? `, ${d.ofrecen} ofrecen franco` : ""}${d.piden ? `, ${d.piden} piden franco` : ""}`}
              aria-pressed={d.fecha === dia}
            >
              <span className="cal-num">{Number(d.fecha.slice(8))}</span>
              {d.mio === "franco" && <span className="cal-f">F</span>}
              <span className="cal-marcas">
                {d.ofrecen > 0 && <span className="cal-ofrecen" title="Ofrecen franco">{d.ofrecen}</span>}
                {d.piden > 0 && <span className="cal-piden" title="Piden franco">{d.piden}</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          <span className="cal-f" style={{ position: "static" }}>F</span> tu franco · <span className="cal-ofrecen">n</span> ofrecen franco · <span className="cal-piden">n</span> piden franco
        </div>
      </div>

      {dia && (
        <div className="card">
          <span className="eyebrow">{fechaLinda(dia)}</span>
          <div>{situacion === "franco" ? "Ese día tenés franco." : situacion === "trabaja" ? "Ese día trabajás." : "Tráfico todavía no cargó tu planilla de ese día."}</div>

          {delDia.length > 0 && <h3 style={{ margin: "6px 0 0" }}>De tus compañeros</h3>}
          {delDia.map((x) => {
            const r = puedeTomar(x, p.sesion.uid, p.planillas);
            return (
              <div className="it" key={x.id} style={{ display: "block" }}>
                <div><b>{resumenFranco(x, fechaLinda)}</b></div>
                {x.detalle && <div className="muted">«{x.detalle}»</div>}
                {r.ok ? (
                  <button className="btn yellow" disabled={ocupado} onClick={() => void accion(x, "tomar", "Listo: ahora lo tiene que aprobar la gerencia")}>
                    {x.tipo === "ofrezco" ? "Tomar este franco" : "Darle mi franco"}
                  </button>
                ) : <div className="muted">{r.motivo}</div>}
              </div>
            );
          })}

          {tipo && dia > hoy && !yaPublique && (
            <>
              <h3 style={{ margin: "6px 0 0" }}>{tipo === "ofrezco" ? "Ofrecer mi franco de ese día" : "Pedir franco ese día"}</h3>
              <label className="f" htmlFor="fr-cambio">
                {tipo === "ofrezco" ? "A cambio, quiero franco el (opcional)" : "Lo devuelvo trabajando el (opcional)"}
                <input id="fr-cambio" type="date" min={sumarDias(hoy, 1)} value={aCambioDe} onChange={(e) => setACambioDe(e.target.value)} />
              </label>
              <label className="f" htmlFor="fr-detalle">Algo para tus compañeros (opcional)<input id="fr-detalle" type="text" maxLength={300} value={detalle} onChange={(e) => setDetalle(e.target.value)} /></label>
              <button className="btn yellow" disabled={ocupado} onClick={() => void publicar()}>{tipo === "ofrezco" ? "Ofrecer a los compañeros" : "Publicar mi pedido"}</button>
            </>
          )}
          {yaPublique && <div className="muted">Ya publicaste algo para ese día: lo ves abajo en «Mis francos».</div>}
        </div>
      )}

      <div className="card">
        <span className="eyebrow">Mis francos</span>
        {misMovimientos.length === 0 ? <div className="muted">Todavía no ofreciste, pediste ni tomaste francos.</div> : misMovimientos.map((x) => {
          const mio = x.choferId === p.sesion.uid;
          return (
            <div className="it" key={x.id} style={{ display: "block" }}>
              <div className="row">
                <b>{mio ? resumenFranco({ ...x, choferNombre: "Vos" }, fechaLinda).replace("Vos ofrece", "Ofrecés").replace("Vos pide", "Pedís") : `Con ${x.choferNombre}: ${fechaLinda(x.fecha)}${x.aCambioDe ? ` y ${fechaLinda(x.aCambioDe)}` : ""}`}</b>
                <span className={`chip ${x.estado === "aprobado" ? "ok" : x.estado === "rechazado" ? "bad" : "warn"}`}>{NOMBRE_ESTADO_FRANCO[x.estado]}</span>
              </div>
              {mio && x.contraparteNombre && <div className="muted">Lo tomó {x.contraparteNombre}</div>}
              {x.respuesta && <div className="muted">Gerencia: {x.respuesta}</div>}
              {mio && (x.estado === "publicado" || x.estado === "acordado") && (
                <button className="btn" disabled={ocupado} onClick={() => void accion(x, "cancelar", "Cancelado")}>Cancelar</button>
              )}
              {!mio && x.estado === "acordado" && (
                <button className="btn" disabled={ocupado} onClick={() => void accion(x, "soltar", "Lo soltaste: vuelve a la bolsa")}>Soltar</button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
