/**
 * career/types.ts — Tipos del modo carrera (gestión estilo Football Manager).
 */

export type Position = "GK" | "DF" | "MF" | "FW";

export interface Player {
  id: string;
  name: string;
  age: number;
  pos: Position;
  /** Media global 40-92 */
  ovr: number;
  /** Potencial 45-95 */
  pot: number;
  pac: number; // ritmo
  sho: number; // tiro
  pas: number; // pase
  def: number; // defensa
  gk: number;  // portería
  sta: number; // resistencia
  morale: number;   // 0-100
  fitness: number;  // 0-100
  /** Salario semanal (€) */
  wage: number;
  /** Valor de mercado (€) */
  value: number;
  /** Semanas de contrato restantes */
  contractW: number;
  /** Semanas de lesión restantes (0 = sano) */
  injuredW: number;
  goals: number;
  apps: number;
  teamId: string;
}

export type Mentality = "defensive" | "balanced" | "attacking";
export type Pressing = "low" | "mid" | "high";
export type TrainingFocus = "attack" | "defense" | "physical" | "youth";

export interface Tactics {
  formation: string; // clave de FORMATIONS
  mentality: Mentality;
  pressing: Pressing;
}

export interface Team {
  id: string;
  name: string;
  short: string; // 3 letras
  color1: string; // camiseta
  color2: string; // pantalón
  isUser: boolean;
  budget: number;
  /** Fuerza base oculta para la IA de mercado/simulación */
  prestige: number;
}

export interface Fixture {
  round: number;
  homeId: string;
  awayId: string;
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
  /** Goleadores "min jugador" para el resumen */
  events?: string[];
}

export interface TableRow {
  teamId: string;
  pts: number;
  w: number; d: number; l: number;
  gf: number; ga: number;
}

export interface MarketEntry {
  player: Player;
  asking: number; // precio pedido
}

export interface NewsItem {
  week: number;
  text: string;
  kind: "info" | "good" | "bad" | "match";
}

export interface FinanceEntry {
  week: number;
  label: string;
  amount: number; // + ingreso / - gasto
}

export interface CareerState {
  version: number;
  seed: number;
  season: number;
  week: number; // jornada actual (0..rounds-1)
  userTeamId: string;
  teams: Team[];
  players: Player[];       // todos los jugadores del mundo
  fixtures: Fixture[];     // calendario completo
  market: MarketEntry[];
  news: NewsItem[];
  finances: FinanceEntry[];
  tactics: Tactics;
  training: TrainingFocus;
  rounds: number;
  championTeamId?: string; // temporada finalizada
  gameOver?: boolean;
}

export interface MatchResult {
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  events: string[];        // "23' Nombre (EQU)"
  playedByUser: boolean;
  /** ids de jugadores del usuario que marcaron */
  userScorerIds: string[];
  /** ids de TODOS los goleadores (para estadísticas de liga) */
  allScorerIds: string[];
  /** Lesiones sufridas durante el partido del usuario */
  userInjuries: { playerId: string; weeks: number }[];
}
