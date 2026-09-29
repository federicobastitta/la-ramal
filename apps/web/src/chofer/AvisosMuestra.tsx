import { useEffect, useState } from "react";
import { Icono } from "../compartido/iconos";

export type TabDestino = "inicio" | "incidente" | "averia" | "papeles" | "numeros" | "terminal";

/** Avisos de MUESTRA para la demo: van apareciendo solos, uno por vez, y se cierran solos. */
const AVISOS: { icono: keyof typeof Icono; titulo: string; texto: string; ir: TabDestino }[] = [
  { icono: "grupo", titulo: "Truco", texto: "Gómez está detenido en la terminal y busca rival. ¿Jugás?", ir: "terminal" },
  { icono: "papel", titulo: "Aviso de la empresa", texto: "Desvío por obra en Av. Mitre desde el lunes.", ir: "papeles" },
  { icono: "alerta", titulo: "Corte confirmado", texto: "Piquete en Calchaquí y Mitre: lo confirmaron 6 choferes.", ir: "incidente" },
  { icono: "grupo", titulo: "Cumpleaños", texto: "Hoy cumple Marcela Ríos. Dejale un saludo.", ir: "terminal" },
  { icono: "papel", titulo: "Recibo listo", texto: "Ya está tu recibo del mes pasado: dale la conformidad.", ir: "papeles" },
  { icono: "papel", titulo: "Vencimiento", texto: "Tu psicofísico vence en 20 días.", ir: "papeles" },
  { icono: "llave", titulo: "Taller", texto: "El taller arregló la puerta de atrás del Interno 23.", ir: "averia" },
  { icono: "papel", titulo: "Cambio de turno", texto: "Tráfico aprobó tu cambio del sábado. Tu planilla ya cambió.", ir: "papeles" },
  { icono: "grupo", titulo: "Prode", texto: "Faltan tus pronósticos de la fecha. Cierra el sábado 17 h.", ir: "terminal" },
  { icono: "grafico", titulo: "Tus números", texto: "Hoy van 3 vueltas, las 3 a horario.", ir: "numeros" },
  { icono: "inicio", titulo: "Botón de pánico", texto: "Tu botón pasó la prueba semanal: está listo.", ir: "inicio" },
];

const VISIBLE_MS = 5_000;
const PAUSA_MS = 1_800;

export function AvisosMuestra({ ir }: { ir: (t: TabDestino) => void }) {
  const [i, setI] = useState(-1);
  const [visible, setVisible] = useState(false);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado) return;
    const t = setTimeout(() => {
      if (visible) setVisible(false);
      else {
        setI((x) => (x + 1) % AVISOS.length);
        setVisible(true);
      }
    }, visible ? VISIBLE_MS : PAUSA_MS);
    return () => clearTimeout(t);
  }, [visible, pausado]);

  const a = AVISOS[Math.max(0, i)]!;
  return (
    <div className={`aviso-muestra ${visible ? "abierto" : ""}`} role="status" aria-live="polite" onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)}>
      <button
        className="aviso-cuerpo"
        onClick={() => {
          ir(a.ir);
          setVisible(false);
        }}
        tabIndex={visible ? 0 : -1}
      >
        <span className="aviso-icono">{Icono[a.icono]!()}</span>
        <span style={{ minWidth: 0 }}>
          <span className="aviso-titulo">{a.titulo} <span className="aviso-etiqueta">aviso de muestra</span></span>
          <span className="aviso-texto">{a.texto}</span>
        </span>
      </button>
      <button className="aviso-cerrar" aria-label="Cerrar aviso" onClick={() => setVisible(false)} tabIndex={visible ? 0 : -1}>×</button>
    </div>
  );
}
