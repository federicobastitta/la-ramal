/**
 * Truco argentino para dos, sin flor, a 30 puntos. Motor puro: (estado, jugador, acción) → estado.
 * Lo usan el celular (para mostrar), el servidor (para validar las jugadas en vivo) y el compañero-robot de la demo.
 *
 * Reglas:
 * - Mazo español de 40 cartas (sin 8 ni 9). Jerarquía: 1 espada, 1 basto, 7 espada, 7 oro, 3, 2, 1 falsos,
 *   12, 11, 10, 7 falsos, 6, 5, 4.
 * - Tres bazas: gana la ronda quien gana dos. Pardas: si empata la primera, define la segunda; si gana la
 *   primera y empata la segunda, gana el de la primera; si todo es parda, gana la mano.
 * - Truco (2), retruco (3), vale cuatro (4). No querido: el que cantó se lleva lo que ya valía.
 *   Sube solo quien no cantó el último.
 * - Envido: en la primera baza, antes de que el que canta haya tirado. Envido, envido-envido, real envido,
 *   falta envido. "El envido está primero": con el truco cantado en primera, se puede contestar envido.
 *   Empate de tantos: gana la mano. Falta envido: lo que le falta al que va ganando para llegar a 30.
 * - Irse al mazo: el otro se lleva lo que vale el truco en ese momento.
 */
export const PALOS = ["espada", "basto", "oro", "copa"] as const;
export type Palo = (typeof PALOS)[number];
export type Carta = { n: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12; palo: Palo };
export type Jugador = 0 | 1;
export type TipoEnvido = "envido" | "real" | "falta";

export const A_GANAR = 30;
const otro = (j: Jugador): Jugador => (j === 0 ? 1 : 0);

/** Valor de la carta para el truco: más alto gana. */
export function jerarquia(c: Carta): number {
  if (c.n === 1 && c.palo === "espada") return 14;
  if (c.n === 1 && c.palo === "basto") return 13;
  if (c.n === 7 && c.palo === "espada") return 12;
  if (c.n === 7 && c.palo === "oro") return 11;
  const orden: Record<number, number> = { 3: 10, 2: 9, 1: 8, 12: 7, 11: 6, 10: 5, 7: 4, 6: 3, 5: 2, 4: 1 };
  return orden[c.n]!;
}

/** Tantos de envido de tres cartas. */
export function tantos(cartas: Carta[]): number {
  const valor = (c: Carta) => (c.n >= 10 ? 0 : c.n);
  let mejor = Math.max(...cartas.map(valor));
  for (let i = 0; i < cartas.length; i++)
    for (let k = i + 1; k < cartas.length; k++) if (cartas[i]!.palo === cartas[k]!.palo) mejor = Math.max(mejor, 20 + valor(cartas[i]!) + valor(cartas[k]!));
  return mejor;
}

export const nombreCarta = (c: Carta) => `${c.n} de ${c.palo}`;

export function mazo(): Carta[] {
  const ns: Carta["n"][] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
  return PALOS.flatMap((palo) => ns.map((n) => ({ n, palo })));
}

/** Mezcla con una semilla (mulberry32): la misma semilla da el mismo reparto en los dos celulares. */
export function mezclar(semilla: number): Carta[] {
  let a = semilla >>> 0;
  const azar = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const m = mazo();
  for (let i = m.length - 1; i > 0; i--) {
    const k = Math.floor(azar() * (i + 1));
    [m[i], m[k]] = [m[k]!, m[i]!];
  }
  return m;
}

export type EstadoTruco = {
  puntos: [number, number];
  mano: Jugador;
  semilla: number;
  /** Cartas que le quedan a cada uno. */
  cartas: [Carta[], Carta[]];
  /** Las tres de cada uno al repartir (para el envido). */
  repartidas: [Carta[], Carta[]];
  bazas: { j: Jugador; c: Carta }[][];
  turno: Jugador;
  truco: { valor: 1 | 2 | 3 | 4; ultimo: Jugador | null; pendiente: { nivel: 2 | 3 | 4; de: Jugador } | null };
  envido: { cantos: TipoEnvido[]; de: Jugador | null; pendiente: boolean; resuelto: boolean };
  rondaTerminada: boolean;
  ganador: Jugador | null;
  historial: string[];
};

export type Accion =
  | { t: "jugar"; carta: number }
  | { t: "truco" }
  | { t: "envido"; tipo: TipoEnvido }
  | { t: "quiero" }
  | { t: "noquiero" }
  | { t: "mazo" }
  | { t: "siguiente" };

export type Resultado = { ok: true; estado: EstadoTruco } | { ok: false; motivo: string };

