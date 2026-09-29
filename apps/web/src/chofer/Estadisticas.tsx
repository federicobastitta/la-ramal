import { useEffect, useMemo, useState } from "react";
import {
  FRANJAS, PESOS_EXIGENCIA, compararConPlanilla, demorasPorVuelta, diasConvenientes, franjaHoraria, horariosPico, productividad, sectoresTrabados,
  type ConfigRecorrido, type Jornada, type Ping, type Planilla, type VueltaReal,
} from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { idb } from "../datos/idb";
import { fechaLinda, hoyISO, sumarDias } from "../compartido/pdf";
import type { EstadoRecorrido } from "../dispositivo/recorrido-automatico";

/** Barra horizontal simple, a escala del máximo. */
function Barra({ valor, max, etiqueta, texto, tono = "var(--navy)" }: { valor: number; max: number; etiqueta: string; texto: string; tono?: string }) {
  const ancho = max > 0 ? Math.max(3, Math.round((valor / max) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "88px minmax(0,1fr) 64px", gap: 8, alignItems: "center", fontSize: 14 }}>
      <span className="muted">{etiqueta}</span>
      <span style={{ background: "var(--bg)", borderRadius: 6, height: 14, overflow: "hidden" }}>
        <span style={{ display: "block", width: `${ancho}%`, height: "100%", background: tono, borderRadius: 6 }} />
      </span>
      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{texto}</span>
    </div>
  );
}

