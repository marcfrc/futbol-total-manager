/**
 * match/engine.ts — Motor del partido 3D: escena, física del balón, reglas,
 * posesión, cámara retransmitida, efectos y bucle de juego.
 */

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GameLoop } from "../engine";
import {
  BALL_BOUNCE, BALL_FRICTION, BALL_GRAVITY, BALL_R, GOAL_H, GOAL_W, HALF_SECONDS,
  MATCH_MINUTES, PITCH_L, PITCH_W, PLAYER_R, RUN_SPEED, SECONDS_PER_MINUTE, SPRINT_MULT,
} from "./constants";
import { buildStadium } from "./stadium";
import { createBallMesh, createPlayerMesh, type BallMesh } from "./entities";
import { teamAnchors, updateAI, shortName } from "./ai";
import { MatchAudio } from "./audio";
import { mulberry32 } from "../career/names";
import type { MatchCallbacks, MatchOutcome, MatchSetup, Phase, RTBall, RTPlayer, MatchCtx } from "./rt";

declare global {
  interface Window {
    __FTM_MATCH_DEBUG__?: { forceGoal: () => void; skipToMinute: (m: number) => void; zoom: (f: number) => void; anim: (name: string) => void; animInfo: () => number; animPose: () => [number, number]; perf: () => { calls: number; triangles: number }; phase: () => string };
  }
}

export interface MatchEngine {
  /** API para la UI táctil / teclado externo */
  setMove(x: number, z: number): void;
  setSprint(v: boolean): void;
  pressPass(): void;
  pressLob(): void;
  pressTackle(): void;
  pressSwitch(): void;
  chargeStart(): void;
  chargeRelease(): void;
  pause(): void;
  resume(): void;
  toggleMute(): boolean;
  simulateRest(): void;
  abandon(): void;
  dispose(): void;
  audio: MatchAudio;
}

