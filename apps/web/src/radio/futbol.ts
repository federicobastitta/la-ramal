/**
 * Partidos de fútbol para sugerir en la radio. El fixture se trae del directorio público TheSportsDB
 * (Liga Profesional Argentina, id 4406). La radio no sabe qué emisora transmite cada partido:
 * se sugieren las que suelen pasar fútbol y el chofer elige.
 */
export const EQUIPOS = [
  "Argentinos Juniors", "Atlético Tucumán", "Banfield", "Barracas Central", "Belgrano", "Boca Juniors", "Central Córdoba",
  "Defensa y Justicia", "Estudiantes", "Gimnasia", "Godoy Cruz", "Huracán", "Independiente", "Independiente Rivadavia",
  "Instituto", "Lanús", "Newell's Old Boys", "Platense", "Racing Club", "River Plate", "Rosario Central", "San Lorenzo",
  "San Martín de San Juan", "Sarmiento", "Talleres", "Tigre", "Unión", "Vélez Sarsfield", "Aldosivi", "Deportivo Riestra",
] as const;

/** Radios de la lista que suelen transmitir fútbol (ids de emisoras.ts). */
export const RADIOS_DE_FUTBOL = ["lared", "rivadavia", "mitre", "continental", "radio10"] as const;

export type Partido = { id: string; local: string; visitante: string; inicio: number; torneo: string };
export type EventoSportsDb = { idEvent: string; strHomeTeam: string; strAwayTeam: string; strTimestamp?: string | null; dateEvent?: string | null; strTime?: string | null; strLeague?: string | null };

/** Convierte lo que devuelve TheSportsDB (horas en UTC) a partidos con la hora de inicio en ms. */
export function leerEventos(eventos: EventoSportsDb[]): Partido[] {
  return eventos
    .map((e) => {
      const iso = e.strTimestamp ? (e.strTimestamp.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(e.strTimestamp) ? e.strTimestamp : `${e.strTimestamp}Z`) : e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime.slice(0, 8)}Z` : null;
      const inicio = iso ? Date.parse(iso) : NaN;
      return { id: e.idEvent, local: e.strHomeTeam, visitante: e.strAwayTeam, inicio, torneo: e.strLeague ?? "Liga Profesional" };
    })
    .filter((p) => Number.isFinite(p.inicio));
}

const normal = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(club|atletico|ca|cd|ac)\b/g, "").replace(/\s+/g, " ").trim();

/** Nombres cortos con que el fixture suele escribir a algunos clubes. */
const ALIAS: Record<string, string> = { boca: "Boca Juniors", river: "River Plate", racing: "Racing Club", velez: "Vélez Sarsfield", newells: "Newell's Old Boys", "newell s": "Newell's Old Boys" };

/**
 * A qué club de la lista corresponde un nombre del fixture: el nombre más largo de la lista que aparece en él.
 * Así "Independiente Rivadavia" no se toma como "Independiente", ni "Central Córdoba" como "Rosario Central".
 */
export function clubDe(nombreDelFixture: string): string | null {
  const a = ` ${normal(nombreDelFixture)} `;
  let mejor: string | null = null;
  for (const e of EQUIPOS) if (a.includes(` ${normal(e)} `) && (!mejor || normal(e).length > normal(mejor).length)) mejor = e;
  if (mejor) return mejor;
  for (const [alias, e] of Object.entries(ALIAS)) if (a.includes(` ${alias} `)) return e;
  return null;
}

export function esDelEquipo(nombreDelFixture: string, equipo: string): boolean {
  return clubDe(nombreDelFixture) === equipo;
}

export type Sugerencia = { partido: Partido; estado: "en_vivo" | "hoy" | "proximo"; faltaMin: number; esMiEquipo: boolean };

const DURACION_MS = 115 * 60_000; // 90 minutos + entretiempo + descuentos

/**
 * Qué partidos sugerir: primero los de tu equipo, después los que se juegan ahora, después los de hoy y mañana.
 * No se sugieren partidos que ya terminaron ni los de más de 2 días.
 */
export function sugerirPartidos(partidos: Partido[], equipo: string | null, ahora: number): Sugerencia[] {
  return partidos
    .filter((p) => p.inicio + DURACION_MS > ahora && p.inicio - ahora < 2 * 86_400_000)
    .map((p) => {
      const faltaMin = Math.round((p.inicio - ahora) / 60_000);
      const estado: Sugerencia["estado"] = faltaMin <= 0 ? "en_vivo" : faltaMin < 24 * 60 && new Date(p.inicio).toDateString() === new Date(ahora).toDateString() ? "hoy" : "proximo";
      return { partido: p, estado, faltaMin, esMiEquipo: !!equipo && (esDelEquipo(p.local, equipo) || esDelEquipo(p.visitante, equipo)) };
    })
    .sort((a, b) => Number(b.esMiEquipo) - Number(a.esMiEquipo) || (a.estado === "en_vivo" ? -1 : 0) - (b.estado === "en_vivo" ? -1 : 0) || a.partido.inicio - b.partido.inicio);
}

export async function buscarPartidos(fetcher: typeof fetch = fetch): Promise<Partido[]> {
  const r = await fetcher("https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4406", { signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as { events?: EventoSportsDb[] | null };
  return leerEventos(j.events ?? []);
}

/** Partidos de EJEMPLO para la demo (sin conexión con el fixture real). */
export function partidosDeEjemplo(ahora: number): Partido[] {
  const h = 3_600_000;
  return [
    { id: "e1", local: "Boca Juniors", visitante: "Racing Club", inicio: ahora + 2 * h, torneo: "Ejemplo" },
    { id: "e2", local: "River Plate", visitante: "Independiente", inicio: ahora - 40 * 60_000, torneo: "Ejemplo" },
    { id: "e3", local: "San Lorenzo", visitante: "Huracán", inicio: ahora + 26 * h, torneo: "Ejemplo" },
    { id: "e4", local: "Vélez Sarsfield", visitante: "Estudiantes", inicio: ahora + 5 * h, torneo: "Ejemplo" },
  ];
}
