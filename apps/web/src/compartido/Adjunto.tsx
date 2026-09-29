import { useEffect, useState } from "react";
import type { Adjunto as TAdjunto } from "@la-ramal/nucleo";
import type { Fuente } from "../datos";

/** Muestra una foto, un video o un audio guardado (en Storage o en el celular, según el modo). */
export function Adjunto({ fuente, a, chico = false }: { fuente: Fuente; a: TAdjunto; chico?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void fuente.urlAdjunto(a.ruta).then((u) => vivo && setUrl(u));
    return () => {
      vivo = false;
    };
  }, [fuente, a.ruta]);
  const tam = chico ? 56 : 96;
  if (!url) return <span className="muted">{a.tipo}…</span>;
  if (a.tipo === "foto") return <img src={url} alt="Foto del reporte" style={{ width: tam, height: tam, borderRadius: 8, objectFit: "cover" }} />;
  if (a.tipo === "video") return <video src={url} controls playsInline style={{ width: chico ? 120 : 220, borderRadius: 8 }} />;
  return <audio src={url} controls style={{ width: chico ? 180 : 240 }} />;
}
