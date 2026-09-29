import { describe, expect, it } from "vitest";
import { clubDe, leerEventos, sugerirPartidos, type Partido } from "../src/radio/futbol";

describe("fútbol en la radio", () => {
  it("reconoce el club sin confundir parecidos", () => {
    expect(clubDe("CA Boca Juniors")).toBe("Boca Juniors");
    expect(clubDe("Boca")).toBe("Boca Juniors");
    expect(clubDe("Independiente Rivadavia")).toBe("Independiente Rivadavia");
    expect(clubDe("Independiente")).toBe("Independiente");
    expect(clubDe("Central Córdoba")).toBe("Central Córdoba");
    expect(clubDe("Rosario Central")).toBe("Rosario Central");
    expect(clubDe("Newell's Old Boys")).toBe("Newell's Old Boys");
    expect(clubDe("Club Atlético Vélez Sarsfield")).toBe("Vélez Sarsfield");
  });

  it("lee el fixture con hora UTC", () => {
    const p = leerEventos([
      { idEvent: "1", strHomeTeam: "Boca Juniors", strAwayTeam: "Racing Club", strTimestamp: "2026-10-04T20:00:00" },
      { idEvent: "2", strHomeTeam: "River Plate", strAwayTeam: "Huracán", dateEvent: "2026-10-05", strTime: "19:30:00" },
      { idEvent: "3", strHomeTeam: "X", strAwayTeam: "Y" },
    ]);
    expect(p.map((x) => x.id)).toEqual(["1", "2"]);
    expect(new Date(p[0]!.inicio).toISOString()).toBe("2026-10-04T20:00:00.000Z");
  });

  it("primero tu equipo, después lo que se juega ahora; no sugiere lo terminado", () => {
    const ahora = Date.UTC(2026, 9, 4, 18, 0);
    const h = 3_600_000;
    const ps: Partido[] = [
      { id: "vivo", local: "River Plate", visitante: "Independiente", inicio: ahora - 30 * 60_000, torneo: "" },
      { id: "mio", local: "Boca Juniors", visitante: "Racing Club", inicio: ahora + 3 * h, torneo: "" },
      { id: "terminado", local: "Lanús", visitante: "Tigre", inicio: ahora - 3 * h, torneo: "" },
      { id: "lejos", local: "Talleres", visitante: "Belgrano", inicio: ahora + 5 * 24 * h, torneo: "" },
    ];
    const s = sugerirPartidos(ps, "Boca Juniors", ahora);
    expect(s.map((x) => x.partido.id)).toEqual(["mio", "vivo"]);
    expect(s[0]).toMatchObject({ esMiEquipo: true, estado: "hoy", faltaMin: 180 });
    expect(s[1]!.estado).toBe("en_vivo");
  });
});
