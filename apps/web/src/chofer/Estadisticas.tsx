import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FRANJAS, PESOS_EXIGENCIA, compararConPlanilla, demorasPorVuelta, diasConvenientes, estimarPlata, estimarSueldo, franjaHoraria, horariosPico, productividad, sectoresTrabados,
  type ConfigRecorrido, type Escala, type Jornada, type Ping, type Planilla, type Recibo, type VueltaReal,
} from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { idb } from "../datos/idb";
import { fechaLinda, hoyISO, plata, sumarDias } from "../compartido/pdf";
import type { EstadoRecorrido } from "../dispositivo/recorrido-automatico";
import { BarraDePoder } from "./BarraDePoder";

/** Barra horizontal simple, a escala del máximo. */
function Barra({ valor, max, etiqueta, texto, destacada = false }: { valor: number; max: number; etiqueta: string; texto: string; destacada?: boolean }) {
  const ancho = max > 0 ? Math.max(3, Math.round((valor / max) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "86px minmax(0,1fr) 62px", gap: 8, alignItems: "center", fontSize: 14 }}>
      <span className="muted">{etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}</span>
      <span style={{ background: "var(--bg)", borderRadius: 6, height: 14, overflow: "hidden" }}>
        <span style={{ display: "block", width: `${ancho}%`, height: "100%", background: destacada ? "var(--coral)" : "var(--navy)", borderRadius: 6 }} />
      </span>
      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{texto}</span>
    </div>
  );
}

/** Tarjeta con título, la conclusión en una frase grande y el detalle abajo. */
function Bloque({ titulo, conclusion, children, explicacion }: { titulo: string; conclusion: ReactNode; children?: ReactNode; explicacion?: string }) {
  return (
    <div className="card">
      <span className="eyebrow">{titulo}</span>
      <div style={{ fontSize: 18, lineHeight: 1.35, fontWeight: 600 }}>{conclusion}</div>
      {children}
      {explicacion && <div className="muted">{explicacion}</div>}
    </div>
  );
}

type V = VueltaReal & { paradas: number; minutosTransito: number; km: number; puntos: number };

