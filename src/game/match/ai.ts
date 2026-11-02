/**
 * match/ai.ts — Inteligencia de los 21 jugadores no controlados:
 * posicionamiento por anclas de formación, presión, conducción, pases y tiros.
 */

import { BOX_D, GOAL_W, PITCH_L, PITCH_W, RUN_SPEED } from "./constants";
import { FORMATIONS } from "../career/formations";
import type { Anchor, MatchCtx, RTPlayer } from "./rt";

/** Anclas en coordenadas de mundo para un equipo (attackDir +1 ataca hacia +z). */
export function teamAnchors(formation: string, attackDir: number): Anchor[] {
  const slots = (FORMATIONS[formation] ?? FORMATIONS["4-4-2"]).slots;
  return slots.map((s) => ({
    x: s.x * (PITCH_W / 2 - 5),
    // slot.z 0..1 desde portería propia hasta la rival
    z: attackDir === 1 ? -PITCH_L / 2 + s.z * PITCH_L : PITCH_L / 2 - s.z * PITCH_L,
    pos: s.pos,
  }));
}

function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

function nearestOf(players: RTPlayer[], x: number, z: number, filter: (p: RTPlayer) => boolean, n: number, out: RTPlayer[]): RTPlayer[] {
  out.length = 0;
  for (const p of players) {
    if (!filter(p)) continue;
    // inserción ordenada simple (n <= 2)
    const d = dist2(p.x, p.z, x, z);
    if (out.length < n) { out.push(p); (p as { __d?: number }).__d = d; out.sort((a, b) => ((a as { __d?: number }).__d ?? 0) - ((b as { __d?: number }).__d ?? 0)); }
    else if (d < ((out[n - 1] as { __d?: number }).__d ?? Infinity)) { out[n - 1] = p; (p as { __d?: number }).__d = d; out.sort((a, b) => ((a as { __d?: number }).__d ?? 0) - ((b as { __d?: number }).__d ?? 0)); }
  }
  return out;
}

const scratch: RTPlayer[] = [];

