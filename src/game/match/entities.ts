/**
 * match/entities.ts — Futbolistas low-poly con equipación completa: camiseta con mangas,
 * dorsal trasero, pantalón, medias, botas y pelo. Pivotes articulados para la zancada.
 */

import * as THREE from "three";

export interface PlayerMesh {
  group: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  body: THREE.Mesh;
  ring: THREE.Mesh;
  setSelected: (v: boolean) => void;
  animate: (speed: number, dt: number, time: number) => void;
}

const SKIN_TONES = [0xf1c9a5, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e];
const HAIR_COLORS = [0x1b1410, 0x2e2018, 0x4a3520, 0x111111, 0x634b33, 0x191919];

/** Textura con el dorsal para la espalda (una por jugador, canvas pequeño). */
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

/** Contrasta el color de la camiseta para que el dorsal se lea (número blanco sobre fondo claro → borde oscuro). */
function luminance(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export function createPlayerMesh(kitColor: string, shortsColor: string, seed: number, number: number): PlayerMesh {
  const group = new THREE.Group();
  const kit = new THREE.Color(kitColor);
  const shorts = new THREE.Color(shortsColor);
  const skin = new THREE.Color(SKIN_TONES[seed % SKIN_TONES.length]).multiplyScalar(1.12);
  const hair = new THREE.Color(HAIR_COLORS[(seed * 3 + 1) % HAIR_COLORS.length]);
  const kitDark = kit.clone().multiplyScalar(0.55);
  const kitPale = kit.clone().lerp(new THREE.Color(0xffffff), 0.55);
  // botas: negras, blancas o de color llamativo según el jugador
  const BOOT_COLORS = [0x14161c, 0x14161c, 0xf2f2f2, 0xff4d2e, 0x2ec4b6, 0xffd24d];
  const bootColor = BOOT_COLORS[seed % BOOT_COLORS.length];

  const kitMat = new THREE.MeshStandardMaterial({ color: kit, roughness: 0.7 });
  const trimMat = new THREE.MeshStandardMaterial({ color: kitPale, roughness: 0.7 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.75 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.95 });
  const sockMat = new THREE.MeshStandardMaterial({ color: kitDark, roughness: 0.8 });
  const bootMat = new THREE.MeshStandardMaterial({ color: bootColor, roughness: 0.4 });

  // torso: camiseta ligeramente trapezoidal
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.5, 14), kitMat);
  body.position.y = 1.15;
  body.scale.z = 0.72; // más ancho que profundo
  body.castShadow = true;
  group.add(body);

  // hombros
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.24, 4, 10), kitMat);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = 1.4;
  shoulders.scale.z = 0.8;
  shoulders.castShadow = true;
  group.add(shoulders);

  // cuello de la camiseta (ribete claro)
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 6, 14), trimMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.435;
  collar.scale.z = 1.15;
  group.add(collar);

  // dorsal en la espalda
  const numTex = makeNumberTexture(number);
  const numMat = new THREE.MeshBasicMaterial({
    map: numTex, transparent: true,
    color: luminance(kit) > 0.45 ? new THREE.Color(0x20242c) : new THREE.Color(0xffffff),
  });
  const numPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), numMat);
  numPlane.position.set(0, 1.2, -0.165);
  numPlane.rotation.y = Math.PI;
  group.add(numPlane);

  // cabeza + pelo
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 14), skinMat);
  head.position.y = 1.66;
  head.scale.y = 1.08;
  head.castShadow = true;
  group.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.158, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hairCap.position.y = 1.69;
  group.add(hairCap);

  // pantalón (cadera)
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.185, 0.22, 14), shortsMat);
  hips.position.y = 0.85;
  hips.scale.z = 0.78;
  hips.castShadow = true;
  group.add(hips);

  // piernas: pivote en cadera → muslo (pantalón) → media con franja → bota
  const mkLeg = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.11, 0.86, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.26, 3, 10), shortsMat);
    thigh.position.y = -0.18;
    thigh.castShadow = true;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 3, 10), sockMat);
    shin.position.y = -0.52;
    shin.castShadow = true;
    // franja alta de la media (color claro de la equipación)
    const sockBand = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.07, 10), trimMat);
    sockBand.position.y = -0.37;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.22), bootMat);
    boot.position.set(0, -0.8, 0.045);
    boot.castShadow = true;
    pivot.add(thigh, shin, sockBand, boot);
    group.add(pivot);
    return pivot;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // brazos: pivote en hombro → manga con puño → antebrazo (piel)
  const mkArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.27, 1.38, 0);
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.14, 3, 10), kitMat);
    sleeve.position.y = -0.1;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.063, 0.06, 0.05, 10), trimMat);
    cuff.position.y = -0.19;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.26, 3, 10), skinMat);
    fore.position.y = -0.33;
    fore.castShadow = true;
    pivot.add(sleeve, cuff, fore);
    pivot.rotation.z = side * -0.12;
    group.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // anillo de selección
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.56, 26),
    new THREE.MeshBasicMaterial({ color: 0x2ec4b6, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  group.add(ring);

  let animT = (seed % 10) * 1.7;
  return {
    group, legL, legR, armL, armR, body, ring,
    setSelected: (v) => { ring.visible = v; },
    animate: (speed, dt) => {
      const rate = Math.min(1, speed / 6.5);
      animT += dt * (4.5 + speed * 1.7);
      const swing = Math.sin(animT) * 0.85 * rate;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.9;
      armR.rotation.x = swing * 0.9;
      body.rotation.x = rate * 0.14;
      const bob = Math.abs(Math.sin(animT)) * 0.055 * rate;
      body.position.y = 1.15 + bob;
      shoulders.position.y = 1.4 + bob;
      head.position.y = 1.66 + bob;
      hairCap.position.y = 1.69 + bob;
      hips.position.y = 0.85 + bob * 0.6;
      numPlane.position.y = 1.2 + bob;
      // respiración en reposo
      if (rate < 0.05) {
        body.scale.x = 1 + Math.sin(animT * 0.35) * 0.02;
      } else {
        body.scale.x = 1;
      }
    },
  };
}

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
