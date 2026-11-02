/**
 * career/formations.ts — Formaciones con posiciones base (x: ancho -1..1, z: largo 0..1 desde portería propia).
 * Las usa tanto la simulación como el motor de partido 3D.
 */

export interface FormationSlot {
  pos: "GK" | "DF" | "MF" | "FW";
  x: number; // -1 (izquierda) .. 1 (derecha)
  z: number; // 0 (portería propia) .. 1 (portería rival)
}

export const FORMATIONS: Record<string, { label: string; slots: FormationSlot[] }> = {
  "4-4-2": {
    label: "4-4-2",
    slots: [
      { pos: "GK", x: 0, z: 0.03 },
      { pos: "DF", x: -0.75, z: 0.2 }, { pos: "DF", x: -0.25, z: 0.17 }, { pos: "DF", x: 0.25, z: 0.17 }, { pos: "DF", x: 0.75, z: 0.2 },
      { pos: "MF", x: -0.7, z: 0.45 }, { pos: "MF", x: -0.25, z: 0.42 }, { pos: "MF", x: 0.25, z: 0.42 }, { pos: "MF", x: 0.7, z: 0.45 },
      { pos: "FW", x: -0.25, z: 0.72 }, { pos: "FW", x: 0.25, z: 0.72 },
    ],
  },
  "4-3-3": {
    label: "4-3-3",
    slots: [
      { pos: "GK", x: 0, z: 0.03 },
      { pos: "DF", x: -0.75, z: 0.2 }, { pos: "DF", x: -0.25, z: 0.17 }, { pos: "DF", x: 0.25, z: 0.17 }, { pos: "DF", x: 0.75, z: 0.2 },
      { pos: "MF", x: -0.45, z: 0.42 }, { pos: "MF", x: 0, z: 0.38 }, { pos: "MF", x: 0.45, z: 0.42 },
      { pos: "FW", x: -0.6, z: 0.72 }, { pos: "FW", x: 0, z: 0.78 }, { pos: "FW", x: 0.6, z: 0.72 },
    ],
  },
  "3-5-2": {
    label: "3-5-2",
    slots: [
      { pos: "GK", x: 0, z: 0.03 },
      { pos: "DF", x: -0.45, z: 0.18 }, { pos: "DF", x: 0, z: 0.15 }, { pos: "DF", x: 0.45, z: 0.18 },
      { pos: "MF", x: -0.8, z: 0.42 }, { pos: "MF", x: -0.35, z: 0.45 }, { pos: "MF", x: 0, z: 0.38 }, { pos: "MF", x: 0.35, z: 0.45 }, { pos: "MF", x: 0.8, z: 0.42 },
      { pos: "FW", x: -0.22, z: 0.72 }, { pos: "FW", x: 0.22, z: 0.72 },
    ],
  },
  "5-3-2": {
    label: "5-3-2",
    slots: [
      { pos: "GK", x: 0, z: 0.03 },
      { pos: "DF", x: -0.8, z: 0.24 }, { pos: "DF", x: -0.45, z: 0.16 }, { pos: "DF", x: 0, z: 0.14 }, { pos: "DF", x: 0.45, z: 0.16 }, { pos: "DF", x: 0.8, z: 0.24 },
      { pos: "MF", x: -0.45, z: 0.42 }, { pos: "MF", x: 0, z: 0.38 }, { pos: "MF", x: 0.45, z: 0.42 },
      { pos: "FW", x: -0.25, z: 0.7 }, { pos: "FW", x: 0.25, z: 0.7 },
    ],
  },
  "4-2-3-1": {
    label: "4-2-3-1",
    slots: [
      { pos: "GK", x: 0, z: 0.03 },
      { pos: "DF", x: -0.75, z: 0.2 }, { pos: "DF", x: -0.25, z: 0.17 }, { pos: "DF", x: 0.25, z: 0.17 }, { pos: "DF", x: 0.75, z: 0.2 },
      { pos: "MF", x: -0.25, z: 0.32 }, { pos: "MF", x: 0.25, z: 0.32 },
      { pos: "MF", x: -0.6, z: 0.55 }, { pos: "MF", x: 0, z: 0.58 }, { pos: "MF", x: 0.6, z: 0.55 },
      { pos: "FW", x: 0, z: 0.76 },
    ],
  },
};

export const FORMATION_KEYS = Object.keys(FORMATIONS);
