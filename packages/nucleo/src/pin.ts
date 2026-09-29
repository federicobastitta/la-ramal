/**
 * PIN para cancelar una alerta de pánico.
 *
 * Cada chofer tiene dos PIN:
 * - el PIN normal, que cierra la alerta;
 * - el PIN de coacción: si alguien lo obliga a cancelar, el celular muestra "Alerta cancelada" igual que siempre,
 *   pero el servidor la deja activa en silencio y la marca como coacción para la terminal.
 *
 * Solo se guardan hashes PBKDF2-SHA256 con sal. La verificación corre en el servidor (la función cancelarPanico),
 * nunca en el celular, así un celular robado no permite apagar alertas.
 */
export const ITERACIONES_PIN = 210_000;

export type HashPin = { sal: string; hash: string; iteraciones: number };
export type ResultadoPin = "valido" | "coaccion" | "invalido";

const cifras = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...(b instanceof Uint8Array ? b : new Uint8Array(b))));
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function pinValido(pin: string): boolean {
  // 4 a 8 números; no se aceptan secuencias obvias ni todos iguales.
  if (!/^\d{4,8}$/.test(pin)) return false;
  if (/^(\d)\1+$/.test(pin)) return false;
  const obvios = "0123456789012345678909876543210";
  return !obvios.includes(pin);
}

export async function hashearPin(pin: string, sal?: Uint8Array, iteraciones = ITERACIONES_PIN): Promise<HashPin> {
  const s = sal ?? crypto.getRandomValues(new Uint8Array(16));
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: s as Uint8Array<ArrayBuffer>, iterations: iteraciones }, clave, 256);
  return { sal: cifras(s), hash: cifras(bits), iteraciones };
}

async function coincide(pin: string, guardado: HashPin): Promise<boolean> {
  const calculado = await hashearPin(pin, bytes(guardado.sal), guardado.iteraciones);
  return igualesEnTiempoConstante(calculado.hash, guardado.hash);
}

export async function verificarPin(pin: string, normal: HashPin, coaccion?: HashPin): Promise<ResultadoPin> {
  // Se calculan los dos siempre, para que el tiempo de respuesta no delate cuál era.
  const [esNormal, esCoaccion] = await Promise.all([
    coincide(pin, normal),
    coaccion ? coincide(pin, coaccion) : Promise.resolve(false),
  ]);
  if (esCoaccion) return "coaccion";
  if (esNormal) return "valido";
  return "invalido";
}

export function igualesEnTiempoConstante(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}
