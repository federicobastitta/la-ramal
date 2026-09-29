import { useEffect, useRef, useState } from "react";

/** ¿El coche está detenido? El truco solo se juega parado. */
export function useDetenido(demo: boolean): { detenido: boolean; motivo: string } {
  const [e, setE] = useState({ detenido: demo, motivo: demo ? "Demo: se hace de cuenta que estás detenido en la terminal" : "Buscando el GPS…" });
  const quietoDesde = useRef<number | null>(null);
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const v = p.coords.speed ?? 0;
        if (v <= 1) quietoDesde.current ??= Date.now();
        else quietoDesde.current = null;
        const parado = quietoDesde.current !== null && Date.now() - quietoDesde.current >= 10_000;
        setE({ detenido: parado, motivo: parado ? "Coche detenido" : "El coche está en movimiento: la partida espera" });
      },
      () => setE(demo ? { detenido: true, motivo: "Demo: se hace de cuenta que estás detenido en la terminal" } : { detenido: false, motivo: "Sin GPS no sabemos si estás detenido" }),
      { enableHighAccuracy: true, maximumAge: 2_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [demo]);
  return e;
}

