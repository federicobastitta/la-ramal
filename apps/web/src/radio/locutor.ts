/**
 * El locutor de la terminal: suena un «ding», la radio baja y una voz lee el mensaje; después la radio vuelve.
 * La voz es la del propio celular (síntesis de voz del navegador): gratis, sin claves y anda sin internet.
 * Los navegadores no dejan sonar nada hasta que la persona tocó la pantalla una vez: por eso `desbloquear()`
 * se engancha al primer toque.
 */

let radio: HTMLAudioElement | null = null;
let contexto: AudioContext | null = null;
let cola: Promise<void> = Promise.resolve();

/** La radio de la app se anota acá para que el locutor la pueda bajar. */
export function registrarRadio(a: HTMLAudioElement | null) {
  radio = a;
}

const hayVoz = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

function audio(): AudioContext | null {
  if (contexto) return contexto;
  const C = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  contexto = new C();
  return contexto;
}

/** Se llama en el primer toque de la pantalla: habilita el sonido y la voz para después. */
export function desbloquear() {
  const c = audio();
  if (c?.state === "suspended") void c.resume();
  if (hayVoz()) {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }
}

/** Engancha `desbloquear` al primer toque o tecla. Devuelve con qué soltarlo. */
export function desbloquearAlPrimerToque(): () => void {
  const fn = () => {
    desbloquear();
    quitar();
  };
  const quitar = () => {
    window.removeEventListener("pointerdown", fn);
    window.removeEventListener("keydown", fn);
  };
  window.addEventListener("pointerdown", fn, { once: true });
  window.addEventListener("keydown", fn, { once: true });
  return quitar;
}

const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** «Ding-dong» de dos notas, hecho en el momento (no hace falta ningún archivo de sonido). */
async function ding() {
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") await c.resume().catch(() => undefined);
  const nota = (hz: number, desde: number, dura: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, c.currentTime + desde);
    g.gain.exponentialRampToValueAtTime(0.6, c.currentTime + desde + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + desde + dura);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + desde);
    o.stop(c.currentTime + desde + dura + 0.05);
  };
  nota(1319, 0, 0.6); // mi
  nota(1047, 0.35, 0.9); // do
  await esperar(1300);
}

/** Voz en castellano: primero la argentina, después cualquier otra en español. */
function vozEnCastellano(): SpeechSynthesisVoice | null {
  const voces = window.speechSynthesis.getVoices();
  const orden = ["es-AR", "es-419", "es-US", "es-MX", "es-ES"];
  for (const l of orden) {
    const v = voces.find((x) => x.lang.replace("_", "-").toLowerCase() === l.toLowerCase());
    if (v) return v;
  }
  return voces.find((x) => x.lang.toLowerCase().startsWith("es")) ?? null;
}

function decir(texto: string): Promise<void> {
  if (!hayVoz()) return Promise.resolve();
  return new Promise((ok) => {
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-AR";
    const v = vozEnCastellano();
    if (v) u.voice = v;
    u.rate = 0.95;
    u.volume = 1;
    // Por si el celular nunca avisa que terminó: tope por largo del texto.
    const tope = setTimeout(ok, 4000 + texto.length * 120);
    u.onend = u.onerror = () => {
      clearTimeout(tope);
      ok();
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

/** Baja la radio mientras habla la terminal. En el iPhone el volumen no se puede cambiar: ahí se pausa y se retoma. */
async function conRadioBaja(fn: () => Promise<void>) {
  const a = radio;
  const sonando = !!a && !a.paused;
  const antes = a?.volume ?? 1;
  let pausada = false;
  if (a && sonando) {
    a.volume = 0.12;
    if (a.volume > 0.5) {
      a.pause();
      pausada = true;
    }
  }
  try {
    await fn();
  } finally {
    if (a && sonando) {
      a.volume = antes;
      if (pausada) await a.play().catch(() => undefined);
    }
  }
}

/** Ding + voz, uno atrás del otro (si llegan dos mensajes juntos no se pisan). */
export function anunciar(texto: string): Promise<void> {
  cola = cola.then(() => conRadioBaja(async () => {
    await ding();
    await decir(texto);
  })).catch(() => undefined);
  return cola;
}

export const vozDisponible = hayVoz;
