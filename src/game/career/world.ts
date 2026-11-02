/**
 * career/world.ts — Generación del mundo: plantillas, calendario y mercado.
 */

import type { Fixture, MarketEntry, Player, Position, Team } from "./types";
import { CLUBS, FIRST_NAMES, LAST_NAMES } from "./names";

let uid = 0;
function nextId(): string {
  return `p${(uid++).toString(36)}`;
}

function pickName(rng: () => number, used: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    const n = `${FIRST_NAMES[(rng() * FIRST_NAMES.length) | 0]} ${LAST_NAMES[(rng() * LAST_NAMES.length) | 0]}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  return `Jugador ${uid}`;
}

/** Distribución de plantilla: 18 jugadores (2 GK, 6 DF, 6 MF, 4 FW). */
const ROSTER: { pos: Position; n: number }[] = [
  { pos: "GK", n: 2 },
  { pos: "DF", n: 6 },
  { pos: "MF", n: 6 },
  { pos: "FW", n: 4 },
];

function attr(rng: () => number, base: number, spread: number): number {
  return Math.max(30, Math.min(95, Math.round(base + (rng() * 2 - 1) * spread)));
}

function makePlayer(rng: () => number, teamId: string, pos: Position, quality: number, usedNames: Set<string>): Player {
  const young = rng() < 0.3;
  const age = young ? 17 + ((rng() * 5) | 0) : 23 + ((rng() * 11) | 0);
  const ovr = Math.round(Math.max(42, Math.min(92, quality + (rng() * 2 - 1) * 7)));
  const pot = Math.min(95, Math.max(ovr, Math.round(ovr + (young ? 4 + rng() * 14 : rng() * 4))));
  const p: Player = {
    id: nextId(),
    name: pickName(rng, usedNames),
    age, pos, ovr, pot,
    pac: attr(rng, ovr, 10),
    sho: attr(rng, pos === "FW" ? ovr + 4 : ovr - 6, 9),
    pas: attr(rng, pos === "MF" ? ovr + 4 : ovr - 2, 9),
    def: attr(rng, pos === "DF" ? ovr + 4 : ovr - 8, 9),
    gk: pos === "GK" ? attr(rng, ovr + 3, 6) : attr(rng, 28, 8),
    sta: attr(rng, 72, 12),
    morale: 55 + ((rng() * 25) | 0),
    fitness: 82 + ((rng() * 18) | 0),
    wage: 0, value: 0,
    contractW: 40 + ((rng() * 90) | 0),
    injuredW: 0,
    goals: 0, apps: 0,
    teamId,
  };
  // valor y salario derivan de media/edad/potencial
  const ageCurve = age <= 21 ? 1.25 : age <= 26 ? 1.1 : age <= 30 ? 0.9 : 0.6;
  p.value = Math.round((Math.pow(p.ovr - 38, 2.6) * 22 + (p.pot - p.ovr) * 900) * ageCurve / 1000) * 1000;
  p.value = Math.max(4000, p.value);
  p.wage = Math.max(400, Math.round(p.value / 90 / 50) * 50);
  return p;
}

export interface WorldGen {
  teams: Team[];
  players: Player[];
  fixtures: Fixture[];
  rounds: number;
}

export function generateWorld(rng: () => number, userClubIndex: number): WorldGen {
  const usedNames = new Set<string>();
  const teams: Team[] = CLUBS.map((c, i) => ({
    id: `t${i}`,
    name: c.name,
    short: c.short,
    color1: c.color1,
    color2: c.color2,
    isUser: i === userClubIndex,
    budget: Math.round((2_200_000 * c.prestige + rng() * 400_000) / 10_000) * 10_000,
    prestige: c.prestige,
  }));

  const players: Player[] = [];
  teams.forEach((t) => {
    const def = CLUBS.find((c) => `t${CLUBS.indexOf(c)}` === t.id)!;
    const quality = 58 + def.prestige * 22; // ~71-83 de media base
    for (const r of ROSTER) {
      for (let i = 0; i < r.n; i++) players.push(makePlayer(rng, t.id, r.pos, quality, usedNames));
    }
  });

  // Liga de 8, ida y vuelta (14 jornadas) — round robin clásico
  const ids = teams.map((t) => t.id);
  const n = ids.length;
  const rounds = (n - 1) * 2;
  const fixtures: Fixture[] = [];
  const circle = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const left = ids[0];
    const right = circle[r % circle.length];
    fixtures.push({ round: r, homeId: left, awayId: right, played: false });
    fixtures.push({ round: r + (n - 1), homeId: right, awayId: left, played: false });
    for (let k = 1; k < n / 2; k++) {
      const a = circle[(r + k) % circle.length];
      const b = circle[(r + n - 1 - k) % circle.length];
      fixtures.push({ round: r, homeId: a, awayId: b, played: false });
      fixtures.push({ round: r + (n - 1), homeId: b, awayId: a, played: false });
    }
  }
  fixtures.sort((x, y) => x.round - y.round);
  return { teams, players, fixtures, rounds };
}

/** Refresca el mercado de fichajes con jugadores generados sin equipo. */
export function generateMarket(rng: () => number, count = 8): MarketEntry[] {
  const usedNames = new Set<string>();
  const out: MarketEntry[] = [];
  const positions: Position[] = ["GK", "DF", "DF", "MF", "MF", "MF", "FW", "FW"];
  for (let i = 0; i < count; i++) {
    const pos = positions[i % positions.length];
    const quality = 55 + rng() * 26;
    const p = makePlayer(rng, "free", pos, quality, usedNames);
    const asking = Math.round(p.value * (1.05 + rng() * 0.35) / 1000) * 1000;
    out.push({ player: p, asking });
  }
  return out;
}

/** Oferta de venta por un jugador del usuario (60-85% del valor). */
export function sellOffer(rng: () => number, p: Player): number {
  return Math.round(p.value * (0.6 + rng() * 0.25) / 500) * 500;
}
