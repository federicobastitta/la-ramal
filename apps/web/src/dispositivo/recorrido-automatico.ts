import { useEffect, useRef, useState } from "react";
import { compartirUbicacion, detectarVueltas, resumirJornada, type ConfigRecorrido, type Jornada, type Ping, type Planilla } from "@la-ramal/nucleo";
import type { Fuente, Sesion } from "../datos";
import { abrir, idb } from "../datos/idb";
import { hoyISO } from "../compartido/pdf";

const CADA_MS_RESUMEN = 60_000;
const DIAS_QUE_SE_GUARDAN = 30;

/** Horario del turno de la planilla, en milisegundos (hora argentina). */
export function ventanaDelTurno(p: Planilla): { desde: number; hasta: number } | null {
  if (p.franco || !p.vueltas.length) return null;
  const ms = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return Date.UTC(+p.fecha.slice(0, 4), +p.fecha.slice(5, 7) - 1, +p.fecha.slice(8, 10), (h ?? 0) + 3, m ?? 0);
  };
  const desde = ms(p.vueltas[0]!.sale);
  let hasta = ms(p.vueltas.at(-1)!.llega);
  if (hasta < desde) hasta += 86_400_000;
  return { desde, hasta };
}

export type EstadoRecorrido = { activo: boolean; motivo: string; vueltasHoy: number; enViajeDesde: string | null; lecturas: number };

/**
 * Vueltas automáticas: durante el turno lee el GPS, guarda las posiciones en el celular y cada minuto
 * arma el resumen del día (vueltas, paradas, km, exigencia) y lo sube. El chofer no aprieta nada.
 * Fuera del turno no lee la ubicación (privacidad). Las posiciones crudas nunca salen del celular.
 *
 * Límite de la versión web: con la pantalla apagada el navegador deja de leer el GPS.
 * La app instalada (Android) lo hará en segundo plano.
 */
export function useRecorridoAutomatico(fuente: Fuente | null, sesion: Sesion | null, planillaHoy: Planilla | undefined, config: ConfigRecorrido | undefined): EstadoRecorrido {
  const [estado, setEstado] = useState<EstadoRecorrido>({ activo: false, motivo: "Esperando la planilla de hoy", vueltasHoy: 0, enViajeDesde: null, lecturas: 0 });
  const buffer = useRef<Ping[]>([]);

  useEffect(() => {
    if (!fuente || !sesion || sesion.rol !== "chofer") return;
    if (!config) return setEstado((e) => ({ ...e, activo: false, motivo: "La línea todavía no cargó el recorrido" }));
    if (!planillaHoy) return setEstado((e) => ({ ...e, activo: false, motivo: "Sin planilla hoy" }));
    const turno = ventanaDelTurno(planillaHoy);
    if (!turno) return setEstado((e) => ({ ...e, activo: false, motivo: "Hoy es franco" }));
    if (!("geolocation" in navigator)) return setEstado((e) => ({ ...e, activo: false, motivo: "Este celular no tiene GPS disponible" }));

    const fecha = hoyISO();
    const clave = `${sesion.uid}/${fecha}`;
    let vivo = true;

    const guardarBuffer = async () => {
      if (!buffer.current.length) return;
      const nuevos = buffer.current.splice(0);
      const previos = (await idb.leer<Ping[]>("pings", clave)) ?? [];
      await idb.poner("pings", clave, [...previos, ...nuevos]);
    };

    const resumir = async () => {
      await guardarBuffer();
      const pings = (await idb.leer<Ping[]>("pings", clave)) ?? [];
      const ramal = planillaHoy.ramal || config.ramales[0]?.nombre || "";
      const j: Jornada = resumirJornada(pings, config, { id: `${sesion.uid}-${fecha}`, lineaId: sesion.lineaId, choferId: sesion.uid, fecha, ramal });
      const { enViaje } = detectarVueltas(pings, config.cabeceras);
      if (j.vueltas.length) await fuente.guardarJornada(j).catch(() => undefined);
      if (vivo) setEstado({ activo: true, motivo: "Contando las vueltas solo", vueltasHoy: j.vueltas.length, enViajeDesde: enViaje?.desde ?? null, lecturas: pings.length });
    };

    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (!compartirUbicacion(Date.now(), [turno], false)) return;
        buffer.current.push({ lat: p.coords.latitude, lng: p.coords.longitude, precisionM: Math.round(p.coords.accuracy), en: p.timestamp });
      },
      () => vivo && setEstado((e) => ({ ...e, activo: false, motivo: "Sin permiso de ubicación: las vueltas no se cuentan" })),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
    void resumir();
    const reloj = setInterval(() => void resumir(), CADA_MS_RESUMEN);
    void borrarViejos(sesion.uid);
    return () => {
      vivo = false;
      navigator.geolocation.clearWatch(id);
      clearInterval(reloj);
      void guardarBuffer();
    };
  }, [fuente, sesion, planillaHoy, config]);

  return estado;
}

/** Las posiciones de más de 30 días se borran del celular. */
async function borrarViejos(uid: string) {
  const limite = new Date(Date.now() - DIAS_QUE_SE_GUARDAN * 86_400_000);
  const corte = hoyISO(limite);
  const db = await abrir();
  const t = db.transaction("pings", "readwrite");
  const s = t.objectStore("pings");
  const pedido = s.getAllKeys(IDBKeyRange.bound(`${uid}/`, `${uid}/${corte}`, false, true));
  pedido.onsuccess = () => (pedido.result as string[]).forEach((k) => s.delete(k));
}
