import { useCallback, useRef, useState } from "react";

/** Mensaje corto abajo de la pantalla que se va solo. */
export function useAviso(ms = 2800) {
  const [texto, setTexto] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const avisar = useCallback(
    (s: string) => {
      setTexto(s);
      clearTimeout(t.current);
      t.current = setTimeout(() => setTexto(null), ms);
    },
    [ms],
  );
  return { texto, avisar };
}

export const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
export const haceCuanto = (ms: number, ahora = Date.now()) => {
  const m = Math.round((ahora - ms) / 60_000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
};
