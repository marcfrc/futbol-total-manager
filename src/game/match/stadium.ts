/**
 * match/stadium.ts — Estadio nocturno procedural con acabado de retransmisión TV:
 * césped con bandas de siega y líneas reglamentarias (incl. arcos de penalti y córner),
 * porterías con red de malla texturizada, vallas LED con patrocinadores, banderines,
 * banquillos, gradas con público instanciado, tejadillos y torres de iluminación.
 */

import * as THREE from "three";
import { BOX_D, BOX_W, GOAL_DEPTH, GOAL_H, GOAL_W, PENALTY_D, PITCH_L, PITCH_W, SIX_D, SIX_W } from "./constants";

function makePitchTexture(): THREE.CanvasTexture {
  // 1400x2100 ≈ 20.6 px/metro: las líneas se ven nítidas incluso en primeros planos
  const W = 1400, H = 2100;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  // tablero de siega (checkerboard) como en los estadios top: cuadrantes de ~8 m
  const COLS = 10, ROWS = 14;
  const cw = W / COLS, ch = H / ROWS;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const even = (r + c) % 2 === 0;
      g.fillStyle = even ? "#2a8540" : "#1f7334";
      g.fillRect(c * cw, r * ch, cw + 1, ch + 1);
      // micro-franjas dentro de cada cuadrante (rodillo de la cortadora)
      g.fillStyle = even ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.022)";
      for (let s = 0; s < 5; s++) {
        g.fillRect(c * cw, r * ch + (ch / 5) * s, cw, ch / 10);
      }
    }
  }
  // parches irregulares de tono (desgaste natural del césped)
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const r = 60 + Math.random() * 220;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.5;
    gr.addColorStop(0, dark ? "rgba(8,50,20,0.10)" : "rgba(160,230,160,0.05)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // moteado fino de hierba
  for (let i = 0; i < 34000; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.028)" : "rgba(0,35,8,0.05)";
    g.fillRect(x, y, 2, 3);
  }
  // halo de luz en el centro (los focos alumbran más el centro)
  const rad = g.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 1350);
  rad.addColorStop(0, "rgba(255,255,235,0.07)");
  rad.addColorStop(0.6, "rgba(0,0,0,0)");
  rad.addColorStop(1, "rgba(0,8,16,0.20)");
  g.fillStyle = rad;
  g.fillRect(0, 0, W, H);

  // las líneas se dibujan retranqueadas para que coincidan EXACTAMENTE con las
  // dimensiones de juego: el plano mide PITCH+14 y la textura cubre todo el plano
  const M = 7; // margen en metros (el plano es 14 m más grande que el campo)
  const sx = W / (PITCH_W + M * 2), sz = H / (PITCH_L + M * 2);
  const px = (x: number) => (x + PITCH_W / 2 + M) * sx;
  const pz = (z: number) => (z + PITCH_L / 2 + M) * sz;
  g.strokeStyle = "rgba(255,255,255,0.94)";
  g.lineWidth = 0.12 * sx; // línea reglamentaria de 12 cm
  g.shadowColor = "rgba(255,255,255,0.35)";
  g.shadowBlur = 5;
  const line = (x1: number, z1: number, x2: number, z2: number) => {
    g.beginPath();
    g.moveTo(px(x1), pz(z1));
    g.lineTo(px(x2), pz(z2));
    g.stroke();
  };
  const rect = (w: number, d: number, zc: number) => {
    g.strokeRect(px(-w / 2), pz(zc - d / 2), w * sx, d * sz);
  };
  // perímetro (alineado con los límites reales de juego)
  g.strokeRect(px(-PITCH_W / 2), pz(-PITCH_L / 2), PITCH_W * sx, PITCH_L * sz);
  // medio campo y círculo central
  line(-PITCH_W / 2, 0, PITCH_W / 2, 0);
  g.beginPath();
  g.arc(W / 2, H / 2, 9.15 * sx, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H / 2, 6, 0, Math.PI * 2);
  g.fillStyle = "#fff";
  g.fill();
  // áreas con arco de penalti
  for (const end of [-1, 1]) {
    rect(BOX_W, BOX_D, end * (PITCH_L / 2 - BOX_D / 2));
    rect(SIX_W, SIX_D, end * (PITCH_L / 2 - SIX_D / 2));
    // punto de penalti
    g.beginPath();
    g.arc(W / 2, pz(end * (PITCH_L / 2 - PENALTY_D)), 6, 0, Math.PI * 2);
    g.fill();
    // arco del área
    const penY = pz(end * (PITCH_L / 2 - PENALTY_D));
    const r = 9.15 * sx;
    const edgeY = pz(end * (PITCH_L / 2 - BOX_D));
    const half = Math.acos(Math.min(1, Math.abs(penY - edgeY) / r));
    g.beginPath();
    if (end === -1) g.arc(W / 2, penY, r, half, Math.PI - half);
    else g.arc(W / 2, penY, r, Math.PI + half, Math.PI * 2 - half);
    g.stroke();
  }
  // arcos de córner (radio reglamentario ~1 m)
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
    g.beginPath();
    g.arc(px(cx * (PITCH_W / 2)), pz(cz * (PITCH_L / 2)), 0.92 * sx, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Textura sutil para el run-off alrededor del césped. */
function makeOuterTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 256;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#17491f";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.06)";
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 9);
  return tex;
}