export function nuevaPartida(semilla: number, mano: Jugador = 0): EstadoTruco {
  return repartir({ puntos: [0, 0], ganador: null, historial: [] } as unknown as EstadoTruco, semilla, mano);
}

function repartir(e: EstadoTruco, semilla: number, mano: Jugador): EstadoTruco {
  const m = mezclar(semilla);
  // Se reparte de a una, empezando por el que no es mano (como en la mesa).
  const pie = otro(mano);
  const cartas: [Carta[], Carta[]] = [[], []];
  for (let i = 0; i < 6; i++) cartas[i % 2 === 0 ? pie : mano].push(m[i]!);
  return {
    ...e,
    mano,
    semilla,
    cartas,
    repartidas: [[...cartas[0]], [...cartas[1]]],
    bazas: [[]],
    turno: mano,
    truco: { valor: 1, ultimo: null, pendiente: null },
    envido: { cantos: [], de: null, pendiente: false, resuelto: false },
    rondaTerminada: false,
  };
}

const VALOR_CANTO: Record<TipoEnvido, number> = { envido: 2, real: 3, falta: 0 };

/** Puntos del envido querido o no querido. */
export function puntosEnvido(cantos: TipoEnvido[], querido: boolean, puntos: [number, number]): number {
  if (!querido) {
    // No querido: 1 si fue el primer canto; si no, la suma de lo que ya estaba aceptado antes del último.
    if (cantos.length === 1) return 1;
    return cantos.slice(0, -1).reduce((s, c) => s + (c === "falta" ? 0 : VALOR_CANTO[c]), 0);
  }
  if (cantos.includes("falta")) return A_GANAR - Math.max(...puntos);
  return cantos.reduce((s, c) => s + VALOR_CANTO[c], 0);
}

/** Qué envido se puede cantar después de lo ya cantado. */
export function enviddosPosibles(cantos: TipoEnvido[]): TipoEnvido[] {
  if (cantos.includes("falta")) return [];
  if (cantos.includes("real")) return ["falta"];
  const envidos = cantos.filter((c) => c === "envido").length;
  return envidos >= 2 ? ["real", "falta"] : ["envido", "real", "falta"];
}

function sumar(e: EstadoTruco, j: Jugador, n: number, porque: string): EstadoTruco {
  const puntos: [number, number] = [...e.puntos];
  puntos[j] = Math.min(A_GANAR, puntos[j] + n);
  const ganador = puntos[j] >= A_GANAR ? j : e.ganador;
  return { ...e, puntos, ganador, historial: [...e.historial, `${porque}: +${n} para ${j === 0 ? "vos" : "el otro"}`] };
}

/** Quién gana la ronda con las bazas jugadas hasta ahora (null si todavía no se sabe). */
export function ganadorDeRonda(bazas: { j: Jugador; c: Carta }[][], mano: Jugador): Jugador | null {
  const res: (Jugador | "parda")[] = [];
  for (const b of bazas) {
    if (b.length < 2) break;
    const [x, y] = b as [{ j: Jugador; c: Carta }, { j: Jugador; c: Carta }];
    const vx = jerarquia(x.c);
    const vy = jerarquia(y.c);
    res.push(vx === vy ? "parda" : vx > vy ? x.j : y.j);
  }
  const ganadas = (j: Jugador) => res.filter((r) => r === j).length;
  if (ganadas(0) >= 2) return 0;
  if (ganadas(1) >= 2) return 1;
  if (res.length >= 2) {
    // Primera parda: define la segunda (o la tercera si también es parda).
    if (res[0] === "parda" && res[1] !== "parda") return res[1] as Jugador;
    // Ganó la primera y la segunda es parda: gana el de la primera.
    if (res[0] !== "parda" && res[1] === "parda") return res[0] as Jugador;
  }
  if (res.length === 3) {
    if (res[2] !== "parda") return res[2] as Jugador;
    if (res[0] !== "parda") return res[0] as Jugador;
    return mano;
  }
  return null;
}

