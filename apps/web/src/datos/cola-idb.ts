import { Cola, type Almacen, type NuevoReporte, type Pendiente } from "@la-ramal/nucleo";
import { idb } from "./idb";
import type { ArchivoLocal, Fuente } from "./fuente";

export type EnvioReporte = { reporte: NuevoReporte; archivos: ArchivoLocal[] };

/** La cola vive en IndexedDB: si el chofer cierra la app sin señal, el reporte sale cuando vuelva a abrirla. */
export class AlmacenIDB<T> implements Almacen<T> {
  async todos() {
    return idb.todos<Pendiente<T>>("cola");
  }
  async poner(p: Pendiente<T>) {
    await idb.poner("cola", p.id, p);
  }
  async sacar(id: string) {
    await idb.borrar("cola", id);
  }
}

export function crearColaDeReportes(fuente: Fuente) {
  const cola = new Cola<EnvioReporte>(new AlmacenIDB(), (_id, c) => fuente.enviarReporte(c.reporte, c.archivos));
  const vaciar = () => void cola.vaciar();
  // Se intenta al volver la señal, al volver a la app, cuando avisa el service worker y cada 30 s.
  window.addEventListener("online", vaciar);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && vaciar());
  navigator.serviceWorker?.addEventListener("message", (e) => e.data === "vaciar-cola" && vaciar());
  setInterval(vaciar, 30_000);
  return cola;
}
