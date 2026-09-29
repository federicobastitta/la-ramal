/**
 * Próximas carreras de automovilismo para sugerir en la radio. Las fechas salen de TheSportsDB:
 * la Fórmula 1 por su id (4370) y las categorías argentinas buscándolas por nombre entre las ligas
 * de automovilismo de Argentina. La app no afirma qué radio transmite cada carrera.
 */
import { carrerasDelCalendario } from "./calendario-argentino";

export const CATEGORIAS = [
  { id: "tc", nombre: "Turismo Carretera", buscar: /turismo carretera|\bTC\b(?!\s*2000|\s*pista)/i },
  { id: "tc2000", nombre: "TC2000", buscar: /tc\s*2000/i },
  { id: "toprace", nombre: "Top Race", buscar: /top race/i },
  { id: "tn", nombre: "Turismo Nacional", buscar: /turismo nacional/i },
  { id: "f1", nombre: "Fórmula 1", buscar: /formula\s*1|f[oó]rmula uno|\bF1\b/i },
] as const;
export type IdCategoria = (typeof CATEGORIAS)[number]["id"];

export type Carrera = { id: string; categoria: IdCategoria; nombre: string; circuito: string; inicio: number; horaConfirmada?: boolean; fuente?: string };
export type EventoMotor = { idEvent: string; strEvent: string; strLeague?: string | null; strVenue?: string | null; strCircuit?: string | null; strTimestamp?: string | null; dateEvent?: string | null; strTime?: string | null };

export function categoriaDe(liga: string): IdCategoria | null {
  return CATEGORIAS.find((c) => c.buscar.test(liga))?.id ?? null;
}

function inicioDe(e: EventoMotor): number {
  const ts = e.strTimestamp ? (/(Z|[+-]\d\d:?\d\d)$/.test(e.strTimestamp) ? e.strTimestamp : `${e.strTimestamp}Z`) : e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime.slice(0, 8)}Z` : null;
  return ts ? Date.parse(ts) : NaN;
}

export function leerCarreras(eventos: EventoMotor[], categoriaPorDefecto?: IdCategoria): Carrera[] {
  return eventos
    .map((e) => ({
      id: e.idEvent,
      categoria: (e.strLeague ? categoriaDe(e.strLeague) : null) ?? categoriaPorDefecto ?? null,
      nombre: e.strEvent,
      circuito: e.strCircuit || e.strVenue || "",
      inicio: inicioDe(e),
    }))
    .filter((c): c is Carrera => c.categoria !== null && Number.isFinite(c.inicio));
}

export type SugerenciaCarrera = { carrera: Carrera; estado: "en_vivo" | "hoy" | "proxima"; faltaMin: number; favorita: boolean };

const DURACION_MS = 2 * 3_600_000;

/**
 * La próxima carrera de cada categoría (o la que se está corriendo), primero las favoritas.
 * Mira hasta 30 días adelante: las carreras son cada dos o tres semanas.
 */
export function proximasCarreras(carreras: Carrera[], favoritas: IdCategoria[], ahora: number): SugerenciaCarrera[] {
  const porCategoria = new Map<IdCategoria, Carrera>();
  for (const c of carreras
    .filter((c) => (c.horaConfirmada === false ? c.inicio + 12 * 3_600_000 : c.inicio + DURACION_MS) > ahora && c.inicio - ahora < 30 * 86_400_000)
    .sort((a, b) => a.inicio - b.inicio)) {
    if (!porCategoria.has(c.categoria)) porCategoria.set(c.categoria, c);
  }
  return [...porCategoria.values()]
    .map((c) => {
      const faltaMin = Math.round((c.inicio - ahora) / 60_000);
      const mismoDia = new Date(c.inicio).toDateString() === new Date(ahora).toDateString();
      // Sin hora confirmada no se puede decir "en vivo": ese día se muestra como "hoy".
      const estado: SugerenciaCarrera["estado"] = c.horaConfirmada === false ? (mismoDia ? "hoy" : "proxima") : faltaMin <= 0 ? "en_vivo" : new Date(c.inicio).toDateString() === new Date(ahora).toDateString() ? "hoy" : "proxima";
      return { carrera: c, estado, faltaMin, favorita: favoritas.includes(c.categoria) };
    })
    .sort((a, b) => Number(b.favorita) - Number(a.favorita) || a.carrera.inicio - b.carrera.inicio);
}

const API = "https://www.thesportsdb.com/api/v1/json/3";

export async function buscarCarreras(fetcher: typeof fetch = fetch): Promise<Carrera[]> {
  const pedir = async (url: string) => {
    const r = await fetcher(url, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  // Ligas argentinas de automovilismo (sus ids no se escriben a mano: se buscan por nombre).
  const ligas = ((await pedir(`${API}/search_all_leagues.php?c=Argentina&s=Motorsport`).catch(() => ({}))) as { countries?: { idLeague: string; strLeague: string }[] | null }).countries ?? [];
  const pedidos: [string, IdCategoria][] = [["4370", "f1"]];
  for (const l of ligas) {
    const cat = categoriaDe(l.strLeague);
    if (cat && cat !== "f1") pedidos.push([l.idLeague, cat]);
  }
  const resultados = await Promise.allSettled(
    pedidos.map(async ([id, cat]) => leerCarreras(((await pedir(`${API}/eventsnextleague.php?id=${id}`)) as { events?: EventoMotor[] | null }).events ?? [], cat)),
  );
  const delDirectorio = resultados.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return conCalendarioLocal(delDirectorio);
}

/** Suma el calendario argentino para las categorías que el directorio no trajo. */
export function conCalendarioLocal(delDirectorio: Carrera[]): Carrera[] {
  const traidas = new Set(delDirectorio.map((c) => c.categoria));
  return [...delDirectorio, ...carrerasDelCalendario().filter((c) => !traidas.has(c.categoria))];
}

/** Carreras de EJEMPLO para la demo. */
export function carrerasDeEjemplo(ahora: number): Carrera[] {
  const h = 3_600_000;
  return [
    { id: "c1", categoria: "tc", nombre: "Turismo Carretera · Fecha 13", circuito: "Autódromo de La Plata", inicio: ahora + 3 * 24 * h },
    { id: "c2", categoria: "tc2000", nombre: "TC2000 · Fecha 10", circuito: "Autódromo de Buenos Aires", inicio: ahora - 40 * 60_000 },
    { id: "c3", categoria: "toprace", nombre: "Top Race · Fecha 9", circuito: "Autódromo de San Nicolás", inicio: ahora + 10 * 24 * h },
    { id: "c4", categoria: "f1", nombre: "Gran Premio (ejemplo)", circuito: "Circuito de ejemplo", inicio: ahora + 5 * h },
  ];
}
