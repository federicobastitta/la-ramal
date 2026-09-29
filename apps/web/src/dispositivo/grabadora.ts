import { useCallback, useEffect, useRef, useState } from "react";

const FORMATOS = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

/** Graba el ruido raro del coche (freno, motor, suspensión) desde la app, hasta maxSeg segundos. */
export function useGrabadora(maxSeg = 30) {
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const fin = useRef<((b: Blob | null) => void) | null>(null);

  const parar = useCallback(() => {
    if (rec.current?.state === "recording") rec.current.stop();
  }, []);

  const grabar = useCallback(async (): Promise<Blob | null> => {
    setError(null);
    let flujo: MediaStream;
    try {
      // Sin filtros: se quiere el ruido tal cual, no la voz limpia.
      flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      setError("Sin permiso para el micrófono");
      return null;
    }
    const mimeType = FORMATOS.find((f) => MediaRecorder.isTypeSupported(f));
    const r = new MediaRecorder(flujo, mimeType ? { mimeType } : undefined);
    const partes: Blob[] = [];
    rec.current = r;
    return new Promise((ok) => {
      fin.current = ok;
      const inicio = Date.now();
      const reloj = setInterval(() => {
        const s = Math.floor((Date.now() - inicio) / 1000);
        setSegundos(s);
        if (s >= maxSeg) r.stop();
      }, 250);
      r.ondataavailable = (e) => e.data.size && partes.push(e.data);
      r.onstop = () => {
        clearInterval(reloj);
        flujo.getTracks().forEach((t) => t.stop());
        setGrabando(false);
        ok(partes.length ? new Blob(partes, { type: r.mimeType }) : null);
      };
      r.start(1000);
      setSegundos(0);
      setGrabando(true);
    });
  }, [maxSeg]);

  useEffect(() => () => parar(), [parar]);
  return { grabar, parar, grabando, segundos, error };
}
