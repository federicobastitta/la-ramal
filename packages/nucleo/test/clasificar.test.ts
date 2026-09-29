import { describe, expect, it } from "vitest";
import { clasificarPorReglas, unirClasificacion } from "../src/clasificar";
import { NuevoReporte } from "../src/esquemas";

describe("clasificación", () => {
  it("un freno que falla es urgente y va al taller", () => {
    expect(clasificarPorReglas({ tipo: "coche", texto: "El freno delantero hace ruido" })).toMatchObject({ area: "taller", urgencia: "alta" });
  });
  it("un desperfecto menor es media", () => {
    expect(clasificarPorReglas({ tipo: "coche", texto: "no anda la luz del salón" }).urgencia).toBe("media");
  });
  it("heridos suben la urgencia de cualquier reporte", () => {
    expect(clasificarPorReglas({ tipo: "embotellamiento", texto: "hay un herido en la esquina" }).urgencia).toBe("alta");
  });
  it("la IA puede subir la urgencia pero no bajarla", () => {
    const regla = clasificarPorReglas({ tipo: "agresor", texto: "" });
    const unida = unirClasificacion(regla, { area: "seguridad", urgencia: "baja", resumen: "Discusión con pasajero" });
    expect(unida.urgencia).toBe("alta");
    expect(unida.origen).toBe("ia");
  });
  it("el esquema rechaza un reporte sin ubicación o con id inválido", () => {
    expect(NuevoReporte.safeParse({ id: "no-uuid", tipo: "coche" }).success).toBe(false);
  });
});
