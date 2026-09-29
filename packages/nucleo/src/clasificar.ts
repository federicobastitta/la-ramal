import type { Area, Clasificacion, NuevoReporte, TipoReporte, Urgencia } from "./esquemas";
import { NOMBRE_TIPO } from "./esquemas";

/**
 * Clasificación inmediata por reglas: corre en el servidor apenas llega el reporte, sin IA y sin costo.
 * La IA (Claude) después puede afinarla leyendo el texto, pero la regla nunca espera a la IA:
 * un agresor o un choque llegan a la terminal en el acto.
 */
const AREA_POR_TIPO: Record<TipoReporte, Area> = {
  coche: "taller",
  embotellamiento: "trafico",
  choque: "siniestros",
  agresor: "seguridad",
  corte: "trafico",
  calle: "trafico",
  otro: "trafico",
};

const URGENCIA_POR_TIPO: Record<TipoReporte, Urgencia> = {
  coche: "media",
  embotellamiento: "baja",
  choque: "alta",
  agresor: "alta",
  corte: "media",
  calle: "baja",
  otro: "baja",
};

/** Palabras que suben la urgencia de un desperfecto: el coche no debería seguir en la calle. */
const PELIGRO_EN_COCHE = /\b(fren\w*|humo|fuego|incendi\w*|olor a quemado|direcci[oó]n|rueda floja|pierde aceite|puerta no cierra|sin luces)\b/i;
const HERIDOS = /\b(herid\w*|lesionad\w*|sangr\w*|ambulancia|inconscient\w*)\b/i;
const ARMAS = /\b(arma|cuchillo|pistola|rev[oó]lver|faca)\b/i;

export function clasificarPorReglas(r: Pick<NuevoReporte, "tipo" | "texto">): Clasificacion {
  const area = AREA_POR_TIPO[r.tipo];
  let urgencia = URGENCIA_POR_TIPO[r.tipo];
  const texto = r.texto ?? "";
  if (r.tipo === "coche" && PELIGRO_EN_COCHE.test(texto)) urgencia = "alta";
  if (HERIDOS.test(texto) || ARMAS.test(texto)) urgencia = "alta";
  const resumen = (texto.trim() ? `${NOMBRE_TIPO[r.tipo]}: ${texto.trim()}` : NOMBRE_TIPO[r.tipo]).slice(0, 140);
  return { area, urgencia, resumen, origen: "reglas" };
}

const ORDEN_URGENCIA: Record<Urgencia, number> = { baja: 0, media: 1, alta: 2 };

/**
 * Une la regla con lo que propone la IA. La IA puede cambiar el área y el resumen,
 * y puede SUBIR la urgencia, pero nunca bajarla: lo que la regla marcó como alto, sigue alto.
 */
export function unirClasificacion(regla: Clasificacion, ia: Omit<Clasificacion, "origen">): Clasificacion {
  const urgencia = ORDEN_URGENCIA[ia.urgencia] >= ORDEN_URGENCIA[regla.urgencia] ? ia.urgencia : regla.urgencia;
  return { area: ia.area, urgencia, resumen: ia.resumen.slice(0, 140), origen: "ia" };
}
