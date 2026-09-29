/**
 * Cola de envíos que aguanta la falta de señal (túneles, zonas sin cobertura, celular sin datos).
 *
 * - Todo lo que el chofer manda entra primero a la cola, guardada en el celular.
 * - Se intenta mandar enseguida; si falla, se reintenta con espera exponencial y algo de azar
 *   (para que 300 celulares no reintenten todos en el mismo segundo cuando vuelve la señal).
 * - Cada envío lleva su id (UUID) como clave de idempotencia: si el servidor ya lo tenía, cuenta como enviado.
 *   Así un reintento nunca duplica un reporte.
 * - Un error permanente (el servidor dice que el dato es inválido) saca el envío de la cola y lo informa.
 */
export type Pendiente<T> = { id: string; carga: T; intentos: number; proximoIntento: number; creado: number };

export interface Almacen<T> {
  todos(): Promise<Pendiente<T>[]>;
  poner(p: Pendiente<T>): Promise<void>;
  sacar(id: string): Promise<void>;
}

export class ErrorPermanente extends Error {
  override name = "ErrorPermanente";
}

export type OpcionesCola = {
  baseMs?: number;
  maxMs?: number;
  /** Después de estos intentos se sigue reintentando, pero con la espera máxima. */
  ahora?: () => number;
  azar?: () => number;
};

export type ResultadoVaciado<T> = { enviados: string[]; pendientes: number; rechazados: { id: string; carga: T; motivo: string }[] };

export function esperaReintento(intentos: number, baseMs: number, maxMs: number, azar: () => number): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, intentos - 1));
  // "Full jitter" acotado: entre la mitad y el total de la espera.
  return Math.round(exp * (0.5 + azar() / 2));
}

export class Cola<T> {
  private vaciando: Promise<ResultadoVaciado<T>> | null = null;
  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly ahora: () => number;
  private readonly azar: () => number;

  constructor(
    private readonly almacen: Almacen<T>,
    private readonly enviar: (id: string, carga: T) => Promise<void>,
    op: OpcionesCola = {},
  ) {
    this.baseMs = op.baseMs ?? 2_000;
    this.maxMs = op.maxMs ?? 5 * 60_000;
    this.ahora = op.ahora ?? Date.now;
    this.azar = op.azar ?? Math.random;
  }

  async encolar(id: string, carga: T): Promise<void> {
    const t = this.ahora();
    await this.almacen.poner({ id, carga, intentos: 0, proximoIntento: t, creado: t });
  }

  async cantidad(): Promise<number> {
    return (await this.almacen.todos()).length;
  }

  /** Manda lo que ya toca mandar. Si se llama mientras otro vaciado corre, devuelve ese mismo (no hay envíos dobles). */
  vaciar(): Promise<ResultadoVaciado<T>> {
    this.vaciando ??= this.vaciarUnaVez().finally(() => {
      this.vaciando = null;
    });
    return this.vaciando;
  }

  private async vaciarUnaVez(): Promise<ResultadoVaciado<T>> {
    const res: ResultadoVaciado<T> = { enviados: [], pendientes: 0, rechazados: [] };
    const todos = (await this.almacen.todos()).sort((a, b) => a.creado - b.creado);
    for (const p of todos) {
      if (p.proximoIntento > this.ahora()) {
        res.pendientes++;
        continue;
      }
      try {
        await this.enviar(p.id, p.carga);
        await this.almacen.sacar(p.id);
        res.enviados.push(p.id);
      } catch (err) {
        if (err instanceof ErrorPermanente) {
          await this.almacen.sacar(p.id);
          res.rechazados.push({ id: p.id, carga: p.carga, motivo: err.message });
          continue;
        }
        const intentos = p.intentos + 1;
        await this.almacen.poner({ ...p, intentos, proximoIntento: this.ahora() + esperaReintento(intentos, this.baseMs, this.maxMs, this.azar) });
        res.pendientes++;
      }
    }
    return res;
  }
}

/** Almacén en memoria, para pruebas y para el servidor. */
export class AlmacenEnMemoria<T> implements Almacen<T> {
  private readonly m = new Map<string, Pendiente<T>>();
  async todos() {
    return [...this.m.values()].map((p) => ({ ...p }));
  }
  async poner(p: Pendiente<T>) {
    this.m.set(p.id, { ...p });
  }
  async sacar(id: string) {
    this.m.delete(id);
  }
}
