import type { Carrera } from "./automovilismo";

/**
 * Calendario 2026 de las categorías argentinas que el directorio público no tiene.
 * Fechas tomadas de la prensa especializada (29/09/2026). La hora de largada NO está confirmada:
 * la app muestra el día y dice "horario a confirmar". Actualizar con cada cambio de calendario.
 */
export const FUENTE_CALENDARIO = "Calendarios 2026 publicados por SoloTC, La Nación, Carburando, Campeones y toprace.com.ar (consultados el 29/09/2026).";

type Fecha = { id: string; categoria: Carrera["categoria"]; nombre: string; circuito: string; dia: string };

const FECHAS: Fecha[] = [
  { id: "tc-2026-12", categoria: "tc", nombre: "Turismo Carretera · Copa de Oro, 2ª fecha", circuito: "San Nicolás", dia: "2026-10-04" },
  { id: "tc-2026-13", categoria: "tc", nombre: "Turismo Carretera · Copa de Oro, 3ª fecha", circuito: "Rosario", dia: "2026-10-25" },
  { id: "tc-2026-14", categoria: "tc", nombre: "Turismo Carretera · Copa de Oro, 4ª fecha", circuito: "Río Cuarto", dia: "2026-11-15" },
  { id: "tc-2026-15", categoria: "tc", nombre: "Turismo Carretera · Gran Premio Coronación", circuito: "La Plata", dia: "2026-12-06" },
  { id: "tc2000-2026-09", categoria: "tc2000", nombre: "TC2000 · Fecha 9", circuito: "Circuito a definir", dia: "2026-10-18" },
  { id: "tc2000-2026-10", categoria: "tc2000", nombre: "TC2000 · Fecha 10", circuito: "Circuito a definir", dia: "2026-11-08" },
  { id: "tc2000-2026-11", categoria: "tc2000", nombre: "TC2000 · Fecha 11", circuito: "Circuito a definir", dia: "2026-11-22" },
  { id: "tc2000-2026-12", categoria: "tc2000", nombre: "TC2000 · Fecha 12", circuito: "Circuito a definir", dia: "2026-12-13" },
  { id: "tr-2026-09", categoria: "toprace", nombre: "Top Race · Fecha 9", circuito: "Circuito a confirmar", dia: "2026-11-01" },
  { id: "tr-2026-10", categoria: "toprace", nombre: "Top Race · Fecha 10", circuito: "Circuito a confirmar", dia: "2026-12-06" },
];

/** Las carreras del calendario local, a las 13 h de Argentina solo para ordenar (la hora no se muestra). */
export function carrerasDelCalendario(): Carrera[] {
  return FECHAS.map((f) => ({
    id: f.id,
    categoria: f.categoria,
    nombre: f.nombre,
    circuito: f.circuito,
    inicio: Date.parse(`${f.dia}T16:00:00Z`),
    horaConfirmada: false,
    fuente: FUENTE_CALENDARIO,
  }));
}