/** Aplica una acción. Devuelve el estado nuevo o por qué no se puede. */
export function jugar(e: EstadoTruco, quien: Jugador, a: Accion): Resultado {
  const no = (motivo: string): Resultado => ({ ok: false, motivo });
  if (e.ganador !== null && a.t !== "siguiente") return no("La partida terminó");

  if (a.t === "siguiente") {
    if (!e.rondaTerminada) return no("La ronda no terminó");
    if (e.ganador !== null) return no("La partida terminó");
    return { ok: true, estado: repartir(e, (e.semilla * 1103515245 + 12345) >>> 0, otro(e.mano)) };
  }
  if (e.rondaTerminada) return no("La ronda terminó: toca repartir");

  const primeraBaza = e.bazas.length === 1;
  const yaTiroEnPrimera = (j: Jugador) => e.bazas[0]!.some((x) => x.j === j);
  const puedeEnvido = (j: Jugador) => primeraBaza && !yaTiroEnPrimera(j) && !e.envido.resuelto && e.truco.valor === 1;

  // ---- Hay un envido esperando respuesta ----
  if (e.envido.pendiente) {
    if (quien === e.envido.de) return no("Esperá la respuesta del envido");
    if (a.t === "envido") {
      if (!enviddosPosibles(e.envido.cantos).includes(a.tipo)) return no("Ese envido no se puede cantar ahora");
      return ok({ ...e, envido: { ...e.envido, cantos: [...e.envido.cantos, a.tipo], de: quien }, historial: [...e.historial, cantoTexto(quien, a.tipo)] });
    }
    if (a.t === "quiero" || a.t === "noquiero") {
      const querido = a.t === "quiero";
      let s: EstadoTruco = { ...e, envido: { ...e.envido, pendiente: false, resuelto: true } };
      if (querido) {
        const t0 = tantos(e.repartidas[0]);
        const t1 = tantos(e.repartidas[1]);
        const gana: Jugador = t0 === t1 ? e.mano : t0 > t1 ? 0 : 1;
        s = { ...s, historial: [...s.historial, `Tantos: vos ${t0}, el otro ${t1}`] };
        s = sumar(s, gana, puntosEnvido(e.envido.cantos, true, e.puntos), "Envido");
      } else {
        s = sumar(s, e.envido.de!, puntosEnvido(e.envido.cantos, false, e.puntos), "Envido no querido");
      }
      return ok(s);
    }
    return no("Contestá el envido: quiero, no quiero o subilo");
  }

  // ---- Hay un truco esperando respuesta ----
  if (e.truco.pendiente) {
    const p = e.truco.pendiente;
    if (quien === p.de) return no("Esperá la respuesta del truco");
    if (a.t === "envido") {
      // "El envido está primero": se contesta el truco después.
      if (!(primeraBaza && !yaTiroEnPrimera(quien) && !e.envido.resuelto && e.truco.valor === 1)) return no("Ya no se puede cantar envido");
      return ok({ ...e, envido: { cantos: [a.tipo], de: quien, pendiente: true, resuelto: false }, historial: [...e.historial, cantoTexto(quien, a.tipo), "(el truco queda esperando)"] });
    }
    if (a.t === "quiero") return ok({ ...e, truco: { valor: p.nivel, ultimo: p.de, pendiente: null }, historial: [...e.historial, `${yo(quien)}: quiero`] });
    if (a.t === "noquiero") return ok(terminarRonda(sumar(e, p.de, e.truco.valor, `${nombreNivel(p.nivel)} no querido`)));
    if (a.t === "truco") {
      if (p.nivel === 4) return no("Ya está en vale cuatro");
      const nivel = (p.nivel + 1) as 3 | 4;
      // Subir implica querer lo anterior.
      return ok({ ...e, truco: { valor: p.nivel, ultimo: p.de, pendiente: { nivel, de: quien } }, historial: [...e.historial, `${yo(quien)}: ${nombreNivel(nivel)}`] });
    }
    if (a.t === "mazo") return ok(terminarRonda(sumar(e, p.de, e.truco.valor, "Se fue al mazo")));
    return no("Contestá el truco: quiero, no quiero o subilo");
  }

  // ---- Juego normal: solo el que tiene el turno ----
  if (quien !== e.turno) return no("No es tu turno");
  switch (a.t) {
    case "envido":
      if (!puedeEnvido(quien)) return no("El envido se canta en la primera, antes de tirar y antes del truco");
      if (!enviddosPosibles([]).includes(a.tipo)) return no("Ese envido no se puede cantar");
      return ok({ ...e, envido: { cantos: [a.tipo], de: quien, pendiente: true, resuelto: false }, historial: [...e.historial, cantoTexto(quien, a.tipo)] });
    case "truco": {
      if (e.truco.ultimo === quien) return no("El último en cantar fuiste vos: sube el otro");
      if (e.truco.valor === 4) return no("Ya está en vale cuatro");
      const nivel = (e.truco.valor + 1) as 2 | 3 | 4;
      return ok({ ...e, truco: { ...e.truco, pendiente: { nivel, de: quien } }, historial: [...e.historial, `${yo(quien)}: ${nombreNivel(nivel)}`] });
    }
    case "mazo":
      return ok(terminarRonda(sumar(e, otro(quien), e.truco.valor, "Se fue al mazo")));
    case "jugar": {
      const mias = e.cartas[quien];
      const c = mias[a.carta];
      if (!c) return no("Esa carta no está");
      const cartas: [Carta[], Carta[]] = [[...e.cartas[0]], [...e.cartas[1]]];
      cartas[quien].splice(a.carta, 1);
      const bazas = e.bazas.map((b) => [...b]);
      bazas.at(-1)!.push({ j: quien, c });
      let s: EstadoTruco = { ...e, cartas, bazas, historial: [...e.historial, `${yo(quien)}: ${nombreCarta(c)}`] };
      const actual = bazas.at(-1)!;
      if (actual.length === 1) return ok({ ...s, turno: otro(quien) });
      // Se completó la baza.
      const g = ganadorDeRonda(bazas, e.mano);
      if (g !== null) return ok(terminarRonda(sumar(s, g, e.truco.valor, "Ronda")));
      const [x, y] = actual as [{ j: Jugador; c: Carta }, { j: Jugador; c: Carta }];
      const vx = jerarquia(x.c);
      const vy = jerarquia(y.c);
      const empieza: Jugador = vx === vy ? x.j : vx > vy ? x.j : y.j;
      s = { ...s, bazas: [...bazas, []], turno: empieza };
      return ok(s);
    }
    default:
      return no("Acción no válida");
  }
}

