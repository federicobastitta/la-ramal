import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { FuenteDemo, SESION_DEMO_CHOFER } from "../src/datos/demo";
import type { AlertaPanico, NuevoReporte, Reporte } from "@la-ramal/nucleo";

const f = new FuenteDemo(SESION_DEMO_CHOFER);
const L = SESION_DEMO_CHOFER.lineaId;
const ubicacion = { lat: -34.72, lng: -58.25, precisionM: 10, en: 1 };

const esperar = <T,>(suscribir: (cb: (v: T) => void) => () => void, cond: (v: T) => boolean) =>
  new Promise<T>((ok) => {
    const fin = suscribir((v) => {
      if (cond(v)) {
        queueMicrotask(() => fin());
        ok(v);
      }
    });
  });

describe("fuente demo", () => {
  it("un reporte mandado dos veces queda una sola vez y clasificado", async () => {
    const r: NuevoReporte = { id: crypto.randomUUID(), lineaId: L, cocheId: "Interno 23", choferId: "u", tipo: "coche", texto: "sale humo", ubicacion, creadoEn: 1, adjuntos: [] };
    await f.enviarReporte(r, []);
    await f.enviarReporte(r, []);
    const rs = await esperar<Reporte[]>((cb) => f.escucharReportes(L, cb), (v) => v.some((x) => x.id === r.id));
    expect(rs.filter((x) => x.id === r.id)).toHaveLength(1);
    expect(rs.find((x) => x.id === r.id)?.clasificacion).toMatchObject({ area: "taller", urgencia: "alta", origen: "reglas" });
  });

  it("PIN incorrecto no cierra; el de coacción la oculta al chofer pero no al panel", async () => {
    const a: AlertaPanico = { id: crypto.randomUUID(), lineaId: L, cocheId: "Interno 23", choferId: "u", estado: "activa", desde: 1, ubicaciones: [ubicacion], origen: "pantalla" };
    await f.dispararPanico(a);
    expect(await f.cancelarPanico(L, a.id, "0000")).toBe("pin_incorrecto");
    expect(await f.cancelarPanico(L, a.id, "7392")).toBe("cerrada");
    expect(await esperar<AlertaPanico | null>((cb) => f.escucharMiPanico(L, a.id, cb), () => true)).toBeNull();
    const panel = await esperar<AlertaPanico[]>((cb) => f.escucharPanicos(L, cb), (v) => v.some((x) => x.id === a.id));
    expect(panel.find((x) => x.id === a.id)?.coaccion).toBe(true);
  });
});
