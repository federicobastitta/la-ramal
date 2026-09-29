import { describe, expect, it } from "vitest";
import {
  accionesPosibles, ganadorDeRonda, jerarquia, jugadaRobot, jugar, mezclar, nuevaPartida, puntosEnvido, tantos,
  type Accion, type Carta, type EstadoTruco, type Jugador,
} from "../src/truco";

const c = (n: Carta["n"], palo: Carta["palo"]): Carta => ({ n, palo });
function paso(e: EstadoTruco, j: Jugador, a: Accion): EstadoTruco {
  const r = jugar(e, j, a);
  if (!r.ok) throw new Error(r.motivo);
  return r.estado;
}
/** Partida con cartas elegidas (para probar situaciones exactas). */
function conCartas(c0: Carta[], c1: Carta[], mano: Jugador = 0, puntos: [number, number] = [0, 0]): EstadoTruco {
  const e = nuevaPartida(1, mano);
  return { ...e, puntos, cartas: [c0, c1], repartidas: [c0, c1] };
}

describe("cartas", () => {
  it("jerarquía del truco", () => {
    expect(jerarquia(c(1, "espada"))).toBeGreaterThan(jerarquia(c(1, "basto")));
    expect(jerarquia(c(7, "oro"))).toBeGreaterThan(jerarquia(c(3, "copa")));
    expect(jerarquia(c(1, "copa"))).toBe(jerarquia(c(1, "oro")));
    expect(jerarquia(c(12, "oro"))).toBeGreaterThan(jerarquia(c(7, "copa")));
    expect(jerarquia(c(4, "espada"))).toBe(1);
  });
  it("tantos del envido", () => {
    expect(tantos([c(7, "oro"), c(6, "oro"), c(1, "espada")])).toBe(33);
    expect(tantos([c(12, "oro"), c(11, "oro"), c(3, "espada")])).toBe(20);
    expect(tantos([c(7, "oro"), c(6, "copa"), c(1, "espada")])).toBe(7);
    expect(tantos([c(12, "oro"), c(11, "copa"), c(10, "espada")])).toBe(0);
  });
  it("mezcla: 40 cartas distintas y reproducible", () => {
    const m = mezclar(42);
    expect(new Set(m.map((x) => `${x.n}${x.palo}`)).size).toBe(40);
    expect(mezclar(42)).toEqual(m);
    expect(mezclar(43)).not.toEqual(m);
  });
  it("reparto de 3 y 3", () => {
    const e = nuevaPartida(7);
    expect(e.cartas[0]).toHaveLength(3);
    expect(e.cartas[1]).toHaveLength(3);
  });
});

describe("bazas y pardas", () => {
  const b = (x: Carta, y: Carta) => [{ j: 0 as Jugador, c: x }, { j: 1 as Jugador, c: y }];
  it("gana quien gana dos", () => {
    expect(ganadorDeRonda([b(c(1, "espada"), c(4, "oro")), b(c(3, "oro"), c(4, "copa"))], 1)).toBe(0);
  });
  it("primera parda: define la segunda", () => {
    expect(ganadorDeRonda([b(c(3, "oro"), c(3, "copa")), b(c(4, "oro"), c(7, "espada"))], 0)).toBe(1);
  });
  it("gana la primera y empata la segunda: gana el de la primera", () => {
    expect(ganadorDeRonda([b(c(1, "espada"), c(4, "oro")), b(c(3, "oro"), c(3, "copa"))], 1)).toBe(0);
  });
  it("todo pardas: gana la mano", () => {
    expect(ganadorDeRonda([b(c(3, "oro"), c(3, "copa")), b(c(2, "oro"), c(2, "copa")), b(c(4, "oro"), c(4, "copa"))], 1)).toBe(1);
  });
});

describe("truco", () => {
  it("una ronda sin cantos vale 1", () => {
    let e = conCartas([c(1, "espada"), c(7, "oro"), c(4, "copa")], [c(4, "oro"), c(5, "oro"), c(6, "oro")]);
    e = paso(e, 0, { t: "jugar", carta: 0 });
    e = paso(e, 1, { t: "jugar", carta: 0 });
    e = paso(e, 0, { t: "jugar", carta: 0 });
    e = paso(e, 1, { t: "jugar", carta: 0 });
    expect(e.rondaTerminada).toBe(true);
    expect(e.puntos).toEqual([1, 0]);
  });
  it("truco querido vale 2; no querido, 1 para el que cantó", () => {
    const base = conCartas([c(1, "espada"), c(7, "oro"), c(4, "copa")], [c(4, "oro"), c(5, "oro"), c(6, "oro")]);
    let e = paso(base, 0, { t: "truco" });
    expect(jugar(e, 0, { t: "jugar", carta: 0 }).ok).toBe(false); // espera respuesta
    const noq = paso(e, 1, { t: "noquiero" });
    expect(noq.puntos).toEqual([1, 0]);
    e = paso(e, 1, { t: "quiero" });
    for (const j of [0, 1, 0, 1] as Jugador[]) e = paso(e, j, { t: "jugar", carta: 0 });
    expect(e.puntos).toEqual([2, 0]);
  });
  it("retruco: sube el que no cantó; no querido da 2", () => {
    let e = conCartas([c(4, "copa"), c(5, "copa"), c(6, "copa")], [c(1, "espada"), c(1, "basto"), c(7, "espada")]);
    e = paso(e, 0, { t: "truco" });
    e = paso(e, 1, { t: "truco" }); // retruco
    expect(jugar(e, 1, { t: "truco" }).ok).toBe(false);
    e = paso(e, 0, { t: "noquiero" });
    expect(e.puntos).toEqual([0, 2]);
  });
  it("irse al mazo da lo que vale el truco", () => {
    let e = conCartas([c(4, "copa"), c(5, "copa"), c(6, "copa")], [c(1, "espada"), c(1, "basto"), c(7, "espada")]);
    e = paso(e, 0, { t: "truco" });
    e = paso(e, 1, { t: "quiero" });
    e = paso(e, 0, { t: "mazo" });
    expect(e.puntos).toEqual([0, 2]);
  });
  it("no se juega fuera de turno", () => {
    const e = conCartas([c(4, "copa"), c(5, "copa"), c(6, "copa")], [c(1, "espada"), c(1, "basto"), c(7, "espada")]);
    expect(jugar(e, 1, { t: "jugar", carta: 0 })).toMatchObject({ ok: false });
  });
});