export function startMatch(canvas: HTMLCanvasElement, setup: MatchSetup, cb: MatchCallbacks): MatchEngine {
  const rng = mulberry32(setup.seed);
  const audio = new MatchAudio();

  // ---------- escena ----------
  const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: true });
  // calidad adaptativa: a tope en GPU real (móvil flagship), mínima en render
  // por software (CI/verificación). Además baja de forma dinámica si los fps caen.
  let softGL = false;
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const rn = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    softGL = /swiftshader|llvmpipe|software|angle \(google/i.test(rn);
  } catch { /* sin info: asumimos GPU real */ }
  const quality = {
    pr: softGL ? 1 : Math.min(window.devicePixelRatio, 2.0),
    samples: softGL ? 0 : 4,
    hdr: !softGL,
  };
  renderer.setPixelRatio(quality.pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = !softGL;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1020);
  scene.fog = new THREE.Fog(0x0a1020, 160, 340);

  // cielo nocturno: degradado con resplandor de horizonte y estrellas (textura canvas en domo)
  {
    const cv = document.createElement("canvas");
    cv.width = 1024; cv.height = 512;
    const g = cv.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#0a1322");
    grad.addColorStop(0.5, "#0f1d33");
    grad.addColorStop(0.8, "#16293f");
    grad.addColorStop(1, "#1d3a52");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 512);
    // estrellas puntuales (solo en la mitad superior del cielo)
    for (let i = 0; i < 520; i++) {
      const y = Math.random() * 300;
      const s = Math.random();
      const size = s < 0.05 ? 2 : 1;
      const alpha = 0.3 + Math.random() * 0.7;
      g.fillStyle = `rgba(235,242,255,${alpha})`;
      g.fillRect(Math.random() * 1024, y, size, size);
    }
    // resplandor urbano sobre el horizonte
    const glow = g.createLinearGradient(0, 340, 0, 480);
    glow.addColorStop(0, "rgba(255,190,120,0)");
    glow.addColorStop(0.8, "rgba(255,190,120,0.13)");
    glow.addColorStop(1, "rgba(255,210,150,0.06)");
    g.fillStyle = glow;
    g.fillRect(0, 360, 1024, 110);
    const skyTex = new THREE.CanvasTexture(cv);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(280, 32, 18),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    );
    scene.add(sky);
  }

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 400);

  // ---------- postprocesado: bloom suave estilo retransmisión ----------
  // (focos, vallas LED y césped iluminado "giran" alrededor de las luces como en TV)
  // Render target HDR con MSAA x4: bordes limpios y bloom sin bandas.
  const hdrTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    samples: quality.samples, type: quality.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
  });
  const composer = new EffectComposer(renderer, hdrTarget);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.55, 0.86,
  );
  bloomPass.enabled = quality.hdr; // sin bloom en render por software (CI)
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const amb = new THREE.AmbientLight(0xbdd3ff, 0.3);
  scene.add(amb);
  const hemi = new THREE.HemisphereLight(0x9db8ff, 0x2a5426, 0.65);
  scene.add(hemi);
  const flood = new THREE.DirectionalLight(0xfff4dc, 2.6);
  flood.position.set(28, 55, 18);
  flood.castShadow = true;
  flood.shadow.mapSize.set(2048, 2048);
  flood.shadow.camera.left = -70; flood.shadow.camera.right = 70;
  flood.shadow.camera.top = 70; flood.shadow.camera.bottom = -70;
  flood.shadow.camera.far = 140;
  flood.shadow.bias = -0.0005;
  scene.add(flood);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.55);
  fill.position.set(-30, 42, -24);
  scene.add(fill);

  const stadium = buildStadium(setup.home.color1, setup.away.color1);
  scene.add(stadium.group);

  // ---------- equipos ----------
  const userTeam: 0 | 1 = setup.userSide === "home" ? 0 : 1;
  const attackDir: [number, number] = [1, -1]; // home ataca +z, away -z
  const players: RTPlayer[] = [];

  // evita equipaciones que se camuflan con el césped
  function pickShirt(primary: string, secondary: string): string {
    const grass = new THREE.Color(0x35984a);
    const d = (hex: string) => {
      const c = new THREE.Color(hex);
      return Math.hypot(c.r - grass.r, c.g - grass.g, c.b - grass.b);
    };
    if (d(primary) > 0.38) return primary;
    if (d(secondary) > 0.38) return secondary;
    return "#f2f2f2";
  }

  // el portero viste distinto: primer color candidato que contraste con ambas camisetas
  function pickGKShirt(shirtA: string, shirtB: string): string {
    const candidates = ["#ffd54f", "#26a69a", "#9e9e9e", "#f5f5f5", "#ff7043"];
    const cols = [new THREE.Color(shirtA), new THREE.Color(shirtB)];
    for (const hex of candidates) {
      const c = new THREE.Color(hex);
      if (cols.every((o) => Math.hypot(c.r - o.r, c.g - o.g, c.b - o.b) > 0.55)) return hex;
    }
    return "#78909c";
  }

  const gkShirts: [string, string] = (() => {
    const homeShirt = pickShirt(setup.home.color1, setup.home.color2);
    const awayShirt = pickShirt(setup.away.color1, setup.away.color2);
    return [pickGKShirt(homeShirt, awayShirt), pickGKShirt(awayShirt, homeShirt)];
  })();

  const mkTeam = (side: "home" | "away", team: 0 | 1) => {
    const s = setup[side];
    const shirt = pickShirt(s.color1, s.color2);
    const anchors = teamAnchors(s.formation, attackDir[team]);
    s.xi.forEach((lite, i) => {
      const isGK = lite.pos === "GK";
      const mesh = createPlayerMesh(isGK ? gkShirts[team] : shirt, isGK ? "#20242c" : s.color2, i * 7 + team * 3, i + 1, isGK);
      const p: RTPlayer = {
        lite, team, slotIdx: i,
        isGK,
        pos: lite.pos,
        anchors,
        mesh,
        x: anchors[i].x, z: anchors[i].z,
        vx: 0, vz: 0,
        faceX: 0, faceZ: attackDir[team],
        topSpeed: RUN_SPEED * (0.86 + lite.pac / 420),
        stamina: 100,
        tackleCd: 0, stagger: 0, lungeT: 0, decideT: rng() * 0.4,
        controlled: false,
        tx: anchors[i].x, tz: anchors[i].z,
        wantSpeed: 0,
        injured: false,
      };
      mesh.group.position.set(p.x, 0, p.z);
      scene.add(mesh.group);
      players.push(p);
    });
  };
  mkTeam("home", 0);
  mkTeam("away", 1);

  // ---------- balón ----------
  const ballMesh: BallMesh = createBallMesh();
  scene.add(ballMesh.mesh);
  const ball: RTBall = { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: 0, receiver: null, noPickupT: 0 };

  // ---------- confetti (pool instanciado) ----------
  const CONFETTI_N = 260;
  const confettiGeo = new THREE.PlaneGeometry(0.16, 0.1);
  const confettiMat = new THREE.MeshBasicMaterial({ vertexColors: false, side: THREE.DoubleSide });
  const confetti = new THREE.InstancedMesh(confettiGeo, confettiMat, CONFETTI_N);
  confetti.visible = false;
  confetti.frustumCulled = false;
  scene.add(confetti);
  const confettiData = new Float32Array(CONFETTI_N * 8); // x,y,z,vx,vy,vz,life,seed
  const confettiColors = [new THREE.Color(setup.userSide === "home" ? setup.home.color1 : setup.away.color1), new THREE.Color(0xffffff), new THREE.Color(0x2ec4b6), new THREE.Color(0xffd24d)];
  const cMat4 = new THREE.Matrix4();
  const cEuler = new THREE.Euler();
  const cVec = new THREE.Vector3();
  const cColor = new THREE.Color();
  function burstConfetti(x: number, z: number): void {
    confetti.visible = true;
    for (let i = 0; i < CONFETTI_N; i++) {
      const o = i * 8;
      confettiData[o] = x + (rng() - 0.5) * 6;
      confettiData[o + 1] = 1 + rng() * 4;
      confettiData[o + 2] = z + (rng() - 0.5) * 6;
      const a = rng() * Math.PI * 2;
      const sp = 2 + rng() * 7;
      confettiData[o + 3] = Math.cos(a) * sp;
      confettiData[o + 4] = 4 + rng() * 6;
      confettiData[o + 5] = Math.sin(a) * sp;
      confettiData[o + 6] = 2 + rng() * 1.5;
      confettiData[o + 7] = rng() * 10;
      cColor.copy(confettiColors[(rng() * confettiColors.length) | 0]);
      confetti.setColorAt(i, cColor);
    }
    if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
  }
  function updateConfetti(dt: number): void {
    if (!confetti.visible) return;
    let alive = 0;
    for (let i = 0; i < CONFETTI_N; i++) {
      const o = i * 8;
      if (confettiData[o + 6] <= 0) { cMat4.makeScale(0, 0, 0); confetti.setMatrixAt(i, cMat4); continue; }
      alive++;
      confettiData[o + 6] -= dt;
      confettiData[o + 4] -= 9.8 * dt;
      confettiData[o] += confettiData[o + 3] * dt;
      confettiData[o + 1] += confettiData[o + 4] * dt;
      confettiData[o + 2] += confettiData[o + 5] * dt;
      if (confettiData[o + 1] < 0.05) { confettiData[o + 1] = 0.05; confettiData[o + 4] *= -0.3; }
      const s = Math.min(1, confettiData[o + 6]);
      cEuler.set(confettiData[o + 7] + performance.now() / 300, confettiData[o + 7] * 2, 0);
      cMat4.makeRotationFromEuler(cEuler);
      cVec.set(s, s, s);
      cMat4.scale(cVec);
      cMat4.setPosition(confettiData[o], confettiData[o + 1], confettiData[o + 2]);
      confetti.setMatrixAt(i, cMat4);
    }
    confetti.instanceMatrix.needsUpdate = true;
    if (alive === 0) confetti.visible = false;
  }

  // ---------- estela del balón (disparos fuertes y pases largos) ----------
  const TRAIL_N = 26;
  const trailCv = document.createElement("canvas");
  trailCv.width = 64; trailCv.height = 64;
  {
    const tg = trailCv.getContext("2d")!;
    const rg = tg.createRadialGradient(32, 32, 2, 32, 32, 30);
    rg.addColorStop(0, "rgba(255,255,255,0.85)");
    rg.addColorStop(0.4, "rgba(190,225,255,0.3)");
    rg.addColorStop(1, "rgba(190,225,255,0)");
    tg.fillStyle = rg;
    tg.fillRect(0, 0, 64, 64);
  }
  const trailTex = new THREE.CanvasTexture(trailCv);
  const trailSprites: { s: THREE.Sprite; life: number }[] = [];
  for (let i = 0; i < TRAIL_N; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: trailTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    }));
    sp.visible = false;
    sp.scale.set(0.5, 0.5, 1);
    scene.add(sp);
    trailSprites.push({ s: sp, life: 0 });
  }
  let trailIdx = 0;
  function updateTrail(dt: number): void {
    const speed = Math.hypot(ball.vx, ball.vz) + Math.abs(ball.vy);
    if (!ball.owner && speed > 11 && phase === "play") {
      const t = trailSprites[trailIdx];
      trailIdx = (trailIdx + 1) % TRAIL_N;
      t.s.position.set(ball.x, ball.y, ball.z);
      t.life = 0.28;
      t.s.visible = true;
    }
    for (const t of trailSprites) {
      if (!t.s.visible) continue;
      t.life -= dt;
      if (t.life <= 0) { t.s.visible = false; continue; }
      const k = t.life / 0.28;
      (t.s.material as THREE.SpriteMaterial).opacity = k * 0.6;
      const sc = 0.3 + (1 - k) * 0.55;
      t.s.scale.set(sc, sc, 1);
    }
  }

  // ---------- repetición de gol (ring buffer de las últimas ~10 s) ----------
  // Grabamos posiciones a 12 Hz durante el juego; al marcar, rebobinamos con
  // cámara cinematográfica baja de banda, como la repetición de una retransmisión.
  const REPLAY_FPS = 12;
  const REPLAY_MAX = REPLAY_FPS * 10;
  const replayFrames: Float32Array[] = [];
  let replayRecT = 0;
  let replayCursor = 0;
  function recordFrame(): void {
    const f = new Float32Array(players.length * 4 + 3);
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      f[i * 4] = p.x; f[i * 4 + 1] = p.z; f[i * 4 + 2] = p.faceX; f[i * 4 + 3] = p.faceZ;
    }
    f[players.length * 4] = ball.x; f[players.length * 4 + 1] = ball.y; f[players.length * 4 + 2] = ball.z;
    replayFrames.push(f);
    if (replayFrames.length > REPLAY_MAX) replayFrames.shift();
  }
  function applyReplayFrame(cursor: number): void {
    const i0 = Math.max(0, Math.min(replayFrames.length - 1, Math.floor(cursor)));
    const i1 = Math.min(replayFrames.length - 1, i0 + 1);
    const k = Math.min(1, Math.max(0, cursor - i0));
    const a = replayFrames[i0], b = replayFrames[i1];
    if (!a || !b) return;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      p.x = a[i * 4] + (b[i * 4] - a[i * 4]) * k;
      p.z = a[i * 4 + 1] + (b[i * 4 + 1] - a[i * 4 + 1]) * k;
      p.faceX = a[i * 4 + 2] + (b[i * 4 + 2] - a[i * 4 + 2]) * k;
      p.faceZ = a[i * 4 + 3] + (b[i * 4 + 3] - a[i * 4 + 3]) * k;
      p.mesh.group.position.set(p.x, 0, p.z);
      p.mesh.group.rotation.y = Math.atan2(p.faceX, p.faceZ);
      p.mesh.animate(4, 1 / 60, clockT);
    }
    const bi = players.length * 4;
    ballMesh.mesh.position.set(
      a[bi] + (b[bi] - a[bi]) * k,
      a[bi + 1] + (b[bi + 1] - a[bi + 1]) * k,
      a[bi + 2] + (b[bi + 2] - a[bi + 2]) * k,
    );
  }

  // ---------- estado del partido ----------
  let phase: Phase = "walkout";
  let phaseT = 3.8;
  let clockT = 0;               // segundos reales jugados
  let half: 1 | 2 = 1;
  let goals: [number, number] = [0, 0];
  const events: string[] = [];
  const userScorerIds: string[] = [];
  const allScorerIds: string[] = [];
  const userInjuries: { playerId: string; weeks: number }[] = [];
  let abandoned = false;
  let ended = false;
  let slowmo = 1;               // 1 = normal, 0.35 durante celebración
  let message = "";
  let messageT = 0;
  let charge = 0;
  let charging = false;
  let shake = 0;

  const controlled: { p: RTPlayer | null } = { p: null };
  let ctx: MatchCtx;

  function setControlled(p: RTPlayer): void {
    if (controlled.p) { controlled.p.controlled = false; controlled.p.mesh.setSelected(false); }
    controlled.p = p;
    if (ctx) ctx.controlled = p;
    p.controlled = true;
    p.mesh.setSelected(true);
  }

  // ---------- input ----------
  const input = {
    moveX: 0, moveZ: 0, sprint: false,
    pass: false, lob: false, tackle: false, switchPl: false,
  };
  const heldKeys = new Set<string>();
  const KEY_AXIS: Record<string, [axis: "moveX" | "moveZ", dir: 1 | -1]> = {
    KeyW: ["moveZ", 1], ArrowUp: ["moveZ", 1],
    KeyS: ["moveZ", -1], ArrowDown: ["moveZ", -1],
    KeyA: ["moveX", -1], ArrowLeft: ["moveX", -1],
    KeyD: ["moveX", 1], ArrowRight: ["moveX", 1],
  };
  function recompute(): void {
    let x = 0, z = 0;
    for (const k of heldKeys) {
      const m = KEY_AXIS[k];
      if (m) { if (m[0] === "moveX") x += m[1]; else z += m[1]; }
    }
    if (!touchActive) { input.moveX = Math.max(-1, Math.min(1, x)); input.moveZ = Math.max(-1, Math.min(1, z)); }
  }
  let touchActive = false;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (KEY_AXIS[e.code]) { heldKeys.add(e.code); recompute(); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.sprint = true;
    if (e.code === "Space") { input.pass = true; e.preventDefault(); }
    if (e.code === "KeyL") input.lob = true;
    if (e.code === "KeyJ") input.tackle = true;
    if (e.code === "KeyQ" || e.code === "Tab") { input.switchPl = true; e.preventDefault(); }
    if (e.code === "KeyK" || e.code === "Enter") { charging = true; charge = 0; }
    if (e.code === "Escape") { if (phase === "paused") engine.resume(); else if (phase !== "fulltime") engine.pause(); }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (KEY_AXIS[e.code]) { heldKeys.delete(e.code); recompute(); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.sprint = false;
    if (e.code === "KeyK" || e.code === "Enter") { if (charging) doShoot(); }
  };
  const onBlur = () => { heldKeys.clear(); recompute(); input.sprint = false; };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  // ---------- helpers ----------
  const minuteNow = () => Math.min(MATCH_MINUTES, Math.floor(clockT / SECONDS_PER_MINUTE));

  function addEvent(text: string, kind: "goal" | "info" | "chance"): void {
    cb.onEvent(text, kind);
    setMessage(text, 2.6);
  }
  function setMessage(text: string, t: number): void {
    message = text;
    messageT = t;
  }

  function userAttackDir(): number {
    return attackDir[userTeam];
  }

  function nearestUserToBall(excludeGK = true): RTPlayer {
    let best: RTPlayer | null = null;
    let bd = Infinity;
    for (const p of players) {
      if (p.team !== userTeam) continue;
      if (excludeGK && p.isGK) continue;
      const d = (p.x - ball.x) ** 2 + (p.z - ball.z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best!;
  }

  function kickBall(p: RTPlayer, dx: number, dz: number, speed: number, vy: number, receiver: RTPlayer | null = null): void {
    ball.owner = null;
    ball.receiver = receiver;
    ball.lastTouch = p.team;
    ball.noPickupT = 0.12;
    lastKicker = p;
    p.mesh.kick();
    ball.x = p.x + dx * 0.7;
    ball.z = p.z + dz * 0.7;
    ball.y = BALL_R;
    ball.vx = dx * speed;
    ball.vz = dz * speed;
    ball.vy = vy;
    audio.kick(Math.min(1, speed / 22));
  }

  function doShoot(): void {
    const p = controlled.p;
    charging = false;
    if (!p || ball.owner !== p || phase !== "play") { charge = 0; return; }
    const foeGoalZ = userAttackDir() === 1 ? PITCH_L / 2 : -PITCH_L / 2;
    const aimX = (input.moveX || (rng() - 0.5)) * 4.5 + (rng() - 0.5) * (1.8 - p.lite.sho / 90);
    const dx = aimX - p.x + (input.moveX !== 0 ? input.moveX * 3 : 0);
    const dz = foeGoalZ - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const power = 0.35 + charge * 0.65;
    kickBall(p, dx / d, dz / d, 13 + power * 12, 0.8 + power * 3.2);
    addEvent(`¡Remate de ${shortName(p)}!`, "chance");
    audio.crowdSwell(0.12, 0.8);
    charge = 0;
  }

  function doPass(lob: boolean): void {
    const p = controlled.p;
    if (!p || ball.owner !== p || phase !== "play") return;
    const dir = userAttackDir();
    // candidato en la dirección del joystick o el mejor apoyo
    let best: RTPlayer | null = null;
    let bestScore = -Infinity;
    const wantX = input.moveX, wantZ = input.moveZ * dir;
    const hasAim = Math.abs(wantX) > 0.2 || Math.abs(input.moveZ) > 0.2;
    for (const m of players) {
      if (m.team !== p.team || m === p) continue;
      const dx = m.x - p.x, dz = m.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2 || d > (lob ? 55 : 34)) continue;
      let score = 0;
      if (hasAim) {
        score = ((dx / d) * wantX + (dz / d) * wantZ) * 3;
      }
      let minFoe = 99;
      for (const f of players) {
        if (f.team === p.team) continue;
        const fd = Math.hypot(f.x - m.x, f.z - m.z);
        if (fd < minFoe) minFoe = fd;
      }
      score += Math.min(minFoe, 10) * 0.4 - Math.abs(d - 14) * 0.06 + rng() * 0.2;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (!best) return;
    const lead = 0.9;
    const dx = best.x + best.vx * lead - p.x, dz = best.z + best.vz * lead - p.z;
    const d = Math.hypot(dx, dz) || 1;
    kickBall(p, dx / d, dz / d, Math.max(9, Math.min(d * 1.25, 26)), lob ? 6 : 0.5, best);
  }

  function doTackle(): void {
    const p = controlled.p;
    if (!p || phase !== "play" || p.tackleCd > 0) return;
    p.tackleCd = 1.2;
    p.lungeT = 0.26;
    audio.tackle();
    const owner = ball.owner;
    if (owner && owner.team !== p.team) {
      const d = Math.hypot(owner.x - p.x, owner.z - p.z);
      if (d < 1.6) {
        const succ = 0.42 + (p.lite.def - owner.lite.ovr) / 130;
        if (rng() < succ) {
          owner.stagger = 0.35;
          owner.mesh.stumble();
          ball.owner = null;
          ball.noPickupT = 0.1;
          ball.vx = p.faceX * 6; ball.vz = p.faceZ * 6; ball.vy = 0.4;
          ball.lastTouch = p.team;
          registerInjury(owner);
        } else {
          p.stagger = 0.55;
          p.mesh.stumble();
          addEvent(`${shortName(p)} llega tarde a la entrada`, "info");
        }
      }
    }
  }

  function doSwitch(): void {
    setControlled(nearestUserToBall());
    audio.ui();
  }

  function registerGoal(scorer: RTPlayer): void {
    lastGoalTeam = scorer.team;
    lastScorer = scorer;
    goals[scorer.team]++;
    const min = minuteNow();
    const side = scorer.team === 0 ? setup.home : setup.away;
    const text = `${min}' ¡GOL de ${scorer.lite.name}! (${side.short})`;
    events.push(text);
    allScorerIds.push(scorer.lite.id);
    if (scorer.team === userTeam) userScorerIds.push(scorer.lite.id);
    cb.onEvent(text, "goal");
    setMessage("¡⚽ GOOOOL!", 3);
    phase = "goal";
    phaseT = 3.2;
    slowmo = 0.35;
    shake = 0.7;
    scorer.mesh.celebrate();
    burstConfetti(scorer.x, scorer.z);
    stadium.crowdCelebrate();
    audio.goal();
    ball.owner = null;
    ball.vx = 0; ball.vz = 0; ball.vy = 0;
    // deja el balón reposando dentro de la red (nunca sobre la línea)
    ball.y = BALL_R;
    ball.z = Math.sign(ball.z || 1) * (PITCH_L / 2 + 0.8);
    ballMesh.mesh.position.set(ball.x, ball.y, ball.z);
  }

  function registerInjury(p: RTPlayer): void {
    if (p.injured || rng() > 0.045) return;
    p.injured = true;
    const weeks = 1 + ((rng() * 3) | 0);
    if (p.team === userTeam) {
      userInjuries.push({ playerId: p.lite.id, weeks });
      addEvent(`🚑 ${p.lite.name} se duele tras la entrada…`, "info");
    }
  }

  // ---------- saques y reanudaciones ----------
  function resetPositions(kickoffTeam: 0 | 1): void {
    for (const p of players) {
      const a = p.anchors[p.slotIdx];
      // ligera variación para que no sea robótico
      p.x = a.x + (rng() - 0.5) * 2;
      p.z = a.z * 0.92 + (rng() - 0.5) * 2;
      p.vx = 0; p.vz = 0;
      p.stagger = 0; p.lungeT = 0; p.tackleCd = 0;
      p.tx = p.x; p.tz = p.z;
    }
    ball.x = 0; ball.y = BALL_R; ball.z = 0;
    ball.vx = 0; ball.vy = 0; ball.vz = 0;
    ball.receiver = null;
    // el equipo que saca: el mediocentro más cercano
    let kicker: RTPlayer | null = null;
    let bd = Infinity;
    for (const p of players) {
      if (p.team !== kickoffTeam || p.isGK) continue;
      const d = p.x * p.x + p.z * p.z;
      if (d < bd) { bd = d; kicker = p; }
    }
    if (kicker) {
      kicker.x = 0.4; kicker.z = attackDir[kickoffTeam] === 1 ? -0.8 : 0.8;
      ball.owner = kicker;
      ball.lastTouch = kickoffTeam;
      if (kickoffTeam === userTeam) setControlled(kicker);
      else setControlled(nearestUserToBall());
    }
  }

  function setPiece(x: number, z: number, team: 0 | 1, kind: "throw" | "corner" | "goalkick"): void {
    phase = "setpiece";
    phaseT = 1.0;
    ball.x = x; ball.z = z; ball.y = BALL_R;
    ball.vx = 0; ball.vy = 0; ball.vz = 0;
    ball.receiver = null;
    // entregamos el balón al jugador más cercano del equipo con posesión
    let taker: RTPlayer | null = null;
    let bd = Infinity;
    for (const p of players) {
      if (p.team !== team) continue;
      if (kind !== "goalkick" && p.isGK) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; taker = p; }
    }
    if (taker) {
      taker.x = x + (x > 0 ? -0.8 : x < 0 ? 0.8 : 0);
      taker.z = z;
      taker.tx = taker.x; taker.tz = taker.z;
      ball.owner = taker;
      ball.lastTouch = team;
      if (team === userTeam) setControlled(taker);
      pendingSetPiece = { kind, taker, team };
    }
    const label = kind === "throw" ? "Saque de banda" : kind === "corner" ? "¡Córner!" : "Saque de puerta";
    setMessage(label, 1.4);
  }
  let pendingSetPiece: { kind: "throw" | "corner" | "goalkick"; taker: RTPlayer; team: 0 | 1 } | null = null;

  function resolveSetPiece(): void {
    if (!pendingSetPiece) return;
    const { kind, taker, team } = pendingSetPiece;
    pendingSetPiece = null;
    if (team === userTeam && kind === "throw") {
      // el usuario saca con el botón de pase; si no, auto en 3s
      setMessage("Tu saque de banda: pulsa PASAR", 2);
      phase = "play";
      return;
    }
    if (kind === "corner") {
      // centro automático al área
      const goalZ = attackDir[team] === 1 ? PITCH_L / 2 : -PITCH_L / 2;
      const targetX = (rng() - 0.5) * 6;
      const targetZ = goalZ - attackDir[team] * (7 + rng() * 4);
      const dx = targetX - taker.x, dz = targetZ - taker.z;
      const d = Math.hypot(dx, dz) || 1;
      kickBall(taker, dx / d, dz / d, Math.min(26, d * 0.95), 7.5);
    } else if (kind === "goalkick") {
      const dz = attackDir[team] * 40;
      kickBall(taker, (rng() - 0.5) * 0.5, attackDir[team], 24 + rng() * 5, 8);
    } else {
      // saque de banda IA: pase corto
      let best: RTPlayer | null = null;
      let bd = Infinity;
      for (const m of players) {
        if (m.team !== team || m === taker || m.isGK) continue;
        const d = (m.x - taker.x) ** 2 + (m.z - taker.z) ** 2;
        if (d < bd && d > 4) { bd = d; best = m; }
      }
      if (best) {
        const dx = best.x - taker.x, dz = best.z - taker.z;
        const d = Math.hypot(dx, dz) || 1;
        kickBall(taker, dx / d, dz / d, Math.max(9, d * 1.2), 0.5, best);
      }
    }
    phase = "play";
  }

  // ---------- contexto compartido con la IA ----------
  ctx = {
    players, ball, attackDir,
    mentality: [setup.home.mentality, setup.away.mentality],
    pressing: [setup.home.pressing, setup.away.pressing],
    rng, kickBall, minuteNow, addEvent, registerGoal, registerInjury,
    userTeam,
    controlled: null,
    setControlled,
  };

  // ---------- reglas del balón ----------
  function updateBall(dt: number): void {
    if (ball.owner) {
      const o = ball.owner;
      ball.x = o.x + o.faceX * 0.55;
      ball.z = o.z + o.faceZ * 0.55;
      ball.y = BALL_R;
      ball.vx = o.vx; ball.vz = o.vz; ball.vy = 0;
      ballMesh.mesh.position.set(ball.x, ball.y, ball.z);
      return;
    }
    ball.noPickupT = Math.max(0, ball.noPickupT - dt);
    ball.vy -= BALL_GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      if (Math.abs(ball.vy) > 1.2) { ball.vy = -ball.vy * BALL_BOUNCE; audio.kick(0.15); }
      else ball.vy = 0;
      // rozamiento del césped
      const f = Math.max(0, 1 - BALL_FRICTION * dt);
      ball.vx *= f; ball.vz *= f;
    }
    if (ball.y <= BALL_R + 0.05) {
      const f = Math.max(0, 1 - BALL_FRICTION * 0.6 * dt);
      ball.vx *= f; ball.vz *= f;
    }
    ballMesh.spin(ball.vx, ball.vz, dt);
    ballMesh.mesh.position.set(ball.x, ball.y, ball.z);

    const inGoalMouth = Math.abs(ball.x) < GOAL_W / 2 - BALL_R && ball.y < GOAL_H - BALL_R;
    // ¿gol? (solo en fase de juego — evita registros repetidos durante la celebración)
    if (phase === "play" && inGoalMouth && Math.abs(ball.z) > PITCH_L / 2) {
      const scoringTeam: 0 | 1 = ball.z > 0 ? 0 : 1; // gol en la portería de +z lo marca quien ataca +z (home)
      const scorer = lastKicker ?? players.find((p) => p.team === scoringTeam)!;
      registerGoal(scorer);
      return;
    }
    // postes
    if (Math.abs(ball.z) > PITCH_L / 2 - 0.1 && ball.y < GOAL_H + 0.1) {
      for (const px of [-GOAL_W / 2, GOAL_W / 2]) {
        if (Math.abs(ball.x - px) < 0.15) {
          ball.vx = -ball.vx * 0.6 + (rng() - 0.5) * 2;
          ball.vz = -ball.vz * 0.55;
          ball.x = px + (ball.x > px ? 0.18 : -0.18);
          audio.post();
          addEvent("¡Al palo!", "chance");
        }
      }
      // larguero
      if (Math.abs(ball.x) < GOAL_W / 2 && Math.abs(ball.y - GOAL_H) < 0.15 && ball.vy > 0) {
        ball.vy = -ball.vy * 0.5;
        ball.vz = -ball.vz * 0.4;
        audio.post();
        addEvent("¡Al larguero!", "chance");
      }
    }

    // captura/intercepción de jugadores
    if (ball.noPickupT <= 0 && ball.y < 1.4) {
      for (const p of players) {
        if (p.stagger > 0) continue;
        const d2 = (p.x - ball.x) ** 2 + (p.z - ball.z) ** 2;
        const reach = p.isGK ? 1.15 : 0.62;
        if (d2 < reach * reach) {
          if (p.isGK) {
            // parada según calidad: blocar o rechazar
            const ballSpeed = Math.hypot(ball.vx, ball.vz) + Math.abs(ball.vy);
            const saveP = 0.3 + (p.lite.gk - 45) / 90 - ballSpeed / 60;
            if (ballSpeed > 12 && rng() > saveP) {
              // rechace
              p.mesh.dive(Math.sign(ball.x - p.x) || (rng() > 0.5 ? 1 : -1));
              ball.vx = (rng() - 0.5) * 10;
              ball.vz = -Math.sign(ball.z) * (4 + rng() * 6);
              ball.vy = 2 + rng() * 2;
              addEvent(`¡Paradón de ${shortName(p)}!`, "chance");
              audio.crowdSwell(0.2, 0.7);
              continue;
            }
            if (ballSpeed > 10) {
              addEvent(`¡Gran atajada de ${shortName(p)}!`, "chance");
              p.mesh.dive(Math.sign(ball.x - p.x) || (rng() > 0.5 ? 1 : -1));
            }
          }
          ball.owner = p;
          ball.receiver = null;
          ball.lastTouch = p.team;
          lastKicker = p;
          if (p.team === userTeam && !p.isGK) setControlled(p);
          else if (p.team !== userTeam) {
            // al perder la posesión, controlamos al defensor más cercano al balón
            setControlled(nearestUserToBall());
          }
          break;
        }
      }
    }

    // fuera de banda / línea de fondo
    if (Math.abs(ball.z) > PITCH_L / 2 + 0.3 && !inGoalMouth) {
      const defenseTeam: 0 | 1 = ball.z > 0 ? 1 : 0;
      if (ball.lastTouch === defenseTeam) {
        // córner para el atacante
        const cornerX = Math.sign(ball.x) * (PITCH_W / 2 - 0.5);
        const cornerZ = Math.sign(ball.z) * (PITCH_L / 2 - 0.5);
        setPiece(cornerX, cornerZ, (1 - defenseTeam) as 0 | 1, "corner");
      } else {
        const gkZ = Math.sign(ball.z) * (PITCH_L / 2 - 5);
        setPiece((rng() - 0.5) * 6, gkZ, defenseTeam, "goalkick");
      }
      return;
    }
    if (Math.abs(ball.x) > PITCH_W / 2 + 0.3) {
      const tx = Math.sign(ball.x) * (PITCH_W / 2 - 0.4);
      setPiece(tx, Math.max(-PITCH_L / 2 + 1, Math.min(PITCH_L / 2 - 1, ball.z)), (1 - ball.lastTouch) as 0 | 1, "throw");
    }
  }

  let lastKicker: RTPlayer | null = null;
  let lastGoalTeam: 0 | 1 = 0;
  let lastScorer: RTPlayer | null = null;
  let lateSwellDone = false;

  // ---------- jugadores ----------
  function updatePlayers(dt: number): void {
    const ctrl = controlled.p;
    for (const p of players) {
      p.tackleCd = Math.max(0, p.tackleCd - dt);
      p.stagger = Math.max(0, p.stagger - dt);
      if (p.lungeT > 0) {
        p.lungeT -= dt;
        // impulso de entrada hacia delante
        p.vx = p.faceX * 9;
        p.vz = p.faceZ * 9;
      } else if (p === ctrl && phase === "play") {
        // control directo
        const dir = userAttackDir();
        const mx = input.moveX * dir;
        const mz = input.moveZ * dir;
        const mag = Math.hypot(mx, mz);
        let speed = p.topSpeed * (ball.owner === p ? 0.88 : 1);
        if (input.sprint && p.stamina > 0 && mag > 0.1) {
          speed *= SPRINT_MULT;
          p.stamina = Math.max(0, p.stamina - 16 * dt);
        } else {
          p.stamina = Math.min(100, p.stamina + 7 * dt);
        }
        if (mag > 0.1) {
          p.vx += ((mx / mag) * speed - p.vx) * Math.min(1, 10 * dt);
          p.vz += ((mz / mag) * speed - p.vz) * Math.min(1, 10 * dt);
        } else {
          p.vx *= Math.max(0, 1 - 8 * dt);
          p.vz *= Math.max(0, 1 - 8 * dt);
        }
        // acciones instantáneas
        if (input.pass) { input.pass = false; if (ball.owner === p) doPass(false); else doTackle(); }
        if (input.lob) { input.lob = false; if (ball.owner === p) doPass(true); else doSwitch(); }
        if (input.tackle) { input.tackle = false; doTackle(); }
        if (input.switchPl) { input.switchPl = false; doSwitch(); }
        if (charging && ball.owner === p) charge = Math.min(1, charge + dt / 0.85);
      } else {
        if (phase === "goal" || phase === "countdown" || phase === "walkout") {
          // celebración / espera: trotar hacia el ancla sin lógica competitiva
          const a = p.anchors[p.slotIdx];
          p.tx = a.x; p.tz = a.z;
          p.wantSpeed = phase === "goal" ? RUN_SPEED * 0.35 : 0;
        } else {
          updateAI(ctx, p, dt);
        }
        // steering hacia el objetivo
        const dx = p.tx - p.x, dz = p.tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.25 && p.stagger <= 0) {
          const sp = Math.min(p.wantSpeed, d * 2.2);
          p.vx += ((dx / d) * sp - p.vx) * Math.min(1, 7 * dt);
          p.vz += ((dz / d) * sp - p.vz) * Math.min(1, 7 * dt);
        } else {
          p.vx *= Math.max(0, 1 - 6 * dt);
          p.vz *= Math.max(0, 1 - 6 * dt);
        }
      }
      // integrar
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      // límites
      const B = 1.2;
      p.x = Math.max(-PITCH_W / 2 - B, Math.min(PITCH_W / 2 + B, p.x));
      p.z = Math.max(-PITCH_L / 2 - B, Math.min(PITCH_L / 2 + B, p.z));
      // orientación
      const spd = Math.hypot(p.vx, p.vz);
      if (spd > 0.5) {
        const fx = p.vx / spd, fz = p.vz / spd;
        p.faceX += (fx - p.faceX) * Math.min(1, 12 * dt);
        p.faceZ += (fz - p.faceZ) * Math.min(1, 12 * dt);
        const fl = Math.hypot(p.faceX, p.faceZ) || 1;
        p.faceX /= fl; p.faceZ /= fl;
      }
      p.mesh.group.position.set(p.x, 0, p.z);
      p.mesh.group.rotation.y = Math.atan2(p.faceX, p.faceZ);
      p.mesh.animate(spd, dt, clockT);
    }
    // separación simple por parejas
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        const min = PLAYER_R * 2;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
        }
      }
    }
  }

  // ---------- cámara ----------
  // En vertical (móvil) compensamos con FOV más amplio en vez de alejar la cámara:
  // los jugadores se ven grandes, como en los FIFA de móvil.
  function applyFov(): void {
    camera.fov = camera.aspect < 0.7 ? 70 : camera.aspect < 0.85 ? 64 : camera.aspect < 1.25 ? 57 : 52;
    camera.updateProjectionMatrix();
  }
  applyFov();
  const camTarget = new THREE.Vector3(0, 0, 0);
  // arranque del walkout: plano cenital alto sobre el estadio
  const camPos = new THREE.Vector3(0, 84, -46 * userAttackDir());
  let debugCamScale = 1;
  let debugFocusT = 0;
  let debugFocusX = 0;
  let debugFocusZ = 0;
  let dbgAnimPlayer: RTPlayer | null = null;
  function updateCamera(dt: number): void {
    const dir = userAttackDir();

    // cámara de repetición: plano bajo de banda siguiendo el balón (look TV)
    if (phase === "replay") {
      const bp = ballMesh.mesh.position;
      const slide = Math.min(6, replayCursor * 0.06); // ligero travelling lateral
      camPos.x += (bp.x * 0.4 - 15 + slide - camPos.x) * Math.min(1, 2.6 * dt);
      camPos.y += (3.3 - camPos.y) * Math.min(1, 2.6 * dt);
      camPos.z += (bp.z * 0.55 - dir * 2 - camPos.z) * Math.min(1, 2.6 * dt);
      camera.position.set(camPos.x, camPos.y, camPos.z);
      camera.lookAt(bp.x, 0.7, bp.z);
      return;
    }

    // durante la celebración el plano se centra en el goleador
    debugFocusT = Math.max(0, debugFocusT - dt);
    const focusX = debugFocusT > 0 ? debugFocusX : phase === "goal" && lastScorer ? lastScorer.x : ball.x;
    const focusZ = debugFocusT > 0 ? debugFocusZ : phase === "goal" && lastScorer ? lastScorer.z : ball.z;
    camTarget.set(
      focusX * 0.45,
      0,
      focusZ * 0.55 + dir * 6,
    );
    // en pantallas verticales (móvil) alejamos solo un poco: el FOV amplio ya compensa
    const viewScale = camera.aspect < 0.7 ? 1.28 : camera.aspect < 0.85 ? 1.18 : camera.aspect < 1.25 ? 1.08 : 1;
    // pullback dinámico: en los contragolpes la cámara abre plano como en la TV
    const ballSpeed = Math.hypot(ball.vx, ball.vz);
    const pull = Math.min(4.5, ballSpeed * 0.16);
    let desiredY = (phase === "goal" ? 10.5 : 12.2) * viewScale + pull * 0.18;
    let desiredBack = ((phase === "goal" ? 16 : 20.5) + pull) * viewScale;
    desiredY *= debugCamScale;
    desiredBack *= debugCamScale;
    // walkout: la grúa de TV baja desde el cielo del estadio al plano broadcast
    if (phase === "walkout") {
      const k = 1 - Math.max(0, phaseT) / 3.8;
      const s = k * k * (3 - 2 * k);
      desiredY = 84 - s * (84 - desiredY);
      desiredBack = 46 - s * (46 - desiredBack);
      camTarget.set(0, 0, -dir * 12 + s * dir * 18);
    }
    camPos.x += (camTarget.x - camPos.x) * Math.min(1, 2.2 * dt);
    camPos.y += (desiredY - camPos.y) * Math.min(1, 2 * dt);
    camPos.z += (camTarget.z - dir * desiredBack - camPos.z) * Math.min(1, 2.2 * dt);
    let sx = 0, sy = 0, sz = 0;
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 1.4);
      sx = (rng() - 0.5) * shake * 1.6;
      sy = (rng() - 0.5) * shake * 1.2;
      sz = (rng() - 0.5) * shake * 1.6;
    }
    camera.position.set(camPos.x + sx, camPos.y + sy, camPos.z + sz);
    camera.lookAt(camTarget.x + ball.vx * 0.06, 0.4, camTarget.z + dir * 3.5);
  }

  function resumeAfterGoal(): void {
    // saca el equipo que encajó
    const conceded: 0 | 1 = lastGoalTeam === 0 ? 1 : 0;
    resetPositions(conceded);
    phase = "play";
    audio.whistle();
  }

  // ---------- bucle ----------
  let hudT = 0;
  let dbgTicks = 0;
  function update(dtRaw: number): void {
    dbgTicks++;
    const dt = dtRaw * slowmo;
    if (phase === "paused" || phase === "fulltime") return;


    if (phase === "walkout") {
      phaseT -= dtRaw;
      // cualquier entrada salta la presentación
      if (input.pass || input.lob || input.tackle || Math.hypot(input.moveX, input.moveZ) > 0.2) {
        input.pass = input.lob = input.tackle = false;
        phaseT = 0;
      }
      if (phaseT <= 0) { phase = "countdown"; phaseT = 2.2; }
    } else if (phase === "countdown") {
      phaseT -= dt;
      setMessage(half === 1 ? "¡Comienza el partido!" : "¡Segunda parte!", 1);
      if (phaseT <= 0) { phase = "play"; audio.whistle(); }
    } else if (phase === "play") {
      clockT += dt;
      // grabación para la repetición
      replayRecT += dt;
      if (replayRecT >= 1 / REPLAY_FPS) { replayRecT = 0; recordFrame(); }
      const min = minuteNow();
      // fin de la primera parte
      if (half === 1 && clockT >= HALF_SECONDS) {
        phase = "halftime";
        phaseT = 3.4;
        audio.whistle(true);
        setMessage("Descanso", 3);
        addEvent(`Descanso: ${setup.home.short} ${goals[0]} - ${goals[1]} ${setup.away.short}`, "info");
      } else if (half === 2 && clockT >= HALF_SECONDS * 2) {
        finish(false);
      }
      // emoción final
      if (min >= 85 && !lateSwellDone) { lateSwellDone = true; audio.crowdSwell(0.15, 2); }
    } else if (phase === "goal") {
      phaseT -= dtRaw; // la celebración corre a tiempo real
      if (phaseT <= 0) {
        slowmo = 1;
        // si hay material grabado suficiente, ofrecemos la repetición TV
        if (replayFrames.length >= REPLAY_FPS * 3) {
          phase = "replay";
          replayCursor = 0;
          setMessage("📺 Repetición", 3);
        } else {
          resumeAfterGoal();
        }
      }
    } else if (phase === "replay") {
      replayCursor += dtRaw * REPLAY_FPS * 0.55; // a cámara lenta suave
      // toca o pulsa para saltarte la repetición
      if (input.pass || input.lob || input.tackle) {
        input.pass = input.lob = input.tackle = false;
        replayFrames.length = 0;
        resumeAfterGoal();
      } else if (replayCursor >= replayFrames.length - 1) resumeAfterGoal();
    } else if (phase === "setpiece") {
      phaseT -= dt;
      if (phaseT <= 0) resolveSetPiece();
    } else if (phase === "halftime") {
      phaseT -= dtRaw;
      if (phaseT <= 0) {
        half = 2;
        resetPositions(1); // saca el visitante
        phase = "countdown";
        phaseT = 1.6;
      }
    }

    if (phase === "play" || phase === "setpiece" || phase === "countdown" || phase === "walkout") {
      updatePlayers(dt);
      updateBall(dt);
      updateConfetti(dtRaw);
      updateTrail(dtRaw);
    } else if (phase === "goal") {
      updatePlayers(dt);
      updateConfetti(dtRaw);
      updateTrail(dtRaw);
    } else if (phase === "replay") {
      applyReplayFrame(replayCursor);
      updateConfetti(dtRaw);
    }
    messageT -= dtRaw;
    if (messageT <= 0) message = "";

    // HUD a ~10 Hz
    hudT -= dtRaw;
    if (hudT <= 0) {
      hudT = 0.1;
      cb.onHud({
        homeGoals: goals[0], awayGoals: goals[1],
        minute: minuteNow(), half, phase,
        controlledName: controlled.p ? controlled.p.lite.name : "",
        stamina: controlled.p ? controlled.p.stamina : 100,
        charging: charging ? charge : 0,
        message,
      });
    }
  }

  function finish(abandon: boolean): void {
    if (ended) return;
    ended = true;
    abandoned = abandon;
    phase = "fulltime";
    audio.whistle(true);
    const text = abandon
      ? `${setup.home.short} 0 - 3 ${setup.away.short} (abandono)`
      : `Final: ${setup.home.short} ${goals[0]} - ${goals[1]} ${setup.away.short}`;
    addEvent(text, "info");
    setMessage("¡Final del partido!", 4);
    const out: MatchOutcome = {
      homeGoals: abandon ? (userTeam === 0 ? 0 : 3) : goals[0],
      awayGoals: abandon ? (userTeam === 0 ? 3 : 0) : goals[1],
      events, userScorerIds, allScorerIds, userInjuries, abandoned: abandon,
    };
    cb.onHud({
      homeGoals: out.homeGoals, awayGoals: out.awayGoals,
      minute: 90, half, phase: "fulltime",
      controlledName: "", stamina: 100, charging: 0, message: "¡Final del partido!",
    });
    cb.onEnd(out);
  }

  // saque inicial
  resetPositions(0);
  setControlled(nearestUserToBall());
  audio.startCrowd();
  setMessage(`${setup.home.name} vs ${setup.away.name}`, 5.5);
  audio.crowdSwell(0.25, 4.5);

  // gancho de verificación: fuerza un gol del usuario para probar la celebración
  window.__FTM_MATCH_DEBUG__ = {
    forceGoal: () => {
      const scorer = controlled.p ?? players.find((p) => p.team === userTeam && !p.isGK)!;
      registerGoal(scorer);
    },
    skipToMinute: (m: number) => { clockT = m * SECONDS_PER_MINUTE; },
    zoom: (f: number) => { debugCamScale = Math.max(0.15, Math.min(2, f)); },
    animInfo: () => (dbgAnimPlayer ? dbgAnimPlayer.mesh.clipInfo() : -2),
    animPose: () => (dbgAnimPlayer ? dbgAnimPlayer.mesh.hipsInfo() : [0, 0]),
    anim: (name: string) => {
      const p = nearestUserToBall(true) ?? controlled.p;
      if (!p) return;
      dbgAnimPlayer = p;
      if (name === "kick") p.mesh.kick();
      else if (name === "celebrate") p.mesh.celebrate();
      else if (name === "stumble") p.mesh.stumble();
      else if (name === "diveL") p.mesh.dive(-1);
      else if (name === "diveR") p.mesh.dive(1);
      // cámara de inspección instantánea sobre el jugador (depuración visual)
      const dir = userAttackDir();
      debugFocusX = p.x; debugFocusZ = p.z; debugFocusT = 3;
      camPos.set(p.x - 1.5, 2.1, p.z - dir * 4.2);
      camera.position.copy(camPos);
      camera.lookAt(p.x, 0.9, p.z);
    },
    perf: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, ticks: dbgTicks, phaseT, camY: camera.position.y, camZ: camera.position.z, zoomV: debugCamScale } as { calls: number; triangles: number; ticks: number; phaseT: number; camY: number; camZ: number; zoomV: number }),
    phase: () => phase,
  };

  let ambientT = 0;
  let fpsAcc = 0, fpsN = 0, fpsCheckT = 0;
  const loop = new GameLoop({
    update: (dt) => update(dt),
    render: (alpha) => {
      ambientT += 1 / 60;
      stadium.update(1 / 60, ambientT);
      updateCamera(1 / 60);
      const t0 = performance.now();
      composer.render();
      // calidad dinámica: si el frame medio baja de ~40 fps, reduce pixelRatio
      fpsAcc += performance.now() - t0; fpsN++;
      fpsCheckT += 1 / 60;
      if (fpsCheckT >= 3 && fpsN > 10) {
        fpsCheckT = 0;
        const avgMs = fpsAcc / fpsN;
        fpsAcc = 0; fpsN = 0;
        if (avgMs > 18 && quality.pr > 1) {
          quality.pr = Math.max(1, quality.pr - 0.25);
          renderer.setPixelRatio(quality.pr);
          composer.setSize(window.innerWidth, window.innerHeight);
        }
      }
      window.__GAME_READY__ = true;
    },
  });
  loop.start();

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    applyFov();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  window.__gameProbe = () => ({
    x: controlled.p?.x ?? 0,
    y: 0,
    z: controlled.p?.z ?? 0,
    id: controlled.p?.lite.id ?? "",
  });

  const engine: MatchEngine = {
    audio,
    setMove: (x, z) => { touchActive = true; input.moveX = x; input.moveZ = z; if (x === 0 && z === 0) { touchActive = false; recompute(); } },
    setSprint: (v) => { input.sprint = v; },
    pressPass: () => { input.pass = true; },
    pressLob: () => { input.lob = true; },
    pressTackle: () => { input.tackle = true; },
    pressSwitch: () => { input.switchPl = true; },
    chargeStart: () => { charging = true; charge = 0; },
    chargeRelease: () => { if (charging) doShoot(); },
    pause: () => { if (phase !== "fulltime") { phase = "paused"; cb.onHud({ homeGoals: goals[0], awayGoals: goals[1], minute: minuteNow(), half, phase: "paused", controlledName: "", stamina: controlled.p?.stamina ?? 100, charging: 0, message: "Pausa" }); } },
    resume: () => { if (phase === "paused") { phase = "play"; } },
    toggleMute: () => { audio.setMuted(!audio.muted); return audio.muted; },
    simulateRest: () => {
      // simular el resto del partido con ritmo basado en la fuerza real de ambos onces
      const base = minuteNow();
      const remainingMin = MATCH_MINUTES - base;
      const diff = (setup.strength.home - setup.strength.away) / 14;
      const lambdaH = (1.35 * Math.exp(diff * 0.55) + 0.12) / MATCH_MINUTES; // + factor campo
      const lambdaA = (1.15 * Math.exp(-diff * 0.55)) / MATCH_MINUTES;
      const homePool = setup.home.xi.filter((p) => p.pos !== "GK");
      const awayPool = setup.away.xi.filter((p) => p.pos !== "GK");
      for (let m = 0; m < remainingMin; m++) {
        if (rng() < lambdaH) {
          goals[0]++;
          const s = homePool[(rng() * homePool.length) | 0];
          events.push(`${base + m}' ${s.name} (${setup.home.short})`);
          allScorerIds.push(s.id);
          if (userTeam === 0) userScorerIds.push(s.id);
        }
        if (rng() < lambdaA) {
          goals[1]++;
          const s = awayPool[(rng() * awayPool.length) | 0];
          events.push(`${base + m}' ${s.name} (${setup.away.short})`);
          allScorerIds.push(s.id);
          if (userTeam === 1) userScorerIds.push(s.id);
        }
      }
      clockT = HALF_SECONDS * 2;
      finish(false);
    },
    abandon: () => finish(true),
    dispose: () => {
      loop.stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      audio.dispose();
      stadium.dispose();
      trailTex.dispose();
      for (const t of trailSprites) (t.s.material as THREE.SpriteMaterial).dispose();
      composer.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) (mat as THREE.Material).dispose();
      });
      renderer.dispose();
      delete window.__gameProbe;
      delete window.__FTM_MATCH_DEBUG__;
      window.__GAME_READY__ = false;
    },
  };

  return engine;
}
