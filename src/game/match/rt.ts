/**
 * match/rt.ts — Tipos de runtime del partido y contratos con el exterior.
 */

import type { PlayerMesh } from "./entities";
import type { Mentality, Pressing } from "../career/types";

export interface MatchPlayerLite {
  id: string;
  name: string;
  pos: "GK" | "DF" | "MF" | "FW";
  pac: number; sho: number; pas: number; def: number; gk: number; sta: number;
  ovr: number; fitness: number;
}

export interface SideSetup {
  name: string; short: string;
  color1: string; color2: string;
  xi: MatchPlayerLite[];
  formation: string;
  mentality: Mentality;
  pressing: Pressing;
}

export interface MatchSetup {
  home: SideSetup;
  away: SideSetup;
  userSide: "home" | "away";
  seed: number;
  /** fuerza efectiva de cada once (para simular el resto con realismo) */
  strength: { home: number; away: number };
}

export interface MatchOutcome {
  homeGoals: number;
  awayGoals: number;
  events: string[];
  userScorerIds: string[];
  allScorerIds: string[];
  userInjuries: { playerId: string; weeks: number }[];
  abandoned: boolean;
}

export type Phase =
  | "countdown" | "play" | "goal" | "setpiece"
  | "halftime" | "fulltime" | "paused";

export interface HudState {
  homeGoals: number;
  awayGoals: number;
  /** minuto de pantalla 0-90 */
  minute: number;
  half: 1 | 2;
  phase: Phase;
  controlledName: string;
  stamina: number; // 0-100
  charging: number; // 0-1 potencia de tiro
  message: string;
}

export interface MatchCallbacks {
  onHud: (h: HudState) => void;
  onEvent: (text: string, kind: "goal" | "info" | "chance") => void;
  onEnd: (o: MatchOutcome) => void;
}

export interface Anchor { x: number; z: number; pos: string }

/** Runtime de cada jugador en el campo. */
export interface RTPlayer {
  lite: MatchPlayerLite;
  team: 0 | 1; // 0 = home, 1 = away
  slotIdx: number;
  isGK: boolean;
  pos: "GK" | "DF" | "MF" | "FW";
  anchors: Anchor[];
  mesh: PlayerMesh;
  x: number; z: number;
  vx: number; vz: number;
  faceX: number; faceZ: number;
  /** velocidad máxima derivada de ritmo */
  topSpeed: number;
  stamina: number;
  tackleCd: number;
  stagger: number;   // tiempo aturdido tras entrada fallida
  lungeT: number;    // tiempo restante de zambullida/estirada
  decideT: number;   // temporizador de decisión IA
  controlled: boolean;
  /** objetivo de movimiento actual */
  tx: number; tz: number;
  wantSpeed: number;
  injured: boolean;
}

export interface RTBall {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  owner: RTPlayer | null;
  /** equipo del último toque (para saques) */
  lastTouch: 0 | 1;
  /** jugador al que va dirigido el pase */
  receiver: RTPlayer | null;
  noPickupT: number; // breve ventana sin posesión tras patada
}

/** Contexto que comparten motor e IA. */
export interface MatchCtx {
  players: RTPlayer[];
  ball: RTBall;
  /** dirección de ataque de cada equipo (+1 = hacia +z) */
  attackDir: [number, number];
  mentality: [Mentality, Mentality];
  pressing: [Pressing, Pressing];
  rng: () => number;
  kickBall: (p: RTPlayer, dx: number, dz: number, speed: number, vy: number, receiver?: RTPlayer | null) => void;
  minuteNow: () => number;
  addEvent: (text: string, kind: "goal" | "info" | "chance") => void;
  registerGoal: (scorer: RTPlayer) => void;
  registerInjury: (p: RTPlayer) => void;
  userTeam: 0 | 1;
  controlled: RTPlayer | null;
  setControlled: (p: RTPlayer) => void;
}
