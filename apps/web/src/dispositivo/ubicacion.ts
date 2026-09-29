import { useEffect, useState } from "react";
import type { Ubicacion } from "@la-ramal/nucleo";

export type EstadoUbicacion = { ubicacion: Ubicacion | null; error: string | null };

/** Sigue el GPS del celular. Alta precisión: el coche se mueve y un error de 1 km no sirve para un reporte. */
export function useUbicacion(activa = true): EstadoUbicacion {
  const [estado, setEstado] = useState<EstadoUbicacion>({ ubicacion: null, error: null });
  useEffect(() => {
    if (!activa) return;
    if (!("geolocation" in navigator)) {
      setEstado({ ubicacion: null, error: "Este celular no tiene GPS disponible" });
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => setEstado({ ubicacion: { lat: p.coords.latitude, lng: p.coords.longitude, precisionM: Math.round(p.coords.accuracy), en: p.timestamp }, error: null }),
      (e) => setEstado((s) => ({ ...s, error: e.code === e.PERMISSION_DENIED ? "Sin permiso de ubicación: activalo para que los reportes lleguen con el lugar" : "No se pudo leer el GPS" })),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [activa]);
  return estado;
}

/** Una lectura puntual, para el momento exacto del reporte o del pánico. */
export function leerUbicacion(timeoutMs = 8_000): Promise<Ubicacion | null> {
  return new Promise((ok) => {
    if (!("geolocation" in navigator)) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precisionM: Math.round(p.coords.accuracy), en: p.timestamp }),
      () => ok(null),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: timeoutMs },
    );
  });
}