describe("envido", () => {
  it("querido: gana el de más tantos; empate gana la mano", () => {
    let e = conCartas([c(7, "oro"), c(6, "oro"), c(4, "copa")], [c(1, "espada"), c(2, "espada"), c(4, "basto")]);
    e = paso(e, 0, { t: "envido", tipo: "envido" });
    e = paso(e, 1, { t: "quiero" });
    expect(e.puntos).toEqual([2, 0]); // 33 contra 23
    let f = conCartas([c(5, "oro"), c(2, "oro"), c(4, "copa")], [c(6, "espada"), c(1, "espada"), c(4, "basto")], 1);
    f = paso(f, 1, { t: "envido", tipo: "envido" });
    f = paso(f, 0, { t: "quiero" });
    expect(f.puntos).toEqual([0, 2]); // 27 a 27: gana la mano (1)
  });
  it("cadena envido-envido-real no querida da 4", () => {
    let e = conCartas([c(7, "oro"), c(6, "oro"), c(4, "copa")], [c(1, "espada"), c(2, "espada"), c(4, "basto")]);
    e = paso(e, 0, { t: "envido", tipo: "envido" });
    e = paso(e, 1, { t: "envido", tipo: "envido" });
    e = paso(e, 0, { t: "envido", tipo: "real" });
    e = paso(e, 1, { t: "noquiero" });
    expect(e.puntos).toEqual([4, 0]);
    expect(puntosEnvido(["envido", "envido", "real"], true, [0, 0])).toBe(7);
  });
  it("falta envido: lo que le falta al que va ganando", () => {
    expect(puntosEnvido(["falta"], true, [22, 10])).toBe(8);
  });
  it("el envido está primero: se contesta el truco con envido", () => {
    let e = conCartas([c(4, "copa"), c(5, "basto"), c(6, "espada")], [c(7, "oro"), c(6, "oro"), c(1, "espada")]);
    e = paso(e, 0, { t: "truco" });
    e = paso(e, 1, { t: "envido", tipo: "envido" });
    e = paso(e, 0, { t: "quiero" });
    expect(e.puntos).toEqual([0, 2]);
    expect(e.truco.pendiente).not.toBeNull(); // el truco sigue esperando
    e = paso(e, 1, { t: "quiero" });
    expect(e.truco.valor).toBe(2);
  });
  it("después de tirar ya no se canta envido", () => {
    let e = conCartas([c(4, "copa"), c(5, "basto"), c(6, "espada")], [c(7, "oro"), c(6, "oro"), c(1, "espada")]);
    e = paso(e, 0, { t: "jugar", carta: 0 });
    e = paso(e, 1, { t: "jugar", carta: 0 });
    expect(jugar(e, 1, { t: "envido", tipo: "envido" }).ok).toBe(false);
  });
});

describe("partida completa", () => {
  it("dos robots juegan hasta 30 sin trabarse", () => {
    let e = nuevaPartida(123);
    for (let paso_ = 0; paso_ < 5000 && e.ganador === null; paso_++) {
      if (e.rondaTerminada) {
        e = paso(e, 0, { t: "siguiente" });
        continue;
      }
      const quien: Jugador = e.envido.pendiente ? (e.envido.de === 0 ? 1 : 0) : e.truco.pendiente ? (e.truco.pendiente.de === 0 ? 1 : 0) : e.turno;
      const a = jugadaRobot(e, quien);
      expect(a).not.toBeNull();
      e = paso(e, quien, a!);
    }
    expect(e.ganador).not.toBeNull();
    expect(Math.max(...e.puntos)).toBe(30);
  });
  it("accionesPosibles solo ofrece lo que se puede hacer", () => {
    const e = nuevaPartida(5);
    expect(accionesPosibles(e, e.turno === 0 ? 1 : 0)).toEqual([]);
    expect(accionesPosibles(e, e.turno).some((a) => a.t === "jugar")).toBe(true);
  });
});
