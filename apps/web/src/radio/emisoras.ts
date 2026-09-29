/**
 * Radios AM/FM de Buenos Aires. La lista (nombre y frecuencia) es fija; la dirección de la transmisión
 * en vivo NO: las emisoras la cambian seguido. Por eso se busca al abrir la radio en el directorio
 * público Radio Browser (radio-browser.info) y se une por nombre.
 */
export type Banda = "AM" | "FM";
export type EmisoraConocida = { id: string; nombre: string; banda: Banda; frecuencia: string; buscar: RegExp };
export type Emisora = EmisoraConocida & { stream: string | null; logo: string | null };

export const EMISORAS: EmisoraConocida[] = [
  { id: "mitre", nombre: "Radio Mitre", banda: "AM", frecuencia: "790", buscar: /\bmitre\b/i },
  { id: "radio10", nombre: "Radio 10", banda: "AM", frecuencia: "710", buscar: /\bradio\s*10\b/i },
  { id: "continental", nombre: "Continental", banda: "AM", frecuencia: "590", buscar: /\bcontinental\b/i },
  { id: "rivadavia", nombre: "Rivadavia", banda: "AM", frecuencia: "630", buscar: /\brivadavia\b/i },
  { id: "nacional", nombre: "Radio Nacional", banda: "AM", frecuencia: "870", buscar: /\bradio nacional\b(?!.*(folk|cl[aá]sica|rock))/i },
  { id: "lared", nombre: "La Red", banda: "AM", frecuencia: "910", buscar: /\bla red\b/i },
  { id: "delplata", nombre: "Radio del Plata", banda: "AM", frecuencia: "1030", buscar: /\bdel plata\b/i },
  { id: "la100", nombre: "La 100", banda: "FM", frecuencia: "99.9", buscar: /\bla\s*100\b/i },
  { id: "rockandpop", nombre: "Rock & Pop", banda: "FM", frecuencia: "95.9", buscar: /\brock\s*(&|and|n|y)\s*pop\b/i },
  { id: "metro", nombre: "Metro", banda: "FM", frecuencia: "95.1", buscar: /\bmetro\b/i },
  { id: "aspen", nombre: "Aspen", banda: "FM", frecuencia: "102.3", buscar: /\baspen\b/i },
  { id: "disney", nombre: "Radio Disney", banda: "FM", frecuencia: "94.3", buscar: /\bradio disney\b/i },
  { id: "pop", nombre: "Pop Radio", banda: "FM", frecuencia: "101.5", buscar: /\bpop radio\b/i },
  { id: "convos", nombre: "Radio Con Vos", banda: "FM", frecuencia: "89.9", buscar: /\bcon\s*vos\b/i },
  { id: "urbana", nombre: "Urbana Play", banda: "FM", frecuencia: "104.3", buscar: /\burbana\b/i },
  { id: "vorterix", nombre: "Vorterix", banda: "FM", frecuencia: "92.1", buscar: /\bvorterix\b/i },
  { id: "mega", nombre: "Mega", banda: "FM", frecuencia: "98.3", buscar: /\bmega\b/i },
  { id: "blue", nombre: "Blue", banda: "FM", frecuencia: "100.7", buscar: /\bblue\b/i },
];

/** Lo que devuelve Radio Browser (solo los campos que usamos). */
export type EstacionDirectorio = { name: string; url_resolved: string; favicon: string; codec: string; bitrate: number; lastcheckok: number; clickcount: number };

/**
 * Une la lista conocida con el directorio: para cada emisora, la estación del directorio que coincide por nombre,
 * anda (lastcheckok) y es la más escuchada. Solo transmisiones https (el navegador bloquea http dentro de https).
 */
export function unirConDirectorio(conocidas: EmisoraConocida[], directorio: EstacionDirectorio[]): Emisora[] {
  return conocidas.map((e) => {
    const candidatas = directorio
      .filter((d) => e.buscar.test(d.name) && d.lastcheckok === 1 && d.url_resolved.startsWith("https://"))
      .sort((a, b) => b.clickcount - a.clickcount || b.bitrate - a.bitrate);
    const d = candidatas[0];
    return { ...e, stream: d?.url_resolved ?? null, logo: d?.favicon?.startsWith("https://") ? d.favicon : null };
  });
}

const SERVIDORES = ["https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info", "https://fi1.api.radio-browser.info", "https://nl1.api.radio-browser.info"];

/** Pide al directorio las estaciones argentinas más escuchadas, probando varios servidores. */
export async function buscarEmisoras(fetcher: typeof fetch = fetch): Promise<Emisora[]> {
  let ultimoError: unknown = null;
  for (const s of SERVIDORES) {
    try {
      const r = await fetcher(`${s}/json/stations/search?countrycode=AR&order=clickcount&reverse=true&limit=400&hidebroken=true`, { signal: AbortSignal.timeout(8_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return unirConDirectorio(EMISORAS, (await r.json()) as EstacionDirectorio[]);
    } catch (err) {
      ultimoError = err;
    }
  }
  throw ultimoError ?? new Error("Sin conexión con el directorio de radios");
}
