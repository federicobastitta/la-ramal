/**
 * Prode del fútbol argentino entre compañeros: 3 puntos por resultado exacto, 1 por acertar quién gana o el empate.
 */
export type Partido = { id: string; local: string; visitante: string; cuando: string; golesLocal?: number; golesVisitante?: number };
export type Pronostico = { partidoId: string; local: number; visitante: number };

const signo = (a: number, b: number) => Math.sign(a - b);

export function puntosPronostico(p: Pronostico, partido: Partido): number | null {
  if (partido.golesLocal === undefined || partido.golesVisitante === undefined) return null;
  if (p.local === partido.golesLocal && p.visitante === partido.golesVisitante) return 3;
  return signo(p.local, p.visitante) === signo(partido.golesLocal, partido.golesVisitante) ? 1 : 0;
}

export function tablaProde(pronosticos: { quien: string; pronosticos: Pronostico[] }[], partidos: Partido[]): { quien: string; puntos: number; exactos: number }[] {
  const porId = new Map(partidos.map((p) => [p.id, p]));
  return pronosticos
    .map(({ quien, pronosticos: ps }) => {
      let puntos = 0;
      let exactos = 0;
      for (const p of ps) {
        const partido = porId.get(p.partidoId);
        const pts = partido ? puntosPronostico(p, partido) : null;
        if (pts === null) continue;
        puntos += pts;
        if (pts === 3) exactos++;
      }
      return { quien, puntos, exactos };
    })
    .sort((a, b) => b.puntos - a.puntos || b.exactos - a.exactos || a.quien.localeCompare(b.quien));
}
