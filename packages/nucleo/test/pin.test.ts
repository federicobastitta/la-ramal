import { describe, expect, it } from "vitest";
import { hashearPin, igualesEnTiempoConstante, pinValido, verificarPin } from "../src/pin";

describe("PIN de cancelación", () => {
  it("rechaza PIN débiles", () => {
    expect(pinValido("1234")).toBe(false);
    expect(pinValido("0000")).toBe(false);
    expect(pinValido("4321")).toBe(false);
    expect(pinValido("12a4")).toBe(false);
    expect(pinValido("7391")).toBe(true);
  });

  it("distingue PIN normal, de coacción e inválido", async () => {
    const normal = await hashearPin("7391", undefined, 1000);
    const coaccion = await hashearPin("7392", undefined, 1000);
    expect(await verificarPin("7391", normal, coaccion)).toBe("valido");
    expect(await verificarPin("7392", normal, coaccion)).toBe("coaccion");
    expect(await verificarPin("0000", normal, coaccion)).toBe("invalido");
  });

  it("la misma clave con otra sal da otro hash", async () => {
    const a = await hashearPin("7391", undefined, 1000);
    const b = await hashearPin("7391", undefined, 1000);
    expect(a.hash).not.toBe(b.hash);
  });

  it("comparación de largo distinto", () => {
    expect(igualesEnTiempoConstante("abc", "abcd")).toBe(false);
    expect(igualesEnTiempoConstante("abc", "abc")).toBe(true);
  });
});
