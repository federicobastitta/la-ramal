import { distanciaM, indiceExigencia, largoRecorridoM, sha256Hex, type Certificado, type Comunicado, type ConfigRecorrido, type Jornada, type Pedido, type Ping, type Planilla, type Punto, type Recibo, type Escala } from "@la-ramal/nucleo";
import { hoyISO, pdfSimple, sumarDias } from "../compartido/pdf";
import { idb } from "./idb";

/** Datos de ejemplo para que la demo abra con algo que mostrar. Todos marcados como ejemplo; nada es real. */
export const CHOFERES_DEMO = [
  { uid: "demo-chofer-medina", nombre: "Carlos Medina", coche: "Interno 23" },
  { uid: "demo-chofer-benitez", nombre: "Jorge Benítez", coche: "Interno 31" },
  { uid: "demo-chofer-rios", nombre: "Marcela Ríos", coche: "Interno 12" },
];

const VERSION = "semilla-v3";
const L = "linea-22";

export async function sembrarDemo(): Promise<void> {
  if (await idb.leer("docs", VERSION)) return;
  const hoy = hoyISO();
  const docs: [string, unknown][] = [];
  const poner = (col: string, d: { id: string }) => docs.push([`${col}/${d.id}`, d]);

  // Planillas: los últimos 75 días (para que haya recibos con sus horas) y los próximos 7 para los tres choferes (domingo franco).
  for (const [i, c] of CHOFERES_DEMO.entries()) {
    for (let d = -75; d <= 7; d++) {
      const fecha = sumarDias(hoy, d);
      const dia = new Date(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)).getDay();
      const base = 5 * 60 + 10 + i * 35;
      const vueltas = Array.from({ length: 4 }, (_, v) => {
        const sale = base + v * 118;
        const dur = 100 + ((d + v + i) % 3) * 4;
        const f = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        return { sale: f(sale), llega: f(sale + dur) };
      });
      const p: Planilla = { id: `${c.uid}-${fecha}`, lineaId: L, choferId: c.uid, choferNombre: c.nombre, fecha, cocheId: c.coche, cabecera: "Terminal Quilmes Oeste", ramal: "A", vueltas, franco: dia === 0, publicadaEn: Date.now() };
      poner("planillas", p);
    }
  }

  // Recibos de los dos meses anteriores, con PDF de ejemplo.
  const mes = (n: number) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  for (const [n, neto] of [[1, 1_986_400], [2, 1_941_900]] as const) {
    const periodo = mes(n);
    const pdf = pdfSimple(`Recibo de sueldo ${periodo} (EJEMPLO)`, [
      "Empresa de ejemplo S.A. - Línea 22 (ejemplo)",
      "Empleado: Carlos Medina - Legajo 0423 - Conductor",
      "Convenio: UTA - CCT 460/73 (ejemplo, montos inventados)",
      "",
      "Básico ................................ $ 1.545.278",
      "Antigüedad (12 años, 1% por año) ...... $ 185.433",
      "Viáticos (24 días) .................... $ 384.000",
      "Horas extra ........................... $ 152.400",
      "Jubilación / Obra social / Sindicato .. -$ 280.711",
      "",
      `Neto a cobrar ......................... $ ${neto.toLocaleString("es-AR")}`,
      "",
      "Documento de ejemplo generado por la demo de LA RAMAL. No es un recibo real.",
    ]);
    const ruta = `lineas/${L}/recibos/demo-chofer-medina/${periodo}.pdf`;
    await idb.poner("archivos", ruta, pdf);
    const r: Recibo = {
      id: `demo-chofer-medina-${periodo}`, lineaId: L, choferId: "demo-chofer-medina", periodo, neto, ruta, sha256: await sha256Hex(await pdf.arrayBuffer()), mime: "application/pdf",
      origen: "personal", lectura: "leido", basico: 1_545_278, antiguedadAnios: 12, antiguedad: 185_433, viaticos: 384_000, extras: 152_400, subidoEn: Date.now(),
    };
    if (n === 2) r.conformidad = { en: Date.now() - 20 * 86_400_000, sha256: r.sha256 };
    poner("recibos", r);
  }

  // Certificados: la licencia al día; el psicofísico vence en 20 días.
  const certificados: Certificado[] = [
    { id: "cert-licencia", lineaId: L, choferId: "demo-chofer-medina", tipo: "licencia_profesional", vence: sumarDias(hoy, 167), ruta: "", estado: "validado", cargadoEn: Date.now() },
    { id: "cert-psico", lineaId: L, choferId: "demo-chofer-medina", tipo: "psicofisico", vence: sumarDias(hoy, 20), ruta: "", estado: "validado", cargadoEn: Date.now() },
  ];
  certificados.forEach((c) => poner("certificados", c));

  // Un compañero ofrece su sábado.
  const sabado = sumarDias(hoy, (6 - new Date().getDay() + 7) % 7 || 7);
  const cambio: Pedido = { id: "pedido-benitez-sabado", lineaId: L, choferId: "demo-chofer-benitez", choferNombre: "Jorge Benítez", tipo: "cambio_turno", detalle: "Cumpleaños de mi hija", fecha: sabado, adjuntos: [], estado: "ofrecido", creadoEn: Date.now() - 3_600_000 };
  poner("pedidos", cambio);

  // Escala de EJEMPLO con los números que publicaron los diarios (abril 2026). Hay que confirmarla con la escala oficial.
  const escala: Escala = {
    id: "vigente", lineaId: L, desde: "2026-04-01", basico: 1_545_278.25, antiguedadPctPorAnio: 1, viaticoPorDia: 16_000, presentismo: 0,
    recargoExtraComunPct: 50, recargoExtraDomingoFeriadoPct: 100, recargoNocturnoPct: 0, jornadaHoras: 8, divisorHoras: 200, bonoPorKm: 0, feriados: [],
    fuente: "EJEMPLO: básico, antigüedad y viático según notas periodísticas (abril 2026). Presentismo, nocturnidad y divisor: a confirmar con personal.", ejemplo: true,
  };
  poner("escalas", escala);

  const comunicado: Comunicado = {
    id: "com-obra-mitre", lineaId: L, titulo: "Desvío por obra en Av. Mitre (ejemplo)", importante: true, creadoEn: Date.now() - 2 * 3_600_000, leidos: [],
    texto: "Desde el lunes y por 15 días, mano a capital: tomar Andrés Baranda entre Mitre y Mosconi. Las paradas provisorias están señalizadas.",
  };
  poner("comunicados", comunicado);

  for (const [k, v] of docs) await idb.poner("docs", k, v);
  await idb.poner("docs", VERSION, { en: Date.now() });
}