function terminarRonda(e: EstadoTruco): EstadoTruco {
  return { ...e, rondaTerminada: true, truco: { ...e.truco, pendiente: null }, envido: { ...e.envido, pendiente: false } };
}
function ok(estado: EstadoTruco): Resultado {
  return { ok: true, estado };
}
const yo = (j: Jugador) => (j === 0 ? "Vos" : "El otro");
const nombreNivel = (n: 2 | 3 | 4) => (n === 2 ? "Truco" : n === 3 ? "Retruco" : "Vale cuatro");
const cantoTexto = (j: Jugador, t: TipoEnvido) => `${yo(j)}: ${t === "envido" ? "Envido" : t === "real" ? "Real envido" : "Falta envido"}`;

/** Qué puede hacer un jugador ahora (para mostrar solo los botones que corresponden). */
export function accionesPosibles(e: EstadoTruco, quien: Jugador): Accion[] {
  const candidatas: Accion[] = [
    ...e.cartas[quien].map((_, i) => ({ t: "jugar", carta: i }) as Accion),
    { t: "truco" },
    { t: "envido", tipo: "envido" },
    { t: "envido", tipo: "real" },
    { t: "envido", tipo: "falta" },
    { t: "quiero" },
    { t: "noquiero" },
    { t: "mazo" },
    { t: "siguiente" },
  ];
  return candidatas.filter((a) => jugar(e, quien, a).ok);
}

/**
 * Compañero-robot para la demo y para practicar: simple y previsible.
 * Canta envido con 29 o más, quiere con 27; canta truco con dos cartas altas; tira la más baja que gana.
 */
export function jugadaRobot(e: EstadoTruco, yoJ: Jugador): Accion | null {
  const posibles = accionesPosibles(e, yoJ);
  if (!posibles.length) return null;
  const hay = (t: Accion["t"], tipo?: TipoEnvido) => posibles.find((a) => a.t === t && (!tipo || (a as { tipo?: TipoEnvido }).tipo === tipo));
  if (hay("siguiente")) return null; // repartir lo decide el humano
  const mis = tantos(e.repartidas[yoJ]);
  const fuerza = [...e.cartas[yoJ]].map(jerarquia).sort((a, b) => b - a);
  const alta = (fuerza[0] ?? 0) + (fuerza[1] ?? 0);

  if (e.envido.pendiente) {
    if (mis >= 31 && hay("envido", "real")) return hay("envido", "real")!;
    return mis >= 27 ? hay("quiero")! : hay("noquiero")!;
  }
  if (e.truco.pendiente) {
    if (mis >= 29 && hay("envido", "envido")) return hay("envido", "envido")!;
    if (alta >= 24 && hay("truco")) return hay("truco")!;
    return alta >= 17 || (fuerza[0] ?? 0) >= 12 ? hay("quiero")! : hay("noquiero")!;
  }
  if (mis >= 29 && hay("envido", "envido")) return hay("envido", "envido")!;
  if (alta >= 22 && e.truco.valor === 1 && hay("truco")) return hay("truco")!;

  const baza = e.bazas.at(-1)!;
  const indices = e.cartas[yoJ].map((c, i) => ({ c, i })).sort((a, b) => jerarquia(a.c) - jerarquia(b.c));
  if (baza.length === 1) {
    const rival = jerarquia(baza[0]!.c);
    const gana = indices.find((x) => jerarquia(x.c) > rival);
    return { t: "jugar", carta: (gana ?? indices[0]!).i };
  }
  // Sale: en primera la del medio; después, la más alta.
  const elegida = e.bazas.length === 1 && indices.length === 3 ? indices[1]! : indices.at(-1)!;
  return { t: "jugar", carta: elegida.i };
}