/** IA por jugador. Se llama a paso fijo; las decisiones "caras" se temporizan dentro. */
export function updateAI(ctx: MatchCtx, p: RTPlayer, dt: number): void {
  if (p.controlled || p.stagger > 0) return;
  const anchors = p.anchors;
  const anchor = anchors[p.slotIdx];
  const ball = ctx.ball;
  const dir = ctx.attackDir[p.team];
  const ownGoalZ = dir === 1 ? -PITCH_L / 2 : PITCH_L / 2;
  const foeGoalZ = -ownGoalZ;
  const weHaveBall = ball.owner !== null && ball.owner.team === p.team;
  const theyHaveBall = ball.owner !== null && ball.owner.team !== p.team;

  // estirada en curso: no decidir
  if (p.lungeT > 0) return;

  // ---- portero ----
  if (p.isGK) {
    if (ball.owner === p) {
      // sacar en largo tras breve pausa
      p.decideT -= dt;
      p.tx = p.x; p.tz = p.z; p.wantSpeed = 0;
      if (p.decideT <= 0) {
        const mates = ctx.players.filter((m) => m.team === p.team && !m.isGK);
        const target = mates[(ctx.rng() * mates.length) | 0];
        const dx = target.x - p.x, dz = target.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        ctx.kickBall(p, dx / d, dz / d, Math.min(30, d * 0.9), 7 + ctx.rng() * 3, target);
        p.decideT = 0.8;
      }
      return;
    }
    // salir a por balón suelto cercano al área
    const nearBox = Math.abs(ball.z - ownGoalZ) < BOX_D + 3 && Math.abs(ball.x) < 20;
    if (ball.owner === null && nearBox && dist2(p.x, p.z, ball.x, ball.z) < 64) {
      p.tx = ball.x; p.tz = ball.z; p.wantSpeed = RUN_SPEED;
      return;
    }
    // achicar si el rival encara solo
    if (theyHaveBall && dist2(ball.owner!.x, ball.owner!.z, p.x, p.z) < 120 && Math.abs(ball.x) < 14) {
      const bx = ball.x, bz = ball.z;
      p.tx = p.x + (bx - p.x) * 0.25;
      p.tz = p.z + (bz - p.z) * 0.25;
      p.wantSpeed = RUN_SPEED * 0.8;
      return;
    }
    // posición base sobre la línea
    p.tx = clamp(ball.x * 0.28, -3.4, 3.4);
    p.tz = ownGoalZ + (dir === 1 ? 1.3 : -1.3);
    p.wantSpeed = RUN_SPEED * 0.75;
    return;
  }

  // ---- el poseedor (IA) ----
  if (ball.owner === p) {
    p.decideT -= dt;
    const goalDist = Math.hypot(p.x, foeGoalZ - p.z);
    const shootRange = 15 + p.lite.sho / 7;
    if (p.decideT <= 0) {
      p.decideT = 0.22 + ctx.rng() * 0.2;
      // presión del rival más cercano
      nearestOf(ctx.players, p.x, p.z, (m) => m.team !== p.team, 1, scratch);
      const presser = scratch[0];
      const presserD = presser ? Math.hypot(presser.x - p.x, presser.z - p.z) : 99;

      // tiro
      if (goalDist < shootRange && Math.abs(p.x) < GOAL_W * 2.6 && ctx.rng() < 0.75) {
        const acc = (p.lite.sho - 45) / 60; // 0..~0.8
        const err = (1 - acc) * 3.4 + (presserD < 2 ? 1.6 : 0);
        const aimX = clamp((ctx.rng() * 2 - 1) * (GOAL_W / 2 - 0.6), -3, 3) + (ctx.rng() * 2 - 1) * err;
        const dx = aimX - p.x, dz = foeGoalZ - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const speed = 17 + ctx.rng() * 6 + acc * 3;
        ctx.kickBall(p, dx / d, dz / d, speed, ctx.rng() < 0.3 ? 3.5 : 1.2);
        ctx.addEvent(`¡Disparo de ${shortName(p)}!`, "chance");
        return;
      }
      // pase bajo presión o para progresar
      if (presserD < 2.6 || ctx.rng() < 0.3) {
        const mate = pickPassTarget(ctx, p, dir);
        if (mate) {
          const lead = 1.2;
          const dx = mate.x + mate.vx * lead - p.x, dz = mate.z + mate.vz * lead - p.z;
          const d = Math.hypot(dx, dz) || 1;
          const lob = d > 26 && ctx.rng() < 0.5;
          ctx.kickBall(p, dx / d, dz / d, clamp(d * 1.15, 9, 24), lob ? 5.5 : 0.6, mate);
          return;
        }
      }
    }
    // conducir hacia la portería esquivando al presionador
    const avoidX = p.x * 0.06;
    p.tx = clamp(p.x * 0.7 + avoidX, -PITCH_W / 2 + 2, PITCH_W / 2 - 2);
    p.tz = p.z + dir * 8;
    p.wantSpeed = RUN_SPEED * (0.82 + p.lite.pac / 500);
    return;
  }

  // ---- defensa: presionar al poseedor ----
  if (theyHaveBall) {
    const pressing = ctx.pressing[p.team];
    const nPressers = pressing === "high" ? 2 : 1;
    nearestOf(ctx.players, ball.x, ball.z, (m) => m.team === p.team && !m.isGK && !m.controlled, nPressers + 1, scratch);
    const idx = scratch.indexOf(p);
    if (idx >= 0 && idx < nPressers) {
      p.tx = ball.x; p.tz = ball.z;
      p.wantSpeed = RUN_SPEED * (pressing === "high" ? 1 : 0.92);
      // entrada
      const d = Math.hypot(ball.x - p.x, ball.z - p.z);
      if (d < 1.25 && p.tackleCd <= 0 && ball.owner) {
        p.tackleCd = 1.4;
        p.lungeT = 0.28;
        const defRating = p.lite.def;
        const succ = 0.32 + (defRating - ball.owner.lite.ovr) / 140;
        if (ctx.rng() < succ) {
          const owner = ball.owner;
          ball.owner = null;
          ball.noPickupT = 0.15;
          const kdx = p.faceX, kdz = p.faceZ;
          ball.vx = kdx * 7; ball.vz = kdz * 7; ball.vy = 0.5;
          ball.lastTouch = p.team;
          ctx.registerInjury(owner);
        } else {
          p.stagger = 0.7;
        }
      }
      return;
    }
    // el resto: replegar a anclas desplazadas hacia el balón
    const shift = p.pos === "DF" ? 0.1 : p.pos === "MF" ? 0.18 : 0.22;
    p.tx = anchor.x + (ball.x - anchor.x) * shift;
    p.tz = anchor.z + (ball.z - anchor.z) * shift * 0.8 - dir * 2;
    p.wantSpeed = RUN_SPEED * 0.8;
    return;
  }

  // ---- balón suelto: perseguir si eres de los más cercanos ----
  if (ball.owner === null) {
    nearestOf(ctx.players, ball.x + ball.vx * 0.3, ball.z + ball.vz * 0.3, (m) => m.team === p.team && !m.isGK && !m.controlled, 2, scratch);
    if (scratch.includes(p)) {
      p.tx = ball.x + ball.vx * 0.35;
      p.tz = ball.z + ball.vz * 0.35;
      p.wantSpeed = RUN_SPEED;
      return;
    }
    // receptor de pase
    if (ball.receiver === p) {
      p.tx = ball.x + ball.vx * 0.4;
      p.tz = ball.z + ball.vz * 0.4;
      p.wantSpeed = RUN_SPEED;
      return;
    }
  }

  // ---- ataque posicional / apoyos ----
  if (weHaveBall) {
    const shift = p.pos === "DF" ? 0.1 : p.pos === "MF" ? 0.22 : 0.3;
    p.tx = anchor.x + (ball.x - anchor.x) * shift * 0.6;
    p.tz = anchor.z + dir * 7 + (ball.z - anchor.z) * shift * 0.5;
    p.wantSpeed = RUN_SPEED * 0.85;
    return;
  }

  // por defecto: volver al ancla
  p.tx = anchor.x;
  p.tz = anchor.z;
  p.wantSpeed = RUN_SPEED * 0.7;
}

/** Elige el mejor compañero para un pase: desmarcado, hacia adelante, distancia media. */
function pickPassTarget(ctx: MatchCtx, p: RTPlayer, dir: number): RTPlayer | null {
  let best: RTPlayer | null = null;
  let bestScore = -Infinity;
  for (const m of ctx.players) {
    if (m.team !== p.team || m === p || m.isGK) continue;
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    if (d < 4 || d > 38) continue;
    // cercanía del rival más próximo al receptor
    let minFoe = 99;
    for (const f of ctx.players) {
      if (f.team === p.team) continue;
      const fd = Math.hypot(f.x - m.x, f.z - m.z);
      if (fd < minFoe) minFoe = fd;
    }
    const forward = (m.z - p.z) * dir; // positivo = hacia adelante
    const score = minFoe * 2.2 + forward * 0.9 - Math.abs(d - 15) * 0.35 + ctx.rng() * 2;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

export function shortName(p: RTPlayer): string {
  const parts = p.lite.name.split(" ");
  return parts[parts.length - 1];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
