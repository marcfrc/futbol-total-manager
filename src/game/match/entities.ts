/**
 * match/entities.ts — Futbolistas articulados con rig de dos segmentos por extremidad
 * (cadera→rodilla→tobillo, hombro→codo→mano), ciclo de carrera procedural con
 * balanceo de torso y clips de animación mezclados en vivo: chut, celebración,
 * estirada del portero y caída tras entrada. Misma filosofía que los motores
 * "realista-estilizados" móviles: silueta atlética + animación fluida.
 */

import * as THREE from "three";

export interface PlayerMesh {
  group: THREE.Group;
  ring: THREE.Mesh;
  setSelected: (v: boolean) => void;
  animate: (speed: number, dt: number, time: number) => void;
  /** Dispara el clip de chut/pase (pierna derecha). */
  kick: () => void;
  /** Celebración de gol: salto con puños en alto. */
  celebrate: () => void;
  /** Estirada del portero hacia un lado (dir -1 izq / +1 der). */
  dive: (dir: number) => void;
  /** Trastabilleo tras recibir una entrada. */
  stumble: () => void;
  /** Depuración: tiempo del clip activo (-1 si no hay). */
  clipInfo: () => number;
  /** Depuración: rotación z y altura actuales de la cadera. */
  hipsInfo: () => [number, number];
}

// ---------------------------------------------------------------------------
// Mini-motor de clips: keyframes sobre articulaciones con interpolación suave
// ---------------------------------------------------------------------------

type JointName =
  | "hips" | "spine" | "neck"
  | "shL" | "elL" | "shR" | "elR"
  | "hipL" | "kneeL" | "ankL" | "hipR" | "kneeR" | "ankR";

const JOINTS: JointName[] = [
  "hips", "spine", "neck",
  "shL", "elL", "shR", "elR",
  "hipL", "kneeL", "ankL", "hipR", "kneeR", "ankR",
];

type JV = [number, number, number];
type Pose = Record<JointName, JV>;

interface ClipKey { t: number; j: Partial<Record<JointName, JV>>; y?: number; x?: number }
interface Clip { dur: number; keys: ClipKey[] }
interface BakedClip { dur: number; times: number[]; fr: Pose[]; ys: number[]; xs: number[] }

const smooth = (s: number) => s * s * (3 - 2 * s);

/** Expande los keyframes con carry-forward: cada clave hereda los valores de la anterior. */
function bake(clip: Clip): BakedClip {
  const cur = {} as Pose;
  for (const jn of JOINTS) cur[jn] = [0, 0, 0];
  let y = 0, x = 0;
  const fr: Pose[] = [];
  const ys: number[] = [];
  const xs: number[] = [];
  const times: number[] = [];
  for (const k of clip.keys) {
    for (const jn of JOINTS) {
      const v = k.j[jn];
      if (v) cur[jn] = [v[0], v[1], v[2]];
    }
    if (k.y !== undefined) y = k.y;
    if (k.x !== undefined) x = k.x;
    fr.push(JSON.parse(JSON.stringify(cur)) as Pose);
    ys.push(y);
    xs.push(x);
    times.push(k.t);
  }
  return { dur: clip.dur, times, fr, ys, xs };
}

/** Muestrea el clip horneado en t y escribe la pose en `out`; devuelve desplazamiento [x, y] de cadera. */
function sampleClip(b: BakedClip, t: number, out: Pose): [number, number] {
  let i = 0;
  while (i < b.times.length - 2 && b.times[i + 1] <= t) i++;
  const t0 = b.times[i];
  const t1 = b.times[i + 1];
  const s = smooth(Math.max(0, Math.min(1, (t - t0) / Math.max(1e-5, t1 - t0))));
  for (const jn of JOINTS) {
    const a = b.fr[i][jn];
    const c = b.fr[i + 1][jn];
    out[jn] = [a[0] + (c[0] - a[0]) * s, a[1] + (c[1] - a[1]) * s, a[2] + (c[2] - a[2]) * s];
  }
  return [b.xs[i] + (b.xs[i + 1] - b.xs[i]) * s, b.ys[i] + (b.ys[i + 1] - b.ys[i]) * s];
}