/** Textura de malla para la red de la portería. */
function makeNetTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 64;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = "rgba(235,240,248,0.9)";
  g.lineWidth = 1.6;
  // rombos
  for (let i = -8; i < 8; i++) {
    g.beginPath(); g.moveTo(i * 8, 0); g.lineTo(i * 8 + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(i * 8 + 64, 0); g.lineTo(i * 8, 64); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 2.2);
  return tex;
}

/** Valla LED con patrocinadores del juego (texto luminoso). */
function makeBoardTexture(labels: string[], bg: string, fg: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 1024; cv.height = 64;
  const g = cv.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 64);
  g.font = "900 40px ui-sans-serif, system-ui, sans-serif";
  g.textBaseline = "middle";
  g.fillStyle = fg;
  let x = 26;
  for (const label of labels) {
    g.fillText(label, x, 34);
    x += g.measureText(label).width + 90;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function makeGoal(netTex: THREE.CanvasTexture): THREE.Group {
  const grp = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.35 });
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, GOAL_H, 10);
  const left = new THREE.Mesh(postGeo, postMat);
  left.position.set(-GOAL_W / 2, GOAL_H / 2, 0);
  left.castShadow = true;
  const right = left.clone();
  right.position.x = GOAL_W / 2;
  const barGeo = new THREE.CylinderGeometry(0.06, 0.06, GOAL_W + 0.12, 10);
  const bar = new THREE.Mesh(barGeo, postMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = GOAL_H;
  grp.add(left, right, bar);

  // red con malla dibujada
  const netMat = new THREE.MeshStandardMaterial({
    map: netTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    roughness: 1, depthWrite: false,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, GOAL_H), netMat);
  back.position.set(0, GOAL_H / 2, -GOAL_DEPTH);
  grp.add(back);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, GOAL_DEPTH), netMat);
  top.rotation.x = Math.PI / 2;
  top.position.set(0, GOAL_H, -GOAL_DEPTH / 2);
  grp.add(top);
  for (const side of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_H), netMat);
    s.rotation.y = Math.PI / 2;
    s.position.set((side * GOAL_W) / 2, GOAL_H / 2, -GOAL_DEPTH / 2);
    grp.add(s);
  }
  const backPostGeo = new THREE.CylinderGeometry(0.04, 0.04, Math.hypot(GOAL_H, GOAL_DEPTH), 8);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(backPostGeo, postMat);
    p.position.set((side * GOAL_W) / 2, GOAL_H / 2, -GOAL_DEPTH / 2);
    p.rotation.x = Math.atan2(GOAL_DEPTH, GOAL_H);
    grp.add(p);
  }
  return grp;
}

export interface StadiumBuild {
  group: THREE.Group;
  /** Animación ambiente: ola del público y scroll de las vallas LED. */
  update: (dt: number, time: number) => void;
  /** Celebración: el público salta durante unos segundos. */
  crowdCelebrate: () => void;
  dispose: () => void;
}

const SPONSORS = ["FÚTBOL TOTAL MANAGER", "★ KIMI SPORTS", "LIGA ÉLITE", "⚽ GOL TV", "VAMOOOS ENERGY"];