export function Estadisticas(p: { fuente: Fuente; sesion: Sesion; planillas: Planilla[]; config: ConfigRecorrido | undefined; recorrido: EstadoRecorrido; avisar: (s: string) => void }) {
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [pings, setPings] = useState<Ping[]>([]);
  const hoy = hoyISO();
  const desde = sumarDias(hoy, -30);

  useEffect(() => p.fuente.escuchar(p.sesion.lineaId, "jornadas", [{ campo: "choferId", igual: p.sesion.uid }], (xs) => setJornadas(xs.filter((j) => j.fecha >= desde))), [p.fuente, p.sesion, desde]);

  // Las posiciones crudas solo están en este celular: con ellas salen los sectores trabados.
  useEffect(() => {
    void (async () => {
      const todas: Ping[] = [];
      for (let d = -30; d <= 0; d++) todas.push(...((await idb.leer<Ping[]>("pings", `${p.sesion.uid}/${sumarDias(hoy, d)}`)) ?? []));
      setPings(todas);
    })();
  }, [p.sesion.uid, hoy, jornadas.length]);

  const vueltas: (VueltaReal & { paradas: number; minutosTransito: number; km: number; puntos: number })[] = useMemo(() => jornadas.flatMap((j) => j.vueltas).sort((a, b) => a.sale - b.sale), [jornadas]);
  const ejemplo = jornadas.some((j) => j.ejemplo);

  const prod = useMemo(() => {
    const planillas = p.planillas.filter((x) => x.fecha >= desde && x.fecha < hoy && !x.franco);
    const comp = planillas.flatMap((pl) => compararConPlanilla(pl.vueltas, jornadas.find((j) => j.fecha === pl.fecha)?.vueltas ?? [], pl.fecha));
    const r = productividad(comp, []);
    return { ...r, kmRecorridos: Math.round(jornadas.reduce((s, j) => s + j.km, 0)) };
  }, [p.planillas, jornadas, desde, hoy]);

  const demoras = useMemo(() => demorasPorVuelta(vueltas).slice(-8).reverse(), [vueltas]);
  const pico = useMemo(() => horariosPico(vueltas), [vueltas]);
  const dias = useMemo(() => diasConvenientes(vueltas), [vueltas]);
  const sectores = useMemo(() => {
    const trazado = p.config?.ramales[0]?.trazado;
    return trazado && pings.length > 10 ? sectoresTrabados(pings, trazado, { largoTramoM: 500 }).slice(0, 4) : [];
  }, [pings, p.config]);

  const exigencia = useMemo(() => {
    const total = vueltas.reduce((s, v) => s + v.puntos, 0);
    const horas = vueltas.reduce((s, v) => s + (v.llega - v.sale), 0) / 3_600_000;
    const porFranja = FRANJAS.map((f) => {
      const vs = vueltas.filter((v) => franjaHoraria(v.sale) === f.nombre);
      return { franja: f.nombre, vueltas: vs.length, puntos: vs.length ? Math.round(vs.reduce((s, v) => s + v.puntos, 0) / vs.length) : 0 };
    }).filter((x) => x.vueltas > 0);
    return { total, porVuelta: vueltas.length ? Math.round(total / vueltas.length) : 0, porHora: horas ? Math.round(total / horas) : 0, porFranja, paradas: vueltas.reduce((s, v) => s + v.paradas, 0), transito: Math.round(vueltas.reduce((s, v) => s + v.minutosTransito, 0)) };
  }, [vueltas]);

  const compartir = async () => {
    const texto = [
      `LA RAMAL · resumen de ${p.sesion.nombre} (${fechaLinda(desde)} al ${fechaLinda(hoy)})`,
      `Vueltas: ${prod.vueltasHechas} de ${prod.vueltasPlanificadas} (${prod.cumplimiento} %) · puntualidad ${prod.puntualidad} %`,
      `Horas manejando: ${prod.horasManejando} h · ${prod.kmRecorridos} km`,
      `Paradas: ${exigencia.paradas} · ${exigencia.transito} min trabado en el tránsito`,
      `Índice de exigencia: ${exigencia.porVuelta} puntos por vuelta · ${exigencia.porHora} por hora`,
      ...exigencia.porFranja.map((f) => `  ${f.franja}: ${f.puntos} puntos por vuelta (${f.vueltas} vueltas)`),
      `Fórmula: ${PESOS_EXIGENCIA.parada} por parada, ${PESOS_EXIGENCIA.minutoTransito} por minuto trabado, ${PESOS_EXIGENCIA.km} por km, ${PESOS_EXIGENCIA.vueltaEnPico} por vuelta en hora pico.`,
      ejemplo ? "(Datos de ejemplo de la demo)" : "Medido solo por el GPS de LA RAMAL.",
    ].join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "Mi resumen LA RAMAL", text: texto });
      else {
        await navigator.clipboard.writeText(texto);
        p.avisar("Resumen copiado: pegalo donde quieras");
      }
    } catch {
      p.avisar("No se pudo compartir desde este navegador");
    }
  };

  const maxPico = Math.max(0, ...pico.map((f) => f.duracionMin));
  const maxSector = Math.max(0, ...sectores.map((s) => s.minutosPorKm));

  return (
    <>
      <div className="card">
        <div className="row"><span className="eyebrow">Vueltas automáticas</span><span className={`chip ${p.recorrido.activo ? "ok" : "warn"}`}><span className="dot" />{p.recorrido.activo ? "Contando" : "En pausa"}</span></div>
        <div className="muted">{p.recorrido.activo ? `Hoy: ${p.recorrido.vueltasHoy} vueltas${p.recorrido.enViajeDesde ? ` · en viaje desde ${p.recorrido.enViajeDesde}` : ""}. No tenés que apretar nada.` : p.recorrido.motivo}</div>
        {ejemplo && <span className="chip warn" style={{ alignSelf: "flex-start" }}>Estadísticas con datos de ejemplo</span>}
      </div>

      <div className="card">
        <span className="eyebrow">Tu productividad · últimos 30 días</span>
        <div className="grid2">
          <div><div className="big">{prod.vueltasHechas}<span className="muted" style={{ fontSize: 16 }}> / {prod.vueltasPlanificadas}</span></div><div className="muted">vueltas ({prod.cumplimiento} %)</div></div>
          <div><div className="big">{prod.puntualidad} %</div><div className="muted">salidas a horario (±5 min)</div></div>
          <div><div className="big">{prod.horasManejando} h</div><div className="muted">manejando</div></div>
          <div><div className="big">{prod.kmRecorridos}</div><div className="muted">km</div></div>
        </div>
      </div>

      <div className="card">
        <div className="row"><span className="eyebrow">Tu índice de exigencia</span><button className="btn yellow" onClick={compartir}>Compartir</button></div>
        <div className="grid2">
          <div><div className="big">{exigencia.porVuelta}</div><div className="muted">puntos por vuelta</div></div>
          <div><div className="big">{exigencia.porHora}</div><div className="muted">puntos por hora</div></div>
        </div>
        {exigencia.porFranja.map((f) => <Barra key={f.franja} etiqueta={f.franja} valor={f.puntos} max={Math.max(...exigencia.porFranja.map((x) => x.puntos))} texto={`${f.puntos} pts`} tono="var(--coral)" />)}
        <div className="muted">{exigencia.paradas} paradas y {exigencia.transito} min trabado en el tránsito. Fórmula pública: {PESOS_EXIGENCIA.parada} punto por parada, {PESOS_EXIGENCIA.minutoTransito} por minuto trabado, {PESOS_EXIGENCIA.km} por km y {PESOS_EXIGENCIA.vueltaEnPico} por vuelta en hora pico. Los datos son tuyos: los compartís si querés.</div>
      </div>

      <div className="card">
        <span className="eyebrow">Horarios pico · cuánto tarda la vuelta según la hora</span>
        {pico.length === 0 ? <div className="muted">Todavía no hay vueltas medidas.</div> : pico.map((f) => (
          <Barra key={f.hora} etiqueta={`${String(f.hora).padStart(2, "0")}:00`} valor={f.duracionMin} max={maxPico} texto={`${f.duracionMin} min`} tono={f.duracionMin >= maxPico * 0.9 ? "var(--coral)" : "var(--navy)"} />
        ))}
      </div>

      <div className="card">
        <span className="eyebrow">Días más convenientes</span>
        {dias.length === 0 ? <div className="muted">Todavía no hay vueltas medidas.</div> : (
          <div className="list">
            {dias.map((d, i) => (
              <div className="it" key={d.dia}>
                <b style={{ width: 24 }}>{i + 1}°</b>
                <div style={{ flex: 1, textTransform: "capitalize" }}>{d.nombre}</div>
                <span className="muted">{d.duracionMin} min</span>
                <span className={`chip ${d.contraPromedioMin <= 0 ? "ok" : "bad"}`}>{d.contraPromedioMin > 0 ? "+" : ""}{d.contraPromedioMin} min</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <span className="eyebrow">Sectores más trabados</span>
        {sectores.length === 0 ? <div className="muted">Hacen falta unas vueltas medidas con el GPS para ver los sectores.</div> : sectores.map((s) => (
          <Barra key={s.desdeM} etiqueta={s.nombre} valor={s.minutosPorKm} max={maxSector} texto={`${s.minutosPorKm} min/km`} tono="var(--coral)" />
        ))}
      </div>

      <div className="card">
        <span className="eyebrow">Demora de tus últimas vueltas</span>
        {demoras.length === 0 ? <div className="muted">Todavía no hay vueltas medidas.</div> : (
          <div className="list">
            {demoras.map((d) => (
              <div className="it" key={d.vuelta.sale}>
                <div style={{ flex: 1 }}>{new Date(d.vuelta.sale).toLocaleDateString("es-AR", { weekday: "short", day: "numeric" })} {new Date(d.vuelta.sale).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}<div className="muted">{d.vuelta.desde} → {d.vuelta.hasta}</div></div>
                <span className="muted">{d.duracionMin} min</span>
                <span className={`chip ${d.demoraMin <= 2 ? "ok" : d.demoraMin <= 8 ? "warn" : "bad"}`}>{d.demoraMin > 0 ? `+${d.demoraMin}` : d.demoraMin} min</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