// Convenio de signos: en las extremidades (cuelgan del pivote, -Y) la rotación
// NEGATIVA en X las lleva hacia ADELANTE (+Z local, dirección de cara).
// En el torso (crece hacia +Y) la rotación POSITIVA en X inclina hacia adelante.

const CLIP_KICK: Clip = {
  dur: 0.62,
  keys: [
    { t: 0, j: {} },
    {
      t: 0.16, y: -0.03,
      j: {
        hipR: [0.85, 0, 0], kneeR: [1.55, 0, 0], ankR: [-0.5, 0, 0],
        hipL: [-0.15, 0, 0], kneeL: [0.28, 0, 0],
        spine: [0.02, -0.22, 0], hips: [0, -0.14, 0],
        shR: [-0.55, 0, 0.1], shL: [0.45, 0, -0.1], elR: [-0.5, 0, 0], elL: [-0.7, 0, 0],
      },
    },
    {
      t: 0.3, y: -0.01,
      j: {
        hipR: [-1.1, 0, 0], kneeR: [0.08, 0, 0], ankR: [-0.55, 0, 0],
        spine: [0.14, 0.18, 0], hips: [0, 0.12, 0],
        shR: [0.35, 0, 0.1], shL: [-0.5, 0, -0.1],
      },
    },
    {
      t: 0.46, y: 0,
      j: {
        hipR: [-1.35, 0, 0], kneeR: [0.5, 0, 0], ankR: [-0.2, 0, 0],
        spine: [0.2, 0.1, 0], shR: [0.5, 0, 0.1], shL: [-0.65, 0, -0.1],
      },
    },
    { t: 0.62, j: {} },
  ],
};

const CLIP_CELEBRATE: Clip = {
  dur: 2.35,
  keys: [
    { t: 0, j: {} },
    {
      t: 0.22, y: -0.16,
      j: {
        hipL: [0.55, 0, 0], hipR: [0.55, 0, 0], kneeL: [1.05, 0, 0], kneeR: [1.05, 0, 0],
        ankL: [-0.4, 0, 0], ankR: [-0.4, 0, 0], spine: [0.22, 0, 0], shL: [0.3, 0, -0.1], shR: [0.3, 0, 0.1],
      },
    },
    {
      t: 0.48, y: 0.4,
      j: {
        hipL: [-0.35, 0, 0], hipR: [-0.35, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0],
        spine: [-0.12, 0, 0], neck: [-0.25, 0, 0],
        shL: [-2.7, 0, -0.45], shR: [-2.7, 0, 0.45], elL: [-0.25, 0, 0], elR: [-0.25, 0, 0],
      },
    },
    {
      t: 0.8, y: -0.08,
      j: {
        hipL: [0.4, 0, 0], hipR: [0.4, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0],
        spine: [0.18, 0, 0],
        shL: [-1.3, 0, -0.5], shR: [-1.3, 0, 0.5], elL: [-1.7, 0, 0], elR: [-1.7, 0, 0],
      },
    },
    {
      t: 1.15, y: 0.16,
      j: {
        hipL: [-0.1, 0, 0], hipR: [-0.1, 0, 0], kneeL: [0.15, 0, 0], kneeR: [0.15, 0, 0],
        spine: [0.05, 0, 0],
        shL: [-2.4, 0, -0.35], shR: [-2.4, 0, 0.35], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0],
      },
    },
    { t: 1.55, y: 0, j: { shL: [-1.5, 0, -0.4], shR: [-1.5, 0, 0.4], elL: [-1.5, 0, 0], elR: [-1.5, 0, 0] } },
    { t: 1.9, y: 0.12, j: { shL: [-2.5, 0, -0.4], shR: [-2.5, 0, 0.4], elL: [-0.5, 0, 0], elR: [-0.5, 0, 0] } },
    { t: 2.35, y: 0, j: {} },
  ],
};