export function buildStadium(homeColor: string, awayColor: string): StadiumBuild {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(r: T): T => { disposables.push(r); return r; };

  // césped
  const pitchTex = track(makePitchTexture());
  const pitchMat = track(new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95 }));
  const pitch = new THREE.Mesh(track(new THREE.PlaneGeometry(PITCH_W + 14, PITCH_L + 14)), pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);

  // anillo exterior (run-off verde oscuro como en los estadios reales)
  const outerMat = track(new THREE.MeshStandardMaterial({ map: track(makeOuterTexture()), roughness: 1 }));
  const outer = new THREE.Mesh(track(new THREE.PlaneGeometry(PITCH_W + 60, PITCH_L + 70)), outerMat);
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  group.add(outer);

  // porterías
  const netTex = track(makeNetTexture());
  const goalA = makeGoal(netTex);
  goalA.position.set(0, 0, -PITCH_L / 2);
  group.add(goalA);
  const goalB = makeGoal(netTex);
  goalB.position.set(0, 0, PITCH_L / 2);
  goalB.rotation.y = Math.PI;
  group.add(goalB);

  // banderines de córner
  const flagPoleMat = track(new THREE.MeshStandardMaterial({ color: 0xf5d020, roughness: 0.5 }));
  const flagMat = track(new THREE.MeshStandardMaterial({ color: 0xe33d2e, side: THREE.DoubleSide }));
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6)), flagPoleMat);
    pole.position.set(cx * (PITCH_W / 2), 0.75, cz * (PITCH_L / 2));
    group.add(pole);
    const flag = new THREE.Mesh(track(new THREE.PlaneGeometry(0.42, 0.28)), flagMat);
    flag.position.set(cx * (PITCH_W / 2) + 0.2, 1.36, cz * (PITCH_L / 2));
    group.add(flag);
  }

  // gradas escalonadas (se ven los peldaños entre el público)
  const stepMat = track(new THREE.MeshStandardMaterial({ color: 0x43546c, roughness: 0.85 }));
  const stepTopMat = track(new THREE.MeshStandardMaterial({ color: 0x566a86, roughness: 0.8 }));
  const mkSteps = (len: number, side: 0 | 1 | 2 | 3) => {
    for (let r = 0; r < rows; r++) {
      const dist = 9.4 + r * 1.35;
      const y = 1.55 + r * 1.15;
      const step = new THREE.Mesh(track(new THREE.BoxGeometry(len, 0.5, 1.5)), r % 2 ? stepMat : stepTopMat);
      if (side === 0) step.position.set(0, y, -PITCH_L / 2 - dist);
      else if (side === 1) step.position.set(0, y, PITCH_L / 2 + dist);
      else if (side === 2) { step.rotation.y = Math.PI / 2; step.position.set(-PITCH_W / 2 - dist, y, 0); }
      else { step.rotation.y = Math.PI / 2; step.position.set(PITCH_W / 2 + dist, y, 0); }
      group.add(step);
    }
  };
  const rows = 7;
  const perRow = 96;
  mkSteps(PITCH_W + 22, 0); mkSteps(PITCH_W + 22, 1);
  mkSteps(PITCH_L + 22, 2); mkSteps(PITCH_L + 22, 3);

  // público instanciado: figuras con torso brillante y cabeza (dos cajas por persona)
  const crowdColors = [
    new THREE.Color(homeColor), new THREE.Color(awayColor),
    new THREE.Color(0xe8e4da), new THREE.Color(0xc8ccd4), new THREE.Color(0x8894a6),
    new THREE.Color(0xf0c040), new THREE.Color(0xd05050), new THREE.Color(0x5080c8),
  ];
  const personGeo = track(new THREE.BoxGeometry(0.52, 0.95, 0.5));
  const headGeo = track(new THREE.BoxGeometry(0.3, 0.28, 0.3));
  const personMat = track(new THREE.MeshStandardMaterial({ roughness: 0.85, emissive: 0x232936, emissiveIntensity: 1.0 }));
  const skinMat = track(new THREE.MeshStandardMaterial({ color: 0xd8ab84, roughness: 0.9 }));
  const crowd = new THREE.InstancedMesh(personGeo, personMat, rows * perRow * 4);
  const heads = new THREE.InstancedMesh(headGeo, skinMat, rows * perRow * 4);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let idx = 0;
  const rand = mulberryLite(12345);
  // datos por aficionado para animar la "ola" y los saltos de celebración
  const MAXF = rows * perRow * 4;
  const fanX = new Float32Array(MAXF);
  const fanY = new Float32Array(MAXF);
  const fanZ = new Float32Array(MAXF);
  const fanSeed = new Float32Array(MAXF);
  for (let side = 0; side < 4; side++) {
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < perRow; i++) {
        const t = i / perRow - 0.5;
        const dist = 10 + r * 1.35;
        const y = 2.35 + r * 1.15;
        let x = 0, z = 0;
        if (side === 0) { x = t * (PITCH_W + 20); z = -PITCH_L / 2 - dist; }
        else if (side === 1) { x = t * (PITCH_W + 20); z = PITCH_L / 2 + dist; }
        else if (side === 2) { z = t * (PITCH_L + 20); x = -PITCH_W / 2 - dist; }
        else { z = t * (PITCH_L + 20); x = PITCH_W / 2 + dist; }
        const jx = x + (rand() - 0.5) * 0.4, jy = y + (rand() - 0.5) * 0.2, jz = z + (rand() - 0.5) * 0.4;
        fanX[idx] = jx; fanY[idx] = jy; fanZ[idx] = jz; fanSeed[idx] = rand() * 10;
        m.makeTranslation(jx, jy, jz);
        crowd.setMatrixAt(idx, m);
        m.makeTranslation(jx, jy + 0.62, jz);
        heads.setMatrixAt(idx, m);
        const pick = rand();
        // la grada es del equipo local: dominan sus colores como en un campo real
        const col = pick < 0.55 ? crowdColors[0] : pick < 0.64 ? crowdColors[1] : crowdColors[2 + ((rand() * 6) | 0)];
        c.copy(col).multiplyScalar(1.0 + rand() * 0.55);
        crowd.setColorAt(idx, c);
        idx++;
      }
    }
  }
  const fanCount = idx;
  crowd.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  group.add(crowd, heads);

  // estructura de grada: muro trasero + tejadillo flotante sobre el público
  // (el público queda FUERA de la estructura, como en un estadio real)
  const standMat = track(new THREE.MeshStandardMaterial({ color: 0x3a4a5f, roughness: 0.85 }));
  const roofMat = track(new THREE.MeshStandardMaterial({ color: 0x45566a, roughness: 0.65, metalness: 0.35 }));
  const mkStand = (len: number, side: 0 | 1 | 2 | 3) => {
    const wall = new THREE.Mesh(track(new THREE.BoxGeometry(len, 13, 2)), standMat);
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(len + 2, 0.7, 21)), roofMat);
    const x = side === 2 ? -1 : 1;
    if (side === 0) { wall.position.set(0, 6, -PITCH_L / 2 - 20.5); roof.position.set(0, 13.4, -PITCH_L / 2 - 10.5); }
    else if (side === 1) { wall.position.set(0, 6, PITCH_L / 2 + 20.5); roof.position.set(0, 13.4, PITCH_L / 2 + 10.5); }
    else {
      wall.rotation.y = Math.PI / 2; roof.rotation.y = Math.PI / 2;
      wall.position.set(x * (PITCH_W / 2 + 20.5), 6, 0);
      roof.position.set(x * (PITCH_W / 2 + 10.5), 13.4, 0);
    }
    group.add(wall, roof);
  };
  mkStand(PITCH_W + 30, 0); mkStand(PITCH_W + 30, 1);
  mkStand(PITCH_L + 30, 2); mkStand(PITCH_L + 30, 3);

  // torres de iluminación
  const towerMat = track(new THREE.MeshStandardMaterial({ color: 0x2a313c, roughness: 0.7, metalness: 0.4 }));
  const headMat = track(new THREE.MeshBasicMaterial({ color: 0xfffbe8 }));
  // halo luminoso alrededor del cabezal (sprite radial, sin geometría que artefacte)
  const glowCv = document.createElement("canvas");
  glowCv.width = 128; glowCv.height = 128;
  {
    const gg = glowCv.getContext("2d")!;
    const rg = gg.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, "rgba(255,250,225,0.85)");
    rg.addColorStop(0.35, "rgba(255,244,200,0.22)");
    rg.addColorStop(1, "rgba(255,244,200,0)");
    gg.fillStyle = rg;
    gg.fillRect(0, 0, 128, 128);
  }
  const glowTex = track(new THREE.CanvasTexture(glowCv));
  const glowMat = track(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
  for (const [tx, tz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = tx * (PITCH_W / 2 + 20), z = tz * (PITCH_L / 2 + 22);
    const tower = new THREE.Mesh(track(new THREE.CylinderGeometry(0.5, 0.8, 26, 8)), towerMat);
    tower.position.set(x, 13, z);
    group.add(tower);
    const head = new THREE.Mesh(track(new THREE.BoxGeometry(4.4, 1.6, 1)), headMat);
    head.position.set(x * 0.96, 26.4, z * 0.96);
    head.lookAt(0, 0, 0);
    group.add(head);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(14, 14, 1);
    glow.position.set(x * 0.96, 26.4, z * 0.96);
    group.add(glow);
  }

  // vallas LED con patrocinadores (emisoras, se leen desde la cámara)
  const boardTexA = track(makeBoardTexture(SPONSORS.slice(0, 3), "#0e5a8a", "#eaf7ff"));
  const boardTexB = track(makeBoardTexture(SPONSORS.slice(2), "#8a1240", "#ffeef4"));
  const boardLen = PITCH_W + 10;
  for (const side of [-1, 1]) {
    const tex = side === -1 ? boardTexA : boardTexB;
    const mat = track(new THREE.MeshBasicMaterial({ map: tex }));
    const board = new THREE.Mesh(track(new THREE.BoxGeometry(boardLen, 1.15, 0.18)), mat);
    board.position.set(0, 0.58, side * (PITCH_L / 2 + 4.5));
    group.add(board);
  }
  // laterales
  const boardTexC = track(makeBoardTexture(SPONSORS, "#0a7a5c", "#eafff8"));
  const sideLen = PITCH_L + 10;
  for (const side of [-1, 1]) {
    const mat = track(new THREE.MeshBasicMaterial({ map: boardTexC }));
    const board = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 1.15, sideLen)), mat);
    board.position.set(side * (PITCH_W / 2 + 4.5), 0.58, 0);
    group.add(board);
  }

  // banquillos en la banda, a la altura del medio campo (fuera de las vallas LED)
  const dugMat = track(new THREE.MeshStandardMaterial({ color: 0x22303f, roughness: 0.8 }));
  const dugRoofMat = track(new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.4, metalness: 0.3 }));
  for (const dz of [-8, 8]) {
    const bench = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 1.1, 5.5)), dugMat);
    bench.position.set(PITCH_W / 2 + 6.5, 0.55, dz);
    group.add(bench);
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(2, 0.15, 5.8)), dugRoofMat);
    roof.position.set(PITCH_W / 2 + 6.3, 2.3, dz);
    group.add(roof);
    for (const sz2 of [-2.4, 2.4]) {
      const leg = new THREE.Mesh(track(new THREE.BoxGeometry(0.12, 1.8, 0.12)), dugMat);
      leg.position.set(PITCH_W / 2 + 6.5, 1.4, dz + sz2);
      group.add(leg);
    }
  }

  // ---------- animación ambiente ----------
  let celebrateT = 0;
  let waveClock = 0;
  let crowdFrame = 0;

  function updateCrowd(time: number): void {
    // ola continua recorriendo las gradas + saltos durante las celebraciones
    const front = (time * 1.15) % (Math.PI * 2);
    for (let i = 0; i < fanCount; i++) {
      const ang = Math.atan2(fanZ[i], fanX[i]);
      let d = ang - front;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      // cresta gaussiana de la ola (solo cuando pasa por ese sector)
      let lift = Math.exp(-(d * d) / 0.06) * 0.85;
      if (celebrateT > 0) {
        lift += Math.max(0, Math.sin(time * 9 + fanSeed[i] * 7)) * 0.55;
      }
      const sway = Math.sin(time * 1.7 + fanSeed[i] * 3.1) * 0.045;
      const y = fanY[i] + lift + sway;
      m.makeTranslation(fanX[i], y, fanZ[i]);
      crowd.setMatrixAt(i, m);
      m.makeTranslation(fanX[i], y + 0.62, fanZ[i]);
      heads.setMatrixAt(i, m);
    }
    crowd.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    update: (dt, time) => {
      // scroll de las vallas LED (como la publicidad rotativa real)
      boardTexA.offset.x = (time * 0.018) % 1;
      boardTexB.offset.x = (time * 0.024) % 1;
      boardTexC.offset.x = (time * 0.02) % 1;
      celebrateT = Math.max(0, celebrateT - dt);
      // el público se actualiza a ~30 Hz repartido en 2 frames para no ahogar el móvil
      waveClock += dt;
      crowdFrame++;
      if (waveClock >= 1 / 30 && crowdFrame % 2 === 0) updateCrowd(time);
    },
    crowdCelebrate: () => { celebrateT = 5; },
    dispose: () => { for (const d of disposables) d.dispose(); },
  };
}

function mulberryLite(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