export function Estadisticas(p: { fuente: Fuente; sesion: Sesion; planillas: Planilla[]; recibos: Recibo[]; config: ConfigRecorrido | undefined; recorrido: EstadoRecorrido; avisar: (s: string) => void }) {
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [pings, setPings] = useState<Ping[]>([]);
  const [escala, setEscala] = useState<Escala | undefined>(undefined);
  useEffect(() => p.fuente.escuchar(p.sesion.lineaId, "escalas", [], (xs) => setEscala(xs[0])), [p.fuente, p.sesion]);
  const hoy = hoyISO();
  const desde = sumarDias(hoy, -30);

  useEffect(() => p.fuente.escuchar(p.sesion.lineaId, "jornadas", [{ campo: "choferId", igual: p.sesion.uid }], (xs) => setJornadas(xs.filter((j) => j.fecha >= desde))), [p.fuente, p.sesion, desde]);

  // Las posiciones crudas solo están en este celular: con ellas salen los tramos trabados.
  useEffect(() => {
    void (async () => {
      const todas: Ping[] = [];
      for (let d = -30; d <= 0; d++) todas.push(...((await idb.leer<Ping[]>("pings", `${p.sesion.uid}/${sumarDias(hoy, d)}`)) ?? []));
      setPings(todas);
    })();
  }, [p.sesion.uid, hoy, jornadas.length]);

  const vueltas: V[] = useMemo(() => jornadas.flatMap((j) => j.vueltas).sort((a, b) => a.sale - b.sale), [jornadas]);
  const ejemplo = jornadas.some((j) => j.ejemplo);
  const plataMes = useMemo(() => estimarPlata(p.recibos, p.planillas, hoy), [p.recibos, p.planillas, hoy]);
  // Con la escala del convenio cargada, la cuenta va concepto por concepto; la antigüedad sale del último recibo leído.
  const sueldo = useMemo(() => {
    if (!escala) return null;
    const anios = [...p.recibos].sort((a, b) => b.periodo.localeCompare(a.periodo)).find((r) => r.antiguedadAnios !== undefined)?.antiguedadAnios ?? 0;
    const kmMes = jornadas.filter((j) => j.fecha.startsWith(hoy.slice(0, 7))).reduce((s, j) => s + j.km, 0);
    const ahora = estimarSueldo(escala, p.planillas, hoy, anios, kmMes);
    // Lo que se puede ganar si se hacen todas las planillas del mes (proyección al último día).
    const [a, m] = hoy.split("-").map(Number) as [number, number];
    const finDeMes = `${hoy.slice(0, 7)}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
    const proyectado = estimarSueldo(escala, p.planillas, finDeMes, anios, kmMes).total;
    // Lo que suma cada vuelta: todo lo que no es fijo (básico y antigüedad) repartido en las vueltas del mes.
    const vueltasMes = p.planillas.filter((x) => x.fecha.startsWith(hoy.slice(0, 7)) && !x.franco).reduce((s, x) => s + x.vueltas.length, 0);
    const fijo = ahora.lineas.filter((l) => l.concepto === "Básico" || l.concepto === "Antigüedad").reduce((s, l) => s + l.monto, 0);
    const valorVuelta = vueltasMes ? Math.round((proyectado - fijo) / vueltasMes) : 0;
    return { ...ahora, anios, proyectado, valorVuelta };
  }, [escala, p.recibos, p.planillas, jornadas, hoy]);

  const prod = useMemo(() => {
    const planillas = p.planillas.filter((x) => x.fecha >= desde && x.fecha < hoy && !x.franco);
    const comp = planillas.flatMap((pl) => compararConPlanilla(pl.vueltas, jornadas.find((j) => j.fecha === pl.fecha)?.vueltas ?? [], pl.fecha));
    return { ...productividad(comp, []), kmRecorridos: Math.round(jornadas.reduce((s, j) => s + j.km, 0)) };
  }, [p.planillas, jornadas, desde, hoy]);

  const pico = useMemo(() => horariosPico(vueltas), [vueltas]);
  const dias = useMemo(() => diasConvenientes(vueltas), [vueltas]);
  const demoras = useMemo(() => demorasPorVuelta(vueltas).slice(-6).reverse(), [vueltas]);
  const sectores = useMemo(() => {
    const trazado = p.config?.ramales[0]?.trazado;
    return trazado && pings.length > 10 ? sectoresTrabados(pings, trazado, { largoTramoM: 500 }) : [];
  }, [pings, p.config]);

  const exigencia = useMemo(() => {
    const porFranja = FRANJAS.map((f) => {
      const vs = vueltas.filter((v) => franjaHoraria(v.sale) === f.nombre);
      return { franja: f.nombre, vueltas: vs.length, puntos: vs.length ? Math.round(vs.reduce((s, v) => s + v.puntos, 0) / vs.length) : 0 };
    }).filter((x) => x.vueltas > 0);
    const paradas = vueltas.length ? Math.round(vueltas.reduce((s, v) => s + v.paradas, 0) / vueltas.length) : 0;
    const transito = vueltas.length ? Math.round(vueltas.reduce((s, v) => s + v.minutosTransito, 0) / vueltas.length) : 0;
    return { porFranja, paradas, transito, total: vueltas.reduce((s, v) => s + v.puntos, 0) };
  }, [vueltas]);

  // ---- Frases de conclusión ----
  const lenta = pico.length ? pico.reduce((a, b) => (b.duracionMin > a.duracionMin ? b : a)) : null;
  const rapida = pico.length ? pico.reduce((a, b) => (b.duracionMin < a.duracionMin ? b : a)) : null;
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const mejorDia = dias[0];
  const peorDia = dias.at(-1);
  const tramoPeor = sectores[0];
  const promedioTramos = sectores.length ? sectores.reduce((s, x) => s + x.minutosPorKm, 0) / sectores.length : 0;
  const franjaDura = exigencia.porFranja.length ? exigencia.porFranja.reduce((a, b) => (b.puntos > a.puntos ? b : a)) : null;
  const salidasAHorario = Math.round(prod.puntualidad / 10);

  const compartir = async () => {
    const texto = [
      `LA RAMAL · ${p.sesion.nombre} · ${fechaLinda(desde)} al ${fechaLinda(hoy)}`,
      `Vueltas: ${prod.vueltasHechas} de ${prod.vueltasPlanificadas}. Salí a horario ${salidasAHorario} de cada 10 veces.`,
      `Manejé ${prod.horasManejando} horas y ${prod.kmRecorridos} km.`,
      `Por vuelta hago en promedio ${exigencia.paradas} paradas y paso ${exigencia.transito} minutos trabado en el tránsito.`,
      ...exigencia.porFranja.map((f) => `Exigencia ${f.franja}: ${f.puntos} puntos por vuelta.`),
      `Puntos: ${PESOS_EXIGENCIA.parada} por parada, ${PESOS_EXIGENCIA.minutoTransito} por minuto trabado, ${PESOS_EXIGENCIA.km} por km, ${PESOS_EXIGENCIA.vueltaEnPico} por vuelta en hora pico.`,
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

  return (
    <>
      {ejemplo && <div className="chip warn" style={{ alignSelf: "flex-start" }}>Números de ejemplo (demo)</div>}

      <div className="card" style={{ background: "var(--navy)", color: "var(--on-navy)", borderColor: "var(--navy)" }}>
        <span className="eyebrow" style={{ color: "var(--accent)" }}>Tu plata este mes</span>
        {sueldo ? (
          <>
            <BarraDePoder lineas={sueldo.lineas} ganado={sueldo.total} proyectado={sueldo.proyectado} valorVuelta={sueldo.valorVuelta} vueltasHoy={p.recorrido.vueltasHoy} simular={p.fuente.modo === "demo"} desde={p.config?.cabeceras[0]?.nombre} hasta={p.config?.cabeceras.at(-1)?.nombre} />
            <div className="eyebrow" style={{ color: "var(--accent)", marginTop: 6 }}>Cómo se calcula ({sueldo.diasTrabajados} días trabajados)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
              {sueldo.lineas.filter((l) => l.monto > 0 || l.faltaCargar).map((l) => (
                <div key={l.concepto} className="row" style={{ borderTop: "1px solid rgba(246,241,231,0.18)", paddingTop: 4 }}>
                  <span>
                    <b>{l.concepto}</b>
                    <span style={{ opacity: 0.8 }}> · {l.faltaCargar ? "falta que personal cargue el monto" : l.cuenta}</span>
                  </span>
                  <b style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{l.faltaCargar ? "—" : plata(l.monto)}</b>
                </div>
              ))}
            </div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>Escala desde {fechaLinda(escala!.desde)}. {escala!.fuente} Es una estimación: lo que vale es el recibo.</div>
          </>
        ) : plataMes ? (
          <>
            <div className="big" style={{ fontSize: 40 }}>{plata(plataMes.estimadoMes)}</div>
            <div>llevás ganado en bruto: el básico desde el día 1{plataMes.extrasMes ? ` más ${plataMes.horasExtraMes} h extra` : ""}.</div>
            <div style={{ opacity: 0.85, fontSize: 14 }}>Básico {plata(plataMes.basico)}{plataMes.valorHoraExtra ? ` + ${plataMes.horasExtraMes} h extra × ${plata(plataMes.valorHoraExtra)} (lo que te pagó cada hora extra el recibo de ${plataMes.ultimoRecibo.periodo})` : ""}. Es una estimación: lo que vale es el recibo.</div>
          </>
        ) : (
          <div>Cuando subas tu primer recibo (en Papeles), acá vas a ver cuánto llevás ganado en el mes.</div>
        )}
      </div>

      <Bloque
        titulo="Tu mes en pocas palabras"
        conclusion={
          <>
            Hiciste <b>{prod.vueltasHechas}</b> vueltas de las <b>{prod.vueltasPlanificadas}</b> de tu planilla y saliste a horario <b>{salidasAHorario} de cada 10</b> veces.
          </>
        }
        explicacion={`Manejaste ${String(prod.horasManejando).replace(".", ",")} horas y ${prod.kmRecorridos} km en los últimos 30 días. ${p.recorrido.activo ? `Hoy van ${p.recorrido.vueltasHoy} vueltas, contadas solas.` : p.recorrido.motivo}.`}
      />

      <Bloque
        titulo="La hora que más tarda la vuelta"
        conclusion={lenta && rapida ? <>La vuelta de las <b>{hh(lenta.hora)}</b> es la más lenta: <b>{lenta.duracionMin} min</b>, {lenta.duracionMin - rapida.duracionMin} más que la de las {hh(rapida.hora)}.</> : "Todavía no hay vueltas medidas."}
        explicacion="Cuánto tarda una vuelta según la hora en que sale (lo normal de cada hora)."
      >
        {pico.map((f) => <Barra key={f.hora} etiqueta={hh(f.hora)} valor={f.duracionMin} max={lenta?.duracionMin ?? 0} texto={`${f.duracionMin} min`} destacada={f.hora === lenta?.hora} />)}
      </Bloque>

      <Bloque
        titulo="El mejor día para trabajar"
        conclusion={mejorDia && peorDia ? <>El <b>{mejorDia.nombre}</b> las vueltas son las más rápidas ({mejorDia.duracionMin} min). El <b>{peorDia.nombre}</b>, las más lentas ({peorDia.duracionMin} min).</> : "Todavía no hay vueltas medidas."}
        explicacion="Sirve para elegir qué día ofrecer o tomar en un cambio de turno."
      >
        {dias.map((d) => <Barra key={d.dia} etiqueta={d.nombre} valor={d.duracionMin} max={peorDia?.duracionMin ?? 0} texto={`${d.duracionMin} min`} destacada={d.dia === peorDia?.dia} />)}
      </Bloque>

      <Bloque
        titulo="Dónde se traba el recorrido"
        conclusion={tramoPeor ? <>El tramo más trabado es del <b>{tramoPeor.nombre.replace("Km ", "km ")}</b>: tardás <b>{tramoPeor.minutosPorKm} min por km</b>, {promedioTramos ? `${Math.round(tramoPeor.minutosPorKm / promedioTramos * 10) / 10} veces lo normal del recorrido` : ""}.</> : "Hacen falta unas vueltas con el GPS para ver los tramos."}
        explicacion="Minutos que tardás en hacer un kilómetro en cada tramo del recorrido. Más minutos = más trabado."
      >
        {sectores.slice(0, 4).map((s, i) => <Barra key={s.desdeM} etiqueta={s.nombre} valor={s.minutosPorKm} max={tramoPeor?.minutosPorKm ?? 0} texto={`${s.minutosPorKm} min`} destacada={i === 0} />)}
      </Bloque>

      <Bloque
        titulo="Cuánto te exige el trabajo"
        conclusion={franjaDura ? <>Por vuelta hacés <b>{exigencia.paradas} paradas</b> y pasás <b>{exigencia.transito} minutos</b> trabado. Lo más exigente es la <b>{franjaDura.franja}</b>.</> : "Todavía no hay vueltas medidas."}
        explicacion={`Puntos por vuelta: ${PESOS_EXIGENCIA.parada} por cada parada, ${PESOS_EXIGENCIA.minutoTransito} por minuto trabado, ${PESOS_EXIGENCIA.km} por km y ${PESOS_EXIGENCIA.vueltaEnPico} si es en hora pico. Con esto podés mostrar, con números, qué turnos cuestan más.`}
      >
        {exigencia.porFranja.map((f) => <Barra key={f.franja} etiqueta={f.franja} valor={f.puntos} max={franjaDura?.puntos ?? 0} texto={`${f.puntos} pts`} destacada={f.franja === franjaDura?.franja} />)}
        <button className="btn yellow" onClick={compartir}>Compartir mi resumen</button>
      </Bloque>

      <Bloque titulo="Tus últimas vueltas" conclusion={demoras.length ? "Cuánto tardaste contra lo normal de ese viaje:" : "Todavía no hay vueltas medidas."}>
        <div className="list">
          {demoras.map((d) => (
            <div className="it" key={d.vuelta.sale}>
              <div style={{ flex: 1 }}>{new Date(d.vuelta.sale).toLocaleDateString("es-AR", { weekday: "short", day: "numeric" })} {new Date(d.vuelta.sale).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}<div className="muted">{d.vuelta.desde} → {d.vuelta.hasta} · {d.duracionMin} min</div></div>
              <span className={`chip ${d.demoraMin <= 2 ? "ok" : d.demoraMin <= 8 ? "warn" : "bad"}`}>{d.demoraMin <= 0 ? "a tiempo" : `+${d.demoraMin} min`}</span>
            </div>
          ))}
        </div>
      </Bloque>
    </>
  );
}