function clipDive(dir: number): Clip {
  const d = dir >= 0 ? 1 : -1;
  return {
    dur: 1.15,
    keys: [
      { t: 0, j: {} },
      {
        t: 0.2, y: 0.12, x: d * 0.15,
        j: {
          hips: [0, 0, -d * 0.55], spine: [0, 0, -d * 0.2],
          shL: [-1.6, 0, -d * 0.4], shR: [-1.6, 0, -d * 0.4], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0],
          hipL: [0.2, 0, 0], hipR: [0.2, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0],
        },
      },
      {
        t: 0.45, y: 0.3, x: d * 0.5,
        j: {
          hips: [0, 0, -d * 1.35], spine: [0, 0, -d * 0.15],
          shL: [-2.9, 0, -d * 0.25], shR: [-2.9, 0, -d * 0.25], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0],
          kneeL: [0.9, 0, 0], kneeR: [0.4, 0, 0],
        },
      },
      {
        t: 0.75, y: 0.08, x: d * 0.62,
        j: {
          hips: [0, 0, -d * 1.5],
          shL: [-3.0, 0, -d * 0.2], shR: [-3.0, 0, -d * 0.2],
          kneeL: [1.1, 0, 0], kneeR: [0.5, 0, 0],
        },
      },
      { t: 1.15, y: 0, x: 0, j: {} },
    ],
  };
}

const CLIP_STUMBLE: Clip = {
  dur: 0.55,
  keys: [
    { t: 0, j: {} },
    {
      t: 0.14, y: -0.12,
      j: {
        spine: [0.5, 0, 0.1], neck: [-0.3, 0, 0],
        shL: [-1.2, 0, -0.7], shR: [-1.0, 0, 0.8], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0],
        hipL: [-0.5, 0, 0], kneeL: [0.8, 0, 0], hipR: [0.3, 0, 0], kneeR: [0.5, 0, 0],
      },
    },
    { t: 0.34, y: -0.1, j: { spine: [0.35, 0, -0.05], shL: [-0.9, 0, -0.9], shR: [-0.8, 0, 0.9] } },
    { t: 0.55, y: 0, j: {} },
  ],
};

const BAKED_KICK = bake(CLIP_KICK);
const BAKED_CELEBRATE = bake(CLIP_CELEBRATE);
const BAKED_STUMBLE = bake(CLIP_STUMBLE);
const BAKED_DIVE_R = bake(clipDive(1));
const BAKED_DIVE_L = bake(clipDive(-1));

// ---------------------------------------------------------------------------
// Construcción del futbolista articulado
// ---------------------------------------------------------------------------

const SKIN_TONES = [0xf1c9a5, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e];
const HAIR_COLORS = [0x1b1410, 0x2e2018, 0x4a3520, 0x111111, 0x634b33, 0x191919];
const BOOT_COLORS = [0x14161c, 0x14161c, 0xf2f2f2, 0xff4d2e, 0x2ec4b6, 0xffd24d];

const HIPS_Y = 0.95;

