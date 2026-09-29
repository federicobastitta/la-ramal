import { describe, expect, it } from "vitest";
import { buscarCarreras, categoriaDe, leerCarreras, proximasCarreras, type Carrera } from "../src/radio/automovilismo";

describe("carreras en la radio", () => {
  it("reconoce la categoría sin confundir TC con TC2000", () => {
    expect(categoriaDe("Turismo Carretera")).toBe("tc");
    expect(categoriaDe("TC 2000")).toBe("tc2000");
    expect(categoriaDe("Top Race V6")).toBe("toprace");
    expect(categoriaDe("Formula 1")).toBe("f1");
    expect(categoriaDe("Rally Argentino")).toBeNull();
  });

  it("una carrera por categoría: la que se corre ahora o la próxima; primero las favoritas", () => {
    const ahora = Date.UTC(2026, 9, 4, 15, 0);
    const d = 86_400_000;
    const cs: Carrera[] = [
      { id: "tc-1", categoria: "tc", nombre: "TC fecha 13", circuito: "La Plata", inicio: ahora + 3 * d },
      { id: "tc-2", categoria: "tc", nombre: "TC fecha 14", circuito: "Paraná", inicio: ahora + 17 * d },
      { id: "f1-vivo", categoria: "f1", nombre: "GP", circuito: "", inicio: ahora - 30 * 60_000 },
      { id: "tr-vieja", categoria: "toprace", nombre: "vieja", circuito: "", inicio: ahora - 5 * 3_600_000 },
      { id: "tn-lejos", categoria: "tn", nombre: "lejos", circuito: "", inicio: ahora + 45 * d },
    ];
    const s = proximasCarreras(cs, ["tc"], ahora);
    expect(s.map((x) => x.carrera.id)).toEqual(["tc-1", "f1-vivo"]);
    expect(s[1]!.estado).toBe("en_vivo");
  });

  it("busca las categorías argentinas por nombre y aguanta que una falle", async () => {
    const pedidas: string[] = [];
    const falso = (async (url: string) => {
      pedidas.push(url);
      if (url.includes("search_all_leagues")) return new Response(JSON.stringify({ countries: [{ idLeague: "999", strLeague: "Turismo Carretera" }, { idLeague: "888", strLeague: "Rally" }] }));
      if (url.includes("id=4370")) throw new Error("caído");
      return new Response(JSON.stringify({ events: [{ idEvent: "1", strEvent: "Fecha 13", strVenue: "La Plata", strTimestamp: "2026-10-11T16:00:00" }] }));
    }) as unknown as typeof fetch;
    const r = await buscarCarreras(falso);
    expect(pedidas.some((u) => u.includes("id=888"))).toBe(false);
    // El TC vino del directorio: no se duplica con el calendario local. TC2000 y Top Race salen del calendario local.
    expect(r.filter((c) => c.categoria === "tc")).toEqual(leerCarreras([{ idEvent: "1", strEvent: "Fecha 13", strVenue: "La Plata", strTimestamp: "2026-10-11T16:00:00" }], "tc"));
    expect(r.some((c) => c.categoria === "tc2000" && c.horaConfirmada === false)).toBe(true);
  });
});

import { carrerasDelCalendario } from "../src/radio/calendario-argentino";
describe("calendario argentino sin hora", () => {
  it("el día de la carrera dice hoy, nunca 'en vivo' ni una hora inventada", () => {
    const tc = carrerasDelCalendario().find((c) => c.id === "tc-2026-12")!; // 4/10 San Nicolás
    const mediodia = Date.parse("2026-10-04T15:00:00Z");
    const s = proximasCarreras([tc], ["tc"], mediodia)[0]!;
    expect(s.estado).toBe("hoy");
    const dosDiasAntes = Date.parse("2026-10-02T15:00:00Z");
    expect(proximasCarreras([tc], ["tc"], dosDiasAntes)[0]!.estado).toBe("proxima");
    expect(proximasCarreras([tc], ["tc"], Date.parse("2026-10-05T12:00:00Z"))).toEqual([]);
  });
  it("todas las fechas son válidas y futuras al 29/09/2026", () => {
    for (const c of carrerasDelCalendario()) expect(c.inicio).toBeGreaterThan(Date.parse("2026-09-29T00:00:00Z"));
  });
});
