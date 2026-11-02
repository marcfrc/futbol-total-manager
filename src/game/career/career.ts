/**
 * career/career.ts — Store del modo carrera: estado, acciones de gestión, avance semanal,
 * economía, desarrollo de jugadores, persistencia y pub/sub para React.
 */

import { storage } from "../storage";
import { mulberry32 } from "./names";
import type {
  CareerState, FinanceEntry, MatchResult, MarketEntry, NewsItem, Player, TableRow, Team,
  Tactics, TrainingFocus,
} from "./types";
import { generateMarket, generateWorld, sellOffer } from "./world";
import { applyResultToFixture, bestXI, simulateMatch, teamStrength } from "./sim";
import { CLUBS } from "./names";

const SAVE_KEY = "ftm.career.v1";
const SAVE_VERSION = 1;

type Listener = () => void;

const AI_TACTICS: Tactics[] = [
  { formation: "4-4-2", mentality: "balanced", pressing: "mid" },
  { formation: "4-3-3", mentality: "attacking", pressing: "high" },
  { formation: "5-3-2", mentality: "defensive", pressing: "low" },
  { formation: "3-5-2", mentality: "balanced", pressing: "mid" },
];

export class CareerStore {
  state: CareerState | null = null;
  private listeners = new Set<Listener>();
  private rng: () => number = mulberry32(1);

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): CareerState | null => this.state;
  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  hasSave(): boolean {
    const s = storage.get<CareerState | null>(SAVE_KEY, null);
    return !!s && s.version === SAVE_VERSION;
  }

  load(): boolean {
    const s = storage.get<CareerState | null>(SAVE_KEY, null);
    if (s && s.version === SAVE_VERSION) {
      this.state = s;
      this.rng = mulberry32(s.seed + s.week * 7919 + s.season * 131);
      this.emit();
      return true;
    }
    return false;
  }

  save(): void {
    if (this.state) storage.set(SAVE_KEY, this.state);
  }

  wipe(): void {
    storage.remove(SAVE_KEY);
    this.state = null;
    this.emit();
  }

  /** Nueva carrera eligiendo club. */
  newCareer(clubIndex: number): void {
    const seed = (Date.now() ^ (clubIndex * 2654435761)) >>> 0;
    this.rng = mulberry32(seed);
    const world = generateWorld(this.rng, clubIndex);
    this.state = {
      version: SAVE_VERSION,
      seed,
      season: 1,
      week: 0,
      userTeamId: world.teams[clubIndex].id,
      teams: world.teams,
      players: world.players,
      fixtures: world.fixtures,
      market: generateMarket(this.rng),
      news: [{ week: 0, text: `¡Bienvenido a ${world.teams[clubIndex].name}! La afición espera una gran temporada.`, kind: "info" }],
      finances: [{ week: 0, label: "Presupuesto inicial", amount: world.teams[clubIndex].budget }],
      tactics: { formation: "4-3-3", mentality: "balanced", pressing: "mid" },
      training: "attack",
      rounds: world.rounds,
    };
    this.save();
    this.emit();
  }

  // ---------- consultas ----------

  userTeam(): Team {
    const s = this.must();
    return s.teams.find((t) => t.id === s.userTeamId)!;
  }

  squad(): Player[] {
    const s = this.must();
    return s.players.filter((p) => p.teamId === s.userTeamId).sort((a, b) => b.ovr - a.ovr);
  }

  xi(): Player[] {
    const s = this.must();
    return bestXI(s.players, s.userTeamId, s.tactics.formation);
  }

  table(): TableRow[] {
    const s = this.must();
    const rows = new Map<string, TableRow>();
    for (const t of s.teams) rows.set(t.id, { teamId: t.id, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
    for (const f of s.fixtures) {
      if (!f.played) continue;
      const h = rows.get(f.homeId)!, a = rows.get(f.awayId)!;
      h.gf += f.homeGoals!; h.ga += f.awayGoals!;
      a.gf += f.awayGoals!; a.ga += f.homeGoals!;
      if (f.homeGoals! > f.awayGoals!) { h.pts += 3; h.w++; a.l++; }
      else if (f.homeGoals! < f.awayGoals!) { a.pts += 3; a.w++; h.l++; }
      else { h.pts++; a.pts++; h.d++; a.d++; }
    }
    return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
  }

  userFixture() {
    const s = this.must();
    if (s.week >= s.rounds) return null;
    return s.fixtures.find((f) => f.round === s.week && (f.homeId === s.userTeamId || f.awayId === s.userTeamId)) ?? null;
  }

  aiTacticsFor(teamId: string): Tactics {
    const s = this.must();
    const idx = Math.max(0, s.teams.findIndex((t) => t.id === teamId));
    return AI_TACTICS[idx % AI_TACTICS.length];
  }

  wageBill(): number {
    return this.squad().reduce((a, p) => a + p.wage, 0);
  }

  // ---------- gestión ----------

  setTactics(t: Partial<Tactics>): void {
    const s = this.must();
    s.tactics = { ...s.tactics, ...t };
    this.save(); this.emit();
  }

  setTraining(f: TrainingFocus): void {
    const s = this.must();
    s.training = f;
    this.save(); this.emit();
  }

  buyPlayer(marketIndex: number): string | null {
    const s = this.must();
    const entry = s.market[marketIndex];
    if (!entry) return "Ficha de mercado no disponible.";
    const team = this.userTeam();
    if (team.budget < entry.asking) return "No tienes presupuesto suficiente.";
    if (this.squad().length >= 24) return "Plantilla completa (24). Vende a alguien primero.";
    team.budget -= entry.asking;
    entry.player.teamId = s.userTeamId;
    s.players.push(entry.player);
    s.market.splice(marketIndex, 1);
    s.finances.unshift({ week: s.week, label: `Fichaje: ${entry.player.name}`, amount: -entry.asking });
    s.news.unshift({ week: s.week, text: `📢 ${team.name} ficha a ${entry.player.name} (${entry.player.ovr} de media) por ${fmtMoney(entry.asking)}.`, kind: "good" });
    this.save(); this.emit();
    return null;
  }

  sellPlayer(playerId: string): string | null {
    const s = this.must();
    const p = s.players.find((p) => p.id === playerId && p.teamId === s.userTeamId);
    if (!p) return "Jugador no encontrado.";
    if (this.squad().length <= 12) return "No puedes quedarte con menos de 12 jugadores.";
    const offer = sellOffer(this.rng, p);
    const team = this.userTeam();
    team.budget += offer;
    s.players = s.players.filter((x) => x.id !== playerId);
    s.finances.unshift({ week: s.week, label: `Venta: ${p.name}`, amount: offer });
    s.news.unshift({ week: s.week, text: `${p.name} abandona ${team.name} por ${fmtMoney(offer)}.`, kind: "info" });
    this.save(); this.emit();
    return null;
  }

  // ---------- partido del usuario ----------

  /** Registra el resultado del partido del usuario (jugado en 3D o simulado). */
  recordUserResult(r: MatchResult): void {
    const s = this.must();
    applyResultToFixture(s.fixtures, r);

    const isHome = r.homeId === s.userTeamId;
    const gf = isHome ? r.homeGoals : r.awayGoals;
    const ga = isHome ? r.awayGoals : r.homeGoals;
    const won = gf > ga, drew = gf === ga;

    // estadísticas, moral y forma del once usuario
    const xiIds = new Set(this.xi().map((p) => p.id));
    for (const p of s.players) {
      if (p.teamId !== s.userTeamId) continue;
      if (xiIds.has(p.id)) {
        p.apps++;
        p.fitness = Math.max(35, p.fitness - 14 - (s.tactics.pressing === "high" ? 6 : 0));
        p.morale = clamp(p.morale + (won ? 8 : drew ? 2 : -9), 5, 100);
      } else {
        p.morale = clamp(p.morale - 1.5, 5, 100); // suplente sin minutos
      }
    }
    // goles de todos los jugadores (ambos equipos)
    for (const id of r.allScorerIds) {
      const p = s.players.find((x) => x.id === id);
      if (p) {
        p.goals++;
        if (p.teamId === s.userTeamId) p.morale = Math.min(100, p.morale + 10);
      }
    }
    for (const inj of r.userInjuries) {
      const p = s.players.find((x) => x.id === inj.playerId);
      if (p) {
        p.injuredW = inj.weeks;
        s.news.unshift({ week: s.week, text: `🚑 ${p.name} se lesiona y estará ${inj.weeks} semana(s) de baja.`, kind: "bad" });
      }
    }

    // taquilla y prima por resultado
    const team = this.userTeam();
    const gate = Math.round((22000 + gf * 8000 + team.prestige * 12000) / 500) * 500;
    const bonus = won ? 40000 : drew ? 15000 : 0;
    team.budget += gate + bonus;
    s.finances.unshift({ week: s.week, label: `Taquilla jornada ${s.week + 1}`, amount: gate });
    if (bonus) s.finances.unshift({ week: s.week, label: `Prima por ${won ? "victoria" : "empate"}`, amount: bonus });

    s.news.unshift({
      week: s.week,
      text: `${isHome ? team.short : s.teams.find(t => t.id === r.awayId)!.short} ${gf} - ${ga} ${isHome ? s.teams.find(t => t.id === r.awayId)!.short : team.short} · ${won ? "¡Victoria!" : drew ? "Empate." : "Derrota."}`,
      kind: won ? "good" : drew ? "match" : "bad",
    });
    this.save(); this.emit();
  }

  /** Simula el partido del usuario si decide no jugarlo. */
  simUserMatch(): void {
    const s = this.must();
    const fx = this.userFixture();
    if (!fx) return;
    const home = s.teams.find((t) => t.id === fx.homeId)!;
    const away = s.teams.find((t) => t.id === fx.awayId)!;
    const r = simulateMatch(this.rng, home, away, s.players,
      home.id === s.userTeamId ? s.tactics : this.aiTacticsFor(home.id),
      away.id === s.userTeamId ? s.tactics : this.aiTacticsFor(away.id));
    this.recordUserResult(r);
  }

  /** ¿El partido del usuario de esta jornada ya está resuelto? */
  userMatchDone(): boolean {
    const fx = this.userFixture();
    return !fx || !!fx.played;
  }

  // ---------- avance semanal ----------

  advanceWeek(): void {
    const s = this.must();
    if (!this.userMatchDone()) return;

    // 1. Simular el resto de partidos de la jornada
    for (const f of s.fixtures) {
      if (f.round !== s.week || f.played) continue;
      const home = s.teams.find((t) => t.id === f.homeId)!;
      const away = s.teams.find((t) => t.id === f.awayId)!;
      const r = simulateMatch(this.rng, home, away, s.players, this.aiTacticsFor(home.id), this.aiTacticsFor(away.id));
      applyResultToFixture(s.fixtures, r);
      // estadísticas y moral de los equipos IA
      for (const id of r.allScorerIds) {
        const p = s.players.find((x) => x.id === id);
        if (p) { p.goals++; p.morale = Math.min(100, p.morale + 8); }
      }
      for (const teamId of [home.id, away.id]) {
        const xi = bestXI(s.players, teamId, this.aiTacticsFor(teamId).formation);
        const teamWon = teamId === home.id ? r.homeGoals > r.awayGoals : r.awayGoals > r.homeGoals;
        const teamDrew = r.homeGoals === r.awayGoals;
        for (const p of xi) {
          p.apps++;
          p.fitness = Math.max(35, p.fitness - 12);
          p.morale = clamp(p.morale + (teamWon ? 7 : teamDrew ? 1 : -8), 5, 100);
        }
      }
    }

    // 2. Economía semanal: patrocinio - salarios
    const team = this.userTeam();
    const sponsor = Math.round((34000 * team.prestige + 8000) / 500) * 500;
    const wages = this.wageBill();
    team.budget += sponsor - wages;
    s.finances.unshift({ week: s.week, label: "Patrocinio semanal", amount: sponsor });
    s.finances.unshift({ week: s.week, label: "Salarios semanales", amount: -wages });

    // 3. Desarrollo, recuperación, moral
    for (const p of s.players) {
      if (p.injuredW > 0) { p.injuredW--; if (p.injuredW === 0 && p.teamId === s.userTeamId) s.news.unshift({ week: s.week, text: `✅ ${p.name} se recupera de su lesión.`, kind: "good" }); }
      p.fitness = clamp(p.fitness + 16, 35, 100);
      // crecimiento de jóvenes según entrenamiento
      if (p.age <= 23 && p.ovr < p.pot) {
        let chance = 0.16 + p.apps * 0.004;
        if (s.training === "youth") chance += 0.12;
        if (s.training === "attack" && (p.pos === "FW" || p.pos === "MF")) chance += 0.06;
        if (s.training === "defense" && (p.pos === "DF" || p.pos === "GK")) chance += 0.06;
        if (this.rng() < chance) {
          p.ovr++;
          p.pac = clamp(p.pac + (this.rng() < 0.4 ? 1 : 0), 30, 97);
          p.sho = clamp(p.sho + (this.rng() < 0.4 ? 1 : 0), 30, 97);
          p.pas = clamp(p.pas + (this.rng() < 0.4 ? 1 : 0), 30, 97);
          p.def = clamp(p.def + (this.rng() < 0.35 ? 1 : 0), 30, 97);
          p.value = Math.round(p.value * 1.06 / 500) * 500;
          if (p.teamId === s.userTeamId && p.ovr >= p.pot - 1)
            s.news.unshift({ week: s.week, text: `🌱 ${p.name} progresa hasta ${p.ovr} de media.`, kind: "good" });
        }
      } else if (p.age >= 32 && this.rng() < 0.1 && p.ovr > 45) {
        p.ovr--;
        p.value = Math.max(3000, Math.round(p.value * 0.94 / 500) * 500);
      }
      // deriva de moral hacia la media
      p.morale = clamp(p.morale + (55 - p.morale) * 0.06, 5, 100);
      // lesiones aleatorias leves por sobrecarga (entrenamiento físico lo reduce)
      if (p.injuredW === 0 && this.rng() < (s.training === "physical" ? 0.006 : 0.012)) {
        p.injuredW = 1 + ((this.rng() * 3) | 0);
        if (p.teamId === s.userTeamId) s.news.unshift({ week: s.week, text: `🚑 ${p.name} se lesiona en el entrenamiento (${p.injuredW} sem.).`, kind: "bad" });
      }
      p.contractW--;
    }

    // 4. Físico del equipo mejora con enfoque físico
    if (s.training === "physical") {
      for (const p of s.players) if (p.teamId === s.userTeamId) p.fitness = clamp(p.fitness + 6, 35, 100);
    }

    // 5. Mercado semanal
    s.market = generateMarket(this.rng, 7 + ((this.rng() * 4) | 0));

    // 6. Avanzar jornada / terminar temporada
    s.week++;
    if (s.week >= s.rounds) this.endSeason();
    else if (s.week === s.rounds - 1) s.news.unshift({ week: s.week, text: "🏁 Última jornada. ¡Todo se decide ahora!", kind: "info" });

    // 7. Quiebra
    if (team.budget < -250000) {
      s.gameOver = true;
      s.news.unshift({ week: s.week, text: "💀 El club entra en quiebra. La directiva te destituye.", kind: "bad" });
    }

    this.save(); this.emit();
  }

  private endSeason(): void {
    const s = this.must();
    const table = this.table();
    const champ = table[0];
    s.championTeamId = champ.teamId;
    const champTeam = s.teams.find((t) => t.id === champ.teamId)!;
    s.news.unshift({ week: s.week, text: `🏆 ¡${champTeam.name} se proclama campeón de liga!`, kind: champ.teamId === s.userTeamId ? "good" : "match" });

    // premios por posición
    const prizes = [1_500_000, 900_000, 650_000, 450_000, 320_000, 240_000, 180_000, 130_000];
    const pos = table.findIndex((r) => r.teamId === s.userTeamId);
    const prize = prizes[Math.max(0, pos)] ?? 100_000;
    const team = this.userTeam();
    team.budget += prize;
    s.finances.unshift({ week: s.week, label: `Premio de liga (${pos + 1}º)`, amount: prize });
  }

  /** Inicia la siguiente temporada tras ver al campeón. */
  nextSeason(): void {
    const s = this.must();
    if (!s.championTeamId) return;
    const oldPlayers = s.players;
    s.players = [];
    const usedIds = new Set<string>();
    for (const p of oldPlayers) {
      if (usedIds.has(p.id)) continue;
      usedIds.add(p.id);
      p.age++;
      p.goals = 0; p.apps = 0;
      p.fitness = 88 + ((this.rng() * 12) | 0);
      p.injuredW = 0;
      if (p.age >= 35 || (p.age >= 33 && this.rng() < 0.4)) continue; // retirada
      s.players.push(p);
    }
    // regenerar jugadores retirados / reforzar equipos IA
    for (const t of s.teams) {
      const squad = s.players.filter((p) => p.teamId === t.id);
      let need = 18 - squad.length;
      while (need-- > 0) {
        const mkt = generateMarket(this.rng, 1);
        const np = mkt[0].player;
        np.teamId = t.id;
        np.age = 17 + ((this.rng() * 4) | 0);
        np.ovr = Math.min(np.pot, Math.round(55 + t.prestige * 18 + this.rng() * 6));
        np.wage = Math.max(400, Math.round(np.value / 90 / 50) * 50);
        s.players.push(np);
      }
      // la IA refuerza con su presupuesto
      if (!t.isUser && t.budget > 400_000 && this.rng() < 0.6) {
        const mkt = generateMarket(this.rng, 1);
        const np = mkt[0].player;
        if (np.value < t.budget * 0.7) {
          t.budget -= np.value;
          np.teamId = t.id;
          s.players.push(np);
        }
      }
    }

    // renovaciones del usuario: subida salarial 10%, si no hay dinero se marcha libre
    const team = this.userTeam();
    for (const p of [...s.players]) {
      if (p.teamId !== s.userTeamId) continue;
      if (p.contractW <= 0) {
        p.contractW = 104;
        p.wage = Math.round(p.wage * 1.1 / 50) * 50;
        s.news.unshift({ week: 0, text: `✍️ ${p.name} renueva su contrato.`, kind: "info" });
      }
    }

    // nuevo calendario con semilla nueva de temporada
    const world = generateWorld(mulberry32(s.seed + s.season * 977), s.teams.findIndex((t) => t.id === s.userTeamId));
    s.fixtures = world.fixtures;
    s.rounds = world.rounds;
    s.season++;
    s.week = 0;
    s.championTeamId = undefined;
    s.market = generateMarket(this.rng);
    s.news.unshift({ week: 0, text: `🗓️ Comienza la temporada ${s.season}. ¡A por todas!`, kind: "info" });
    this.save(); this.emit();
  }

  /** Datos de fuerza para el motor de partido: medias efectivas de ambos onces. */
  matchStrengths(homeId: string, awayId: string): { home: number; away: number } {
    const s = this.must();
    const homeXI = bestXI(s.players, homeId, homeId === s.userTeamId ? s.tactics.formation : this.aiTacticsFor(homeId).formation);
    const awayXI = bestXI(s.players, awayId, awayId === s.userTeamId ? s.tactics.formation : this.aiTacticsFor(awayId).formation);
    return { home: teamStrength(homeXI), away: teamStrength(awayXI) };
  }

  private must(): CareerState {
    if (!this.state) throw new Error("No hay carrera activa");
    return this.state;
  }
}

export function fmtMoney(v: number): string {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)} M€`;
  if (abs >= 1000) return `${sign}${Math.round(abs / 1000)} k€`;
  return `${sign}${abs} €`;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const career = new CareerStore();
export { CLUBS };
