/**
 * career/sim.ts — Simulación rápida de partidos (IA vs IA, o el partido del usuario si lo omite).
 * Modelo: fuerza efectiva por equipo (mejor once + moral + forma + tácticas) y goles poissonianos.
 */

import type { Fixture, MatchResult, Player, Team, Tactics } from "./types";
import { FORMATIONS } from "./formations";

/** Mejor once disponible de un equipo según formación. */
export function bestXI(players: Player[], teamId: string, formation: string): Player[] {
  const squad = players.filter((p) => p.teamId === teamId && p.injuredW <= 0);
  const slots = FORMATIONS[formation]?.slots ?? FORMATIONS["4-4-2"].slots;
  const xi: Player[] = [];
  const used = new Set<string>();
  for (const slot of slots) {
    let best: Player | null = null;
    let bestScore = -1;
    for (const p of squad) {
      if (used.has(p.id)) continue;
      // puntuación por idoneidad de posición
      const posFit = p.pos === slot.pos ? 1 : p.pos === "MF" && slot.pos !== "GK" ? 0.82 : p.pos === "DF" && slot.pos === "MF" ? 0.7 : slot.pos === "GK" ? (p.pos === "GK" ? 1 : 0.1) : 0.55;
      const score = (slot.pos === "GK" ? p.gk : p.ovr) * posFit * (0.7 + 0.3 * (p.fitness / 100));
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best) { used.add(best.id); xi.push(best); }
  }
  return xi;
}

/** Fuerza efectiva 50-95 del once con moral/forma/táctica aplicadas. */
export function teamStrength(xi: Player[], tactics?: Tactics): number {
  if (xi.length === 0) return 60;
  let sum = 0;
  for (const p of xi) {
    const m = 0.88 + 0.24 * (p.morale / 100);
    const f = 0.85 + 0.15 * (p.fitness / 100);
    sum += (p.pos === "GK" ? p.gk : p.ovr) * m * f;
  }
  let s = sum / xi.length;
  if (tactics) {
    if (tactics.pressing === "high") s += 0.8;
    if (tactics.mentality === "attacking") s += 0.5;
  }
  return s;
}

function tacticsGoalMod(t?: Tactics): { atk: number; def: number } {
  if (!t) return { atk: 0, def: 0 };
  let atk = 0, def = 0;
  if (t.mentality === "attacking") { atk += 0.22; def += 0.14; }
  if (t.mentality === "defensive") { atk -= 0.18; def -= 0.12; }
  if (t.pressing === "high") { atk += 0.08; def += 0.06; }
  if (t.pressing === "low") { def -= 0.05; }
  return { atk, def };
}

/** Simula un partido. rng con semilla para determinismo. */
export function simulateMatch(
  rng: () => number,
  home: Team,
  away: Team,
  allPlayers: Player[],
  homeTactics?: Tactics,
  awayTactics?: Tactics,
): MatchResult {
  const homeXI = bestXI(allPlayers, home.id, homeTactics?.formation ?? "4-4-2");
  const awayXI = bestXI(allPlayers, away.id, awayTactics?.formation ?? "4-4-2");
  const hs = teamStrength(homeXI, homeTactics) + 2.5; // factor campo
  const as = teamStrength(awayXI, awayTactics);
  const hm = tacticsGoalMod(homeTactics);
  const am = tacticsGoalMod(awayTactics);

  const diff = (hs - as) / 14;
  const lambdaHome = Math.max(0.15, 1.45 * Math.exp(diff * 0.55) + hm.atk + am.def);
  const lambdaAway = Math.max(0.12, 1.25 * Math.exp(-diff * 0.55) + am.atk + hm.def);

  const poisson = (lambda: number) => {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rng(); } while (p > L && k < 9);
    return k - 1;
  };

  const homeGoals = poisson(lambdaHome);
  const awayGoals = poisson(lambdaAway);

  const events: string[] = [];
  const userScorerIds: string[] = [];
  const allScorerIds: string[] = [];
  const mkEvents = (xi: Player[], goals: number, short: string, isUser: boolean) => {
    const attackers = xi.filter((p) => p.pos !== "GK");
    for (let i = 0; i < goals; i++) {
      // los delanteros marcan más
      const pool = attackers.flatMap((p) => {
        const w = p.pos === "FW" ? 5 : p.pos === "MF" ? 2.4 : 1;
        return Array(Math.max(1, Math.round(w))).fill(p);
      });
      const scorer = pool[(rng() * pool.length) | 0];
      const minute = 2 + ((rng() * 90) | 0);
      events.push(`${minute}' ${scorer.name} (${short})`);
      allScorerIds.push(scorer.id);
      if (isUser) userScorerIds.push(scorer.id);
    }
  };
  mkEvents(homeXI, homeGoals, home.short, home.isUser);
  mkEvents(awayXI, awayGoals, away.short, away.isUser);
  events.sort((a, b) => parseInt(a) - parseInt(b));

  return { homeId: home.id, awayId: away.id, homeGoals, awayGoals, events, playedByUser: false, userScorerIds, allScorerIds, userInjuries: [] };
}

/** Aplica un resultado al calendario. */
export function applyResultToFixture(fixtures: Fixture[], r: MatchResult): void {
  const f = fixtures.find((f) => !f.played && f.homeId === r.homeId && f.awayId === r.awayId);
  if (f) {
    f.played = true;
    f.homeGoals = r.homeGoals;
    f.awayGoals = r.awayGoals;
    f.events = r.events;
  }
}