// ---------------------------------------------------------------------------------------------
// Recorrido y jornadas de ejemplo (el GPS real no se mueve en la demo).
// ---------------------------------------------------------------------------------------------

/** Trazado INVENTADO en la zona de Quilmes, solo para la demo. */
const TRAZADO: Punto[] = [
  { lat: -34.7446, lng: -58.2931 },
  { lat: -34.7380, lng: -58.2840 },
  { lat: -34.7300, lng: -58.2760 },
  { lat: -34.7228, lng: -58.2692 },
  { lat: -34.7150, lng: -58.2620 },
  { lat: -34.7090, lng: -58.2540 },
];

function puntoEn(trazado: Punto[], m: number): Punto {
  let resto = m;
  for (let i = 0; i < trazado.length - 1; i++) {
    const a = trazado[i]!;
    const b = trazado[i + 1]!;
    const d = distanciaM(a, b);
    if (resto <= d) return { lat: a.lat + ((b.lat - a.lat) * resto) / d, lng: a.lng + ((b.lng - a.lng) * resto) / d };
    resto -= d;
  }
  return trazado.at(-1)!;
}

export const CONFIG_DEMO: ConfigRecorrido = {
  id: "recorrido",
  lineaId: L,
  ejemplo: true,
  cabeceras: [
    { nombre: "Terminal Quilmes Oeste", centro: TRAZADO[0]!, radioM: 150 },
    { nombre: "Bernal", centro: TRAZADO.at(-1)!, radioM: 150 },
  ],
  paradas: Array.from({ length: 16 }, (_, i) => ({ id: `p${i + 1}`, nombre: `Parada ${i + 1} (ejemplo)`, punto: puntoEn(TRAZADO, 400 * (i + 1)) })),
  ramales: [{ nombre: "A", trazado: TRAZADO }],
};

