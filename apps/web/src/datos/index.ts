import { configFirebaseDelEntorno } from "./config";
import { FuenteDemo, SESION_DEMO_CHOFER, SESION_DEMO_TRAFICO } from "./demo";
import type { Fuente } from "./fuente";

/** Con las variables VITE_FIREBASE_* usa Firebase; sin ellas arranca en modo demo. */
export async function crearFuente(para: "chofer" | "panel"): Promise<Fuente> {
  const config = configFirebaseDelEntorno();
  if (config) {
    const { FuenteFirebase } = await import("./firebase");
    return new FuenteFirebase(config);
  }
  return new FuenteDemo(para === "chofer" ? SESION_DEMO_CHOFER : SESION_DEMO_TRAFICO);
}
export type { Fuente, Sesion, ArchivoLocal } from "./fuente";
