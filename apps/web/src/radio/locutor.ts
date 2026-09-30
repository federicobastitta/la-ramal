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

/**
 * «Tomar el sonido del celular» mientras habla la terminal (dueño, 30/09: «que suspenda todos los audios de ese
 * celular, que se ponga por encima de todas las aplicaciones de sonido»). Desde una página web se hace con dos cosas:
 * - iPhone (Safari 17 o más nuevo): la sesión de audio pasa a «transient-solo», que corta el audio de las otras apps
 *   mientras dura el aviso y después lo devuelve.
 * - Android (Chrome): el celular le da el sonido a la app que reproduce algo largo; durante el aviso suena un audio
 *   en silencio de 10 s en bucle, así Spotify, YouTube u otra radio se pausan. Si la radio de LA RAMAL está sonando
 *   ya tiene el sonido y no hace falta.
 * Con el celular bloqueado o la app cerrada una página web no puede hacerlo: eso lo va a hacer la app nativa
 * (Play Store / App Store) pidiendo el «foco de audio» al sistema.
 */
let foco: HTMLAudioElement | null = null;

/** WAV de 10 s en silencio (8 kHz, 8 bits, mono) hecho en el momento: no hace falta ningún archivo. */
function silencio(): string {
  const n = 8000 * 10;
  const b = new ArrayBuffer(44 + n);
  const v = new DataView(b);
  const txt = (o: number, t: string) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  txt(0, "RIFF"); v.setUint32(4, 36 + n, true); txt(8, "WAVE"); txt(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); txt(36, "data"); v.setUint32(40, n, true);
  new Uint8Array(b, 44).fill(128);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

function elementoFoco(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!foco) {
    foco = new Audio(silencio());
    foco.loop = true;
  }
  return foco;
}

type SesionAudio = { type: string };
const sesionAudio = (): SesionAudio | null =>
  (typeof navigator !== "undefined" && (navigator as unknown as { audioSession?: SesionAudio }).audioSession) || null;

/** Toma el sonido del celular; devuelve con qué soltarlo. */
async function tomarSonido(): Promise<() => void> {
  const s = sesionAudio();
  const tipoAntes = s?.type;
  try {
    if (s) s.type = "transient-solo";
  } catch {
    /* navegador sin sesión de audio */
  }
  const radioSonando = !!radio && !radio.paused;
  const f = radioSonando ? null : elementoFoco();
  if (f) await f.play().catch(() => undefined);
  const ms = typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null;
  const metaAntes = ms?.metadata ?? null;
  try {
    if (ms && typeof MediaMetadata !== "undefined") ms.metadata = new MediaMetadata({ title: "📻 Mensaje de la terminal", artist: "LA RAMAL" });
  } catch {
    /* sin Media Session */
  }
  return () => {
    f?.pause();
    try {
      if (s && tipoAntes) s.type = tipoAntes;
    } catch {
      /* nada */
    }
    try {
      if (ms) ms.metadata = metaAntes;
    } catch {
      /* nada */
    }
  };
}

/**
 * Chrome y el iPhone callan la voz (y el ding) si la persona todavía no tocó la página, sin avisar ni dar error:
 * el mensaje se daba por dicho y no se escuchaba. Ahora el locutor espera al primer toque para hablar.
 */
let habilitar: () => void = () => {};
const habilitado = new Promise<void>((ok) => {
  habilitar = ok;
});
function yaTocaron(): boolean {
  const ua = typeof navigator !== "undefined" ? (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation : undefined;
  return !!ua?.hasBeenActive;
}

/** Se llama en el primer toque de la pantalla: habilita el sonido y la voz para después. */
export function desbloquear() {
  habilitar();
  const c = audio();
  if (c?.state === "suspended") void c.resume();
  // El iPhone solo deja reproducir más tarde un audio que ya se tocó una vez con un toque de la persona.
  const f = elementoFoco();
  if (f) void f.play().then(() => f.pause()).catch(() => undefined);
  if (hayVoz()) {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }
}

/** Da play a la radio de la app en el mismo toque de la persona (el iPhone no deja hacerlo después, en diferido). */
export function despertarRadio() {
  if (radio && radio.src && radio.paused) void radio.play().catch(() => undefined);
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

/** Ding + voz, uno atrás del otro (si llegan dos mensajes juntos no se pisan). Mientras, se toma el sonido del celular. */
export function anunciar(texto: string): Promise<void> {
  cola = cola.then(() => (yaTocaron() ? undefined : habilitado)).then(() => conRadioBaja(async () => {
    const soltar = await tomarSonido();
    try {
      await ding();
      await decir(texto);
    } finally {
      soltar();
    }
  })).catch(() => undefined);
  return cola;
}

export const vozDisponible = hayVoz;
