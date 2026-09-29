/** Envoltorio mínimo sobre IndexedDB con promesas (sin dependencias). */
export const TIENDAS = ["reportes", "panicos", "archivos", "cola"] as const;
export type Tienda = (typeof TIENDAS)[number];

let abierta: Promise<IDBDatabase> | null = null;

export function abrir(nombre = "la-ramal", version = 1): Promise<IDBDatabase> {
  abierta ??= new Promise((ok, mal) => {
    const pedido = indexedDB.open(nombre, version);
    pedido.onupgradeneeded = () => {
      for (const t of TIENDAS) if (!pedido.result.objectStoreNames.contains(t)) pedido.result.createObjectStore(t);
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => mal(pedido.error);
  });
  return abierta;
}

function tx<T>(tienda: Tienda, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((ok, mal) => {
        const t = db.transaction(tienda, modo);
        const r = fn(t.objectStore(tienda));
        t.oncomplete = () => ok(r.result);
        t.onerror = () => mal(t.error);
        t.onabort = () => mal(t.error);
      }),
  );
}

export const idb = {
  leer: <T>(tienda: Tienda, clave: string) => tx<T | undefined>(tienda, "readonly", (s) => s.get(clave) as IDBRequest<T | undefined>),
  todos: <T>(tienda: Tienda) => tx<T[]>(tienda, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
  poner: <T>(tienda: Tienda, clave: string, valor: T) => tx(tienda, "readwrite", (s) => s.put(valor, clave)).then(() => undefined),
  borrar: (tienda: Tienda, clave: string) => tx(tienda, "readwrite", (s) => s.delete(clave)).then(() => undefined),
};

/** Solo para las pruebas: olvida la conexión abierta. */
export function _reiniciarParaPruebas() {
  abierta = null;
}