function makeNumberTexture(n: number): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 64;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 64, 64);
  g.font = "900 44px ui-sans-serif, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 5;
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.strokeText(String(n), 32, 34);
  g.fillStyle = "#f5f5f5";
  g.fillText(String(n), 32, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function luminance(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export function createPlayerMesh(
  kitColor: string,
  shortsColor: string,
  seed: number,
  number: number,
  isGK = false,
): PlayerMesh {
  const group = new THREE.Group();
  const kit = new THREE.Color(kitColor);
  const shorts = new THREE.Color(shortsColor);
  const skin = new THREE.Color(SKIN_TONES[seed % SKIN_TONES.length]).multiplyScalar(1.12);
  const hair = new THREE.Color(HAIR_COLORS[(seed * 3 + 1) % HAIR_COLORS.length]);
  const kitDark = kit.clone().multiplyScalar(0.55);
  const kitPale = kit.clone().lerp(new THREE.Color(0xffffff), 0.55);
  const bootColor = BOOT_COLORS[seed % BOOT_COLORS.length];

  const kitMat = new THREE.MeshStandardMaterial({ color: kit, roughness: 0.65 });
  const trimMat = new THREE.MeshStandardMaterial({ color: kitPale, roughness: 0.65 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.72 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.55 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.95 });
  const sockMat = new THREE.MeshStandardMaterial({ color: kitDark, roughness: 0.8 });
  const bootMat = new THREE.MeshStandardMaterial({ color: bootColor, roughness: 0.35 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0xf5f06a, roughness: 0.5 });

  // --- articulaciones ---
  const J = {} as Record<JointName, THREE.Object3D>;
  const mkJoint = (name: JointName, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D => {
    const o = new THREE.Group();
    o.position.set(x, y, z);
    parent.add(o);
    J[name] = o;
    return o;
  };
  const mkMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, shadow = false): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  };

  // cadera (raíz del rig)
  const hips = mkJoint("hips", group, 0, HIPS_Y, 0);
  const pelvis = mkMesh(new THREE.CylinderGeometry(0.175, 0.19, 0.2, 14), shortsMat, hips, 0, 0.02, 0, true);
  pelvis.scale.z = 0.78;

  // columna/torso
  const spine = mkJoint("spine", hips, 0, 0.1, 0);
  const torso = mkMesh(new THREE.CylinderGeometry(0.2, 0.165, 0.46, 14), kitMat, spine, 0, 0.33, 0, true);
  torso.scale.z = 0.72;
  const chest = mkMesh(new THREE.CapsuleGeometry(0.14, 0.24, 4, 10), kitMat, spine, 0, 0.5, 0, true);
  chest.rotation.z = Math.PI / 2;
  chest.scale.z = 0.8;
  const collar = mkMesh(new THREE.TorusGeometry(0.085, 0.018, 6, 14), trimMat, spine, 0, 0.565, 0);
  collar.rotation.x = Math.PI / 2;
  collar.scale.z = 1.15;
  // dorsal
  const numMat = new THREE.MeshBasicMaterial({
    map: makeNumberTexture(number), transparent: true,
    color: luminance(kit) > 0.45 ? new THREE.Color(0x20242c) : new THREE.Color(0xffffff),
  });
  const numPlane = mkMesh(new THREE.PlaneGeometry(0.24, 0.24), numMat, spine, 0, 0.32, -0.165);
  numPlane.rotation.y = Math.PI;

  // cuello/cabeza
  const neck = mkJoint("neck", spine, 0, 0.6, 0);
  const head = mkMesh(new THREE.SphereGeometry(0.145, 18, 14), skinMat, neck, 0, 0.13, 0.01, true);
  head.scale.y = 1.1;
  const hairCap = mkMesh(new THREE.SphereGeometry(0.148, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat, neck, 0, 0.16, 0.005);

  // brazos
  const mkArm = (side: number) => {
    const sh = mkJoint(side < 0 ? "shL" : "shR", spine, side * 0.245, 0.52, 0);
    mkMesh(new THREE.CapsuleGeometry(0.058, 0.13, 3, 10), kitMat, sh, 0, -0.09, 0, true); // manga
    mkMesh(new THREE.CylinderGeometry(0.061, 0.058, 0.05, 10), trimMat, sh, 0, -0.175, 0); // puño
    const el = mkJoint(side < 0 ? "elL" : "elR", sh, 0, -0.24, 0);
    mkMesh(new THREE.CapsuleGeometry(0.048, 0.18, 3, 10), skinMat, el, 0, -0.12, 0, true); // antebrazo
    mkMesh(new THREE.SphereGeometry(0.052, 10, 8), isGK ? gloveMat : skinMat, el, 0, -0.26, 0); // mano/guante
    sh.rotation.z = side * -0.12;
    return sh;
  };
  mkArm(-1);
  mkArm(1);

  // piernas
  const mkLeg = (side: number) => {
    const hip = mkJoint(side < 0 ? "hipL" : "hipR", hips, side * 0.105, -0.04, 0);
    mkMesh(new THREE.CapsuleGeometry(0.088, 0.22, 3, 10), shortsMat, hip, 0, -0.19, 0, true); // muslo
    const knee = mkJoint(side < 0 ? "kneeL" : "kneeR", hip, 0, -0.42, 0);
    mkMesh(new THREE.CapsuleGeometry(0.062, 0.26, 3, 10), sockMat, knee, 0, -0.18, 0, true); // media
    mkMesh(new THREE.CylinderGeometry(0.068, 0.068, 0.07, 10), trimMat, knee, 0, -0.055, 0); // franja
    const ank = mkJoint(side < 0 ? "ankL" : "ankR", knee, 0, -0.4, 0);
    const boot = mkMesh(new THREE.BoxGeometry(0.105, 0.075, 0.23), bootMat, ank, 0, -0.045, 0.05, true);
    boot.rotation.x = 0.02;
    return hip;
  };
  mkLeg(-1);
  mkLeg(1);

  // anillo de selección
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.56, 26),
    new THREE.MeshBasicMaterial({ color: 0x2ec4b6, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  group.add(ring);

  // variación sutil de estatura por jugador
  const hScale = 0.965 + ((seed * 7) % 5) * 0.014;
  group.scale.setScalar(hScale);

  // --- estado de animación ---
  const pose = {} as Pose;
  const clipPose = {} as Pose;
  for (const jn of JOINTS) { pose[jn] = [0, 0, 0]; clipPose[jn] = [0, 0, 0]; }
  let animT = (seed % 10) * 1.7;
  let clip: { b: BakedClip; t: number } | null = null;

  const startClip = (b: BakedClip) => { clip = { b, t: 0 }; };

  return {
    group,
    ring,
    setSelected: (v) => { ring.visible = v; },
    kick: () => startClip(BAKED_KICK),
    celebrate: () => startClip(BAKED_CELEBRATE),
    stumble: () => startClip(BAKED_STUMBLE),
    dive: (dir) => startClip(dir >= 0 ? BAKED_DIVE_R : BAKED_DIVE_L),
    clipInfo: () => (clip ? clip.t : -1),
    hipsInfo: () => [J.hips.rotation.z, J.hips.position.y],
    animate: (speed, dt, time) => {
      const rate = Math.min(1, speed / 6.8);
      animT += dt * (3.4 + speed * 1.55);

      // --- pose base: ciclo de carrera / reposo ---
      for (const jn of JOINTS) { pose[jn][0] = 0; pose[jn][1] = 0; pose[jn][2] = 0; }
      const phL = animT;
      const phR = animT + Math.PI;
      const thighAmp = 0.2 + 0.66 * rate;
      const kneeAmp = 0.18 + 0.95 * rate;
      pose.hipL[0] = -Math.sin(phL) * thighAmp;
      pose.hipR[0] = -Math.sin(phR) * thighAmp;
      pose.kneeL[0] = 0.06 + kneeAmp * Math.max(0, Math.sin(phL - 1.15));
      pose.kneeR[0] = 0.06 + kneeAmp * Math.max(0, Math.sin(phR - 1.15));
      pose.ankL[0] = -(pose.hipL[0] + pose.kneeL[0]) * 0.55;
      pose.ankR[0] = -(pose.hipR[0] + pose.kneeR[0]) * 0.55;

      const armAmp = 0.1 + 0.52 * rate;
      pose.shL[0] = Math.sin(phL) * armAmp;
      pose.shR[0] = Math.sin(phR) * armAmp;
      pose.shL[2] = -0.1;
      pose.shR[2] = 0.1;
      pose.elL[0] = -(0.3 + 0.55 * rate) + 0.25 * Math.min(0, Math.sin(phL));
      pose.elR[0] = -(0.3 + 0.55 * rate) + 0.25 * Math.min(0, Math.sin(phR));

      pose.spine[0] = 0.05 + 0.16 * rate;
      pose.spine[1] = 0.1 * rate * Math.sin(animT);
      pose.hips[1] = -0.07 * rate * Math.sin(animT);
      pose.neck[0] = -pose.spine[0] * 0.7;
      pose.neck[1] = -pose.spine[1] * 0.7;
      let hipsY = Math.abs(Math.sin(animT)) * 0.05 * rate;
      let hipsX = 0;

      if (rate < 0.06) {
        // reposo: respiración y postura; el portero adopta la posición de guardia
        const breathe = Math.sin(time * 1.5 + seed) * 0.018;
        pose.spine[0] = 0.04 + breathe;
        pose.shL[0] = 0.04 - breathe;
        pose.shR[0] = 0.04 - breathe;
        pose.elL[0] = -0.28;
        pose.elR[0] = -0.28;
        if (isGK) {
          pose.spine[0] = 0.16;
          pose.hipL[0] = -0.22;
          pose.hipR[0] = -0.22;
          pose.kneeL[0] = 0.42;
          pose.kneeR[0] = 0.42;
          pose.ankL[0] = -0.1;
          pose.ankR[0] = -0.1;
          pose.shL[0] = -0.6;
          pose.shR[0] = -0.6;
          pose.elL[0] = -0.5;
          pose.elR[0] = -0.5;
          hipsY = -0.05;
        }
      }

      // --- capa de clip (chut, celebración, estirada...) mezclada por peso ---
      if (clip) {
        clip.t += dt;
        if (clip.t >= clip.b.dur) {
          clip = null;
        } else {
          const w = Math.min(1, clip.t / 0.07, (clip.b.dur - clip.t) / 0.16);
          const [cx, cy] = sampleClip(clip.b, clip.t, clipPose);
          for (const jn of JOINTS) {
            pose[jn][0] = pose[jn][0] * (1 - w) + clipPose[jn][0] * w;
            pose[jn][1] = pose[jn][1] * (1 - w) + clipPose[jn][1] * w;
            pose[jn][2] = pose[jn][2] * (1 - w) + clipPose[jn][2] * w;
          }
          hipsY = hipsY * (1 - w) + cy * w;
          hipsX = cx * w;
        }
      }

      // --- escribe la pose en el rig ---
      for (const jn of JOINTS) {
        J[jn].rotation.set(pose[jn][0], pose[jn][1], pose[jn][2]);
      }
      J.hips.position.set(hipsX, HIPS_Y + hipsY, 0);
    },
  };
}

// ---------------------------------------------------------------------------
// Balón
// ---------------------------------------------------------------------------

export interface BallMesh {
  mesh: THREE.Mesh;
  spin: (vx: number, vz: number, dt: number) => void;
}

export function createBallMesh(): BallMesh {
  // balón tipo telstar: pentágonos negros sobre blanco con costuras, textura 256x128
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 128;
  const g = cv.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, "#dfe3e8");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#1c1c22";
  const pent = (x: number, y: number, r: number) => {
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  };
  for (let i = 0; i < 12; i++) {
    const x = 14 + i * 21, y = (i % 2) * 58 + 30;
    pent(x, y, 13);
  }
  // costuras entre paneles
  g.strokeStyle = "rgba(28,28,34,0.35)";
  g.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * 32, 0);
    g.quadraticCurveTo(i * 32 + 16, 64, i * 32, 128);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.SphereGeometry(0.24, 28, 20);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.32 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return {
    mesh,
    spin: (vx, vz, dt) => {
      mesh.rotation.x += vz * dt * 2.2;
      mesh.rotation.z -= vx * dt * 2.2;
    },
  };
}
