import { describe, expect, it } from "vitest";
import { EMISORAS, buscarEmisoras, unirConDirectorio, type EstacionDirectorio } from "../src/radio/emisoras";

const est = (name: string, url: string, extra: Partial<EstacionDirectorio> = {}): EstacionDirectorio => ({ name, url_resolved: url, favicon: "", codec: "MP3", bitrate: 64, lastcheckok: 1, clickcount: 10, ...extra });

describe("radios AM/FM", () => {
  it("une cada emisora con la estación que anda y más se escucha", () => {
    const r = unirConDirectorio(EMISORAS, [
      est("Radio Mitre AM 790", "https://a/mitre-vieja", { clickcount: 5 }),
      est("Radio Mitre", "https://a/mitre", { clickcount: 900 }),
      est("La 100 FM 99.9", "https://a/la100"),
      est("Rock & Pop 95.9", "http://a/sin-https"),
      est("Metro 95.1", "https://a/metro-caida", { lastcheckok: 0 }),
    ]);
    const por = (id: string) => r.find((e) => e.id === id)!;
    expect(por("mitre").stream).toBe("https://a/mitre");
    expect(por("la100").stream).toBe("https://a/la100");
    expect(por("rockandpop").stream).toBeNull(); // solo https
    expect(por("metro").stream).toBeNull(); // no anda
  });

  it("Radio 10 no se confunde con La 100", () => {
    const r = unirConDirectorio(EMISORAS, [est("La 100", "https://a/la100")]);
    expect(r.find((e) => e.id === "radio10")!.stream).toBeNull();
  });

  it("si un servidor del directorio falla, prueba el siguiente", async () => {
    let intentos = 0;
    const falso = (async () => {
      intentos++;
      if (intentos === 1) throw new Error("caído");
      return new Response(JSON.stringify([est("Aspen 102.3", "https://a/aspen")]));
    }) as unknown as typeof fetch;
    const r = await buscarEmisoras(falso);
    expect(intentos).toBe(2);
    expect(r.find((e) => e.id === "aspen")!.stream).toBe("https://a/aspen");
  });

  it("todas tienen frecuencia y banda", () => {
    for (const e of EMISORAS) expect(e.frecuencia).toMatch(/^\d{2,4}(\.\d)?$/);
  });
});

describe("arranque de la demo", () => {
  it("prueba primero la preferida, después su banda y al final la otra; solo con transmisión", async () => {
    const { ordenDeArranque } = await import("../src/radio/emisoras");
    const r = unirConDirectorio(EMISORAS, [
      est("Radio Mitre", "https://a/mitre"),
      est("Radio 10", "https://a/radio10"),
      est("La 100", "https://a/la100"),
    ]);
    expect(ordenDeArranque(r, "AM", "mitre").map((e) => e.id)).toEqual(["mitre", "radio10", "la100"]);
    // Si la preferida no transmite, igual arranca otra AM.
    const sinMitre = r.map((e) => (e.id === "mitre" ? { ...e, stream: null } : e));
    expect(ordenDeArranque(sinMitre, "AM", "mitre").map((e) => e.id)).toEqual(["radio10", "la100"]);
    expect(ordenDeArranque(r.map((e) => ({ ...e, stream: null })), "AM", "mitre")).toEqual([]);
  });
});
