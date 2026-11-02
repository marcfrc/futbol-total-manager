/**
 * match/constants.ts — Dimensiones y tuning del partido (metros, segundos).
 */

export const PITCH_W = 68;      // eje x
export const PITCH_L = 100;     // eje z
export const GOAL_W = 7.32;
export const GOAL_H = 2.44;
export const GOAL_DEPTH = 2.2;
export const BALL_R = 0.24;
export const PLAYER_R = 0.55;

export const BOX_W = 40.3;      // área grande
export const BOX_D = 16.5;
export const SIX_W = 18.3;
export const SIX_D = 5.5;
export const PENALTY_D = 11;

export const WALK_SPEED = 3.2;
export const RUN_SPEED = 6.4;
export const SPRINT_MULT = 1.28;
export const BALL_FRICTION = 1.9;    // rozamiento del césped (1/s)
export const BALL_GRAVITY = 18;
export const BALL_BOUNCE = 0.52;

export const HALF_SECONDS = 120;     // duración real de cada parte
export const MATCH_MINUTES = 90;     // minutos "de pantalla"

/** segundos reales por minuto de marcador */
export const SECONDS_PER_MINUTE = (HALF_SECONDS * 2) / MATCH_MINUTES;
