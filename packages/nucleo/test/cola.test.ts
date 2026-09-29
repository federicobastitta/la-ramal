import { describe, expect, it } from "vitest";
import { AlmacenEnMemoria, Cola, ErrorPermanente, esperaReintento } from "../src/cola";

describe("cola sin señal", () => {
  it("manda en orden y vacía la cola", async () => {
    const mandados: string[] = [];
    let t = 0;
    const cola = new Cola(new AlmacenEnMemoria<string>(), async (id) => void mandados.push(id), { ahora: () => t++ });
    await cola.encolar("a", "1");
    await cola.encolar("b", "2");
    const r = await cola.vaciar();
    expect(mandados).toEqual(["a", "b"]);
    expect(r.enviados).toEqual(["a", "b"]);
    expect(await cola.cantidad()).toBe(0);
  });

  it("sin señal espera y reintenta después", async () => {
    let t = 0;
    let senal = false;
    const cola = new Cola(new AlmacenEnMemoria<string>(), async () => { if (!senal) throw new Error("sin red"); }, { ahora: () => t, azar: () => 1, baseMs: 1000 });
    await cola.encolar("a", "x");
    expect((await cola.vaciar()).pendientes).toBe(1);
    senal = true;
    expect((await cola.vaciar()).enviados).toEqual([]); // todavía no toca
    t = 1000;
    expect((await cola.vaciar()).enviados).toEqual(["a"]);
  });

  it("un error permanente saca el envío y lo informa", async () => {
    const cola = new Cola(new AlmacenEnMemoria<string>(), async () => { throw new ErrorPermanente("dato inválido"); });
    await cola.encolar("a", "x");
    const r = await cola.vaciar();
    expect(r.rechazados).toEqual([{ id: "a", carga: "x", motivo: "dato inválido" }]);
    expect(await cola.cantidad()).toBe(0);
  });

  it("dos vaciados a la vez no mandan dos veces", async () => {
    let envios = 0;
    const cola = new Cola(new AlmacenEnMemoria<string>(), async () => { envios++; await new Promise((r) => setTimeout(r, 10)); });
    await cola.encolar("a", "x");
    await Promise.all([cola.vaciar(), cola.vaciar()]);
    expect(envios).toBe(1);
  });

  it("la espera crece y tiene techo", () => {
    expect(esperaReintento(1, 1000, 60_000, () => 1)).toBe(1000);
    expect(esperaReintento(3, 1000, 60_000, () => 1)).toBe(4000);
    expect(esperaReintento(30, 1000, 60_000, () => 1)).toBe(60_000);
    expect(esperaReintento(3, 1000, 60_000, () => 0)).toBe(2000);
  });
});