/** Número "al azar" pero siempre igual para la misma entrada (la demo muestra lo mismo cada vez). */
const azar = (n: number) => {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

const HORA_AR = (fecha: string, h: number, m: number) => Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10), h + 3, m);

export async function sembrarRecorridoDemo(): Promise<void> {
  if (await idb.leer("docs", "semilla-recorrido-v1")) return;
  await idb.poner("docs", "configuracion/recorrido", CONFIG_DEMO);
  const hoy = hoyISO();
  const km = Math.round(largoRecorridoM(TRAZADO) / 100) / 10;
  // Cada chofer en su franja: Medina a la mañana, Benítez a la tarde, Ríos de madrugada.
  const turnos: Record<string, [number, number]> = { "demo-chofer-medina": [5, 10], "demo-chofer-benitez": [15, 40], "demo-chofer-rios": [2, 30] };
  let semilla = 1;
  for (const c of CHOFERES_DEMO) {
    for (let d = -30; d <= -1; d++) {
      const fecha = sumarDias(hoy, d);
      const dia = new Date(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)).getDay();
      if (dia === 0) continue;
      const [h0, m0] = turnos[c.uid]!;
      let t = HORA_AR(fecha, h0, m0);
      const vueltas: Jornada["vueltas"] = [];
      for (let v = 0; v < 4; v++) {
        const hora = new Date(t - 3 * 3_600_000).getUTCHours();
        const pico = (hora >= 6 && hora < 9) || (hora >= 17 && hora < 20);
        const madrugada = hora < 6;
        const efectoDia = dia === 1 ? 6 : dia === 5 ? 4 : dia === 6 ? -8 : 0;
        const dur = Math.round(48 + (pico ? 16 : madrugada ? -10 : 0) + efectoDia + azar(semilla++) * 8);
        const paradas = Math.round((pico ? 26 : madrugada ? 9 : 18) + azar(semilla++) * 5);
        const minutosTransito = Math.round(((pico ? 11 : madrugada ? 1 : 5) + azar(semilla++) * 4) * 10) / 10;
        const ida = v % 2 === 0;
        const vr = { desde: ida ? "Terminal Quilmes Oeste" : "Bernal", hasta: ida ? "Bernal" : "Terminal Quilmes Oeste", sale: t, llega: t + dur * 60_000 };
        const puntos = indiceExigencia({ paradas, minutosEnParadas: paradas * 0.4, detencionesTransito: 0, minutosEnTransito: minutosTransito }, km, [vr]).puntos;
        vueltas.push({ ...vr, paradas, minutosTransito, km, puntos });
        t = vr.llega + (12 + Math.round(azar(semilla++) * 6)) * 60_000;
      }
      const j: Jornada = { id: `${c.uid}-${fecha}`, lineaId: L, choferId: c.uid, fecha, ramal: "A", vueltas, km: Math.round(km * 4 * 10) / 10, actualizadaEn: Date.now(), ejemplo: true };
      await idb.poner("docs", `jornadas/${j.id}`, j);
    }
  }
  // Posiciones de los últimos 3 días de Medina, con un tramo lento entre el km 2 y el 3 (para "sectores trabados").
  const total = largoRecorridoM(TRAZADO);
  for (let d = -3; d <= -1; d++) {
    const fecha = sumarDias(hoy, d);
    const pings: Ping[] = [];
    let t = HORA_AR(fecha, 7, 0);
    for (let m = 0; m <= total; m += 60) {
      pings.push({ ...puntoEn(TRAZADO, m), en: t, precisionM: 10 });
      const lento = m > 2000 && m < 3000 ? 3.2 : m > 4800 && m < 5400 ? 1.8 : 1;
      t += Math.round(9_000 * lento * (0.9 + azar(semilla++) * 0.2));
    }
    await idb.poner("pings", `demo-chofer-medina/${fecha}`, pings);
  }
  await idb.poner("docs", "semilla-recorrido-v1", { en: Date.now() });
}
