import { useEffect, useRef, useState } from "react";
import type { LineaSueldo } from "@la-ramal/nucleo";
import { plata } from "../compartido/pdf";

const COLORES: Record<string, string> = {
  Básico: "#f6f1e7",
  Antigüedad: "#9ec5e8",
  Viáticos: "#f2b705",
  Presentismo: "#7fd1a8",
  "Horas extra": "#f06a43",
  "Horas extra domingo y feriado": "#e4572e",
  "Horas nocturnas": "#b39ddb",
  "Bono por kilómetro": "#5fcf97",
};

const MS_POR_VUELTA_DEMO = 6_000;
const MS_POR_VUELTA_REAL = 3_000;

function Colectivo({ mirandoIzquierda }: { mirandoIzquierda: boolean }) {
  return (
    <svg width="46" height="28" viewBox="0 0 46 28" aria-hidden="true" style={{ transform: mirandoIzquierda ? "scaleX(-1)" : undefined, display: "block" }}>
      <rect x="1" y="3" width="42" height="18" rx="4" fill="#f2b705" stroke="#14213d" strokeWidth="1.5" />
      <rect x="5" y="6" width="7" height="6" rx="1" fill="#14213d" />
      <rect x="14" y="6" width="7" height="6" rx="1" fill="#14213d" />
      <rect x="23" y="6" width="7" height="6" rx="1" fill="#14213d" />
      <path d="M33 6h6a2 2 0 0 1 2 2v5h-8z" fill="#14213d" />
      <rect x="1" y="15" width="42" height="2" fill="#e4572e" />
      <circle cx="11" cy="22" r="3.6" fill="#14213d" stroke="#f6f1e7" strokeWidth="1.2" />
      <circle cx="33" cy="22" r="3.6" fill="#14213d" stroke="#f6f1e7" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * La plata del mes como barra de poder, con un colectivo que va y vuelve entre cabeceras.
 * Mientras viaja, los pesos van contando (aunque sea poquito, siempre suben); al llegar, la vuelta queda
 * sumada, la barra late y el celular vibra. En la demo viaja solo; en el celular de verdad hace el viaje
 * cada vez que el GPS cuenta una vuelta.
 */
export function BarraDePoder({ lineas, ganado, proyectado, valorVuelta, vueltasHoy, simular, desde = "Cabecera", hasta = "Punta de línea" }: {
  lineas: LineaSueldo[];
  ganado: number;
  proyectado: number;
  valorVuelta: number;
  vueltasHoy: number;
  simular: boolean;
  desde?: string;
  hasta?: string;
}) {
  const [hechas, setHechas] = useState(0); // vueltas sumadas en esta pantalla
  const [t, setT] = useState(0); // avance del viaje actual, de 0 a 1
  const [enViaje, setEnViaje] = useState(simular);
  const [pulso, setPulso] = useState(0);
  const previas = useRef(vueltasHoy);
  const quieto = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Vuelta real contada por el GPS: el colectivo hace su viaje.
  useEffect(() => {
    if (vueltasHoy > previas.current) setEnViaje(true);
    previas.current = vueltasHoy;
  }, [vueltasHoy]);

  useEffect(() => {
    if (!enViaje || valorVuelta <= 0) return;
    const dur = simular ? MS_POR_VUELTA_DEMO : MS_POR_VUELTA_REAL;
    let inicio = performance.now();
    let raf = 0;
    const cuadro = (ahora: number) => {
      const avance = quieto ? 1 : Math.min(1, (ahora - inicio) / dur);
      setT(avance);
      if (avance >= 1) {
        setHechas((h) => h + 1);
        setPulso((n) => n + 1);
        setT(0);
        try {
          navigator.vibrate?.([40, 60, 40]);
        } catch {
          /* sin vibración */
        }
        if (!simular) {
          setEnViaje(false);
          return;
        }
        inicio = ahora;
      }
      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, [enViaje, simular, valorVuelta, quieto]);

  const ida = hechas % 2 === 0;
  const posicion = ida ? t : 1 - t;
  const sumado = (hechas + t) * valorVuelta;
  const mostrado = ganado + sumado;
  const total = Math.max(proyectado, mostrado, 1);
  const tramos = lineas.filter((l) => l.monto > 0);
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div className="poder">
      <div className="row" style={{ alignItems: "baseline" }}>
        <div key={pulso} className={`big poder-monto ${pulso ? "latido" : ""}`} style={{ fontSize: 40, fontVariantNumeric: "tabular-nums" }}>{plata(mostrado)}</div>
        {pulso > 0 && <span key={`f${pulso}`} className="poder-mas">+{plata(valorVuelta)}</span>}
      </div>

      <div className="poder-ruta" aria-hidden="true">
        <div className="poder-calle" />
        <div className="poder-bus" style={{ left: `calc(${posicion * 100}% - ${posicion * 46}px)` }}>
          <Colectivo mirandoIzquierda={!ida} />
        </div>
      </div>
      <div className="row" style={{ fontSize: 12, opacity: 0.85, marginTop: -4 }}>
        <span>{desde}</span>
        <span>{enViaje ? (ida ? "ida →" : "← vuelta") : "en la cabecera"}</span>
        <span>{hasta}</span>
      </div>

      <div className={`poder-barra ${pulso ? "latido" : ""}`} key={`b${pulso}`} role="img" aria-label={`Ganado ${plata(mostrado)} de ${plata(total)} posibles este mes`}>
        {tramos.map((l) => <span key={l.concepto} style={{ width: pct(l.monto), background: COLORES[l.concepto] ?? "#ccc" }} title={`${l.concepto}: ${plata(l.monto)}`} />)}
        {sumado > 0 && <span className="poder-nuevo" style={{ width: pct(sumado) }} />}
      </div>
      <div className="row" style={{ fontSize: 13, opacity: 0.9 }}>
        <span>{Math.round((mostrado / total) * 100)} % del mes</span>
        <span>Si hacés todas tus planillas: {plata(total)}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 12 }}>
        {tramos.map((l) => (
          <span key={l.concepto} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORES[l.concepto] ?? "#ccc", display: "inline-block" }} />
            {l.concepto}
          </span>
        ))}
        {sumado > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span className="poder-nuevo" style={{ width: 10, height: 10, borderRadius: 3, display: "inline-block" }} />
            Vueltas de ahora
          </span>
        )}
      </div>
      {valorVuelta > 0 && <div style={{ fontSize: 14 }}>Cada vuelta te suma unos <b>{plata(valorVuelta)}</b>.{simular ? " En la demo el colectivo va y viene solo." : ""}</div>}
    </div>
  );
}
