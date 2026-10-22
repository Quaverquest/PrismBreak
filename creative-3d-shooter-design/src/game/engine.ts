import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { buildWorld } from "./world";
import type { World } from "./world";
import { audio } from "./audio";
import {
  ARENA_RADIUS,
  CHANNELS,
  CHANNEL_COUNT,
  ENEMY_DEFS,
  GRAVITY,
  PLAYER_EYE,
  channelColor,
} from "./config";
import type { EnemyDef, EnemyKind } from "./config";

export type Phase = "menu" | "playing" | "paused" | "dead";

export interface Snapshot {
  phase: Phase;
  locked: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  score: number;
  best: number;
  combo: number;
  mult: number;
  comboTime: number;
  wave: number;
  waveBanner: { title: string; sub: string; key: number } | null;
  enemiesLeft: number;
  channel: number;
  saturation: number;
  overcharge: number;
  dashCharges: number;
  dashMax: number;
  dashRecharge: number;
  kills: number;
  accuracy: number;
  elapsed: number;
  boss: { hp: number; max: number; channel: number; name: string } | null;
  aim: 0 | 1 | 2;
  hurt: number;
  slowmo: number;
  muted: boolean;
  sensitivity: number;
  pickupToast: { text: string; key: number } | null;
}

interface Enemy {
  kind: EnemyKind;
  def: EnemyDef;
  group: THREE.Group;
  core: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
  shell: THREE.LineSegments;
  shellMat: THREE.LineBasicMaterial;
  extras: THREE.Object3D[];
  sight: THREE.Line;
  sightMat: THREE.LineBasicMaterial;
  hp: number;
  maxHp: number;
  channel: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fireTimer: number;
  charge: number;
  hitFlash: number;
  bob: number;
  bobSpeed: number;
  strafe: number;
  contactCd: number;
  isBoss: boolean;
  switchTimer: number;
  attackPattern: number;
  spin: THREE.Vector3;
  baseScale: number;
  dead: boolean;
}

interface Bolt {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  channel: number;
  dmg: number;
  pierce: number;
  radius: number;
  active: boolean;
  chromatic: boolean;
}

interface Orb {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  dmg: number;
  radius: number;
  active: boolean;
  homing: number;
}

interface Debris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  scale0: number;
  active: boolean;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  speed: number;
  active: boolean;
}

interface Pickup {
  group: THREE.Group;
  type: "hp" | "sat" | "chrono";
  pos: THREE.Vector3;
  life: number;
  bob: number;
  active: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _c1 = new THREE.Color();

const CHROMA_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uAberr: { value: 0.0 },
    uVig: { value: 0.85 },
    uHurt: { value: 0.0 },
    uHurtCol: { value: new THREE.Color(0xff2244) },
    uTint: { value: new THREE.Color(0x25e6ff) },
    uTintAmt: { value: 0.0 },
    uTime: { value: 0.0 },
    uGrain: { value: 0.035 },
    uSlow: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAberr, uVig, uHurt, uTintAmt, uTime, uGrain, uSlow;
    uniform vec3 uHurtCol, uTint;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float d = length(c);
      vec2 off = c * uAberr * (0.25 + d * 2.1);

      float r = texture2D(tDiffuse, clamp(uv - off, 0.001, 0.999)).r;
      float g = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).g;
      float b = texture2D(tDiffuse, clamp(uv + off, 0.001, 0.999)).b;
      vec3 col = vec3(r, g, b);

      // bullet-time desaturation + cool lift
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, mix(vec3(lum), col * vec3(0.72, 0.86, 1.35), 0.55), uSlow * 0.75);

      col = mix(col, col * uTint * 1.6 + col * 0.35, uTintAmt);

      float vig = smoothstep(1.02, 0.22, d);
      col *= mix(1.0, vig, uVig);

      // directional damage bloom from the edges
      float hmask = smoothstep(0.18, 0.95, d);
      col = mix(col, uHurtCol, uHurt * hmask * 0.85);
      col += uHurtCol * uHurt * 0.25 * (0.5 + 0.5 * sin(uTime * 22.0)) * hmask;

      float gr = hash(uv * vec2(1024.0, 768.0) + fract(uTime) * 91.7);
      col += (gr - 0.5) * uGrain;
      col *= 1.0 - 0.03 * sin(uv.y * 1100.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private chroma: ShaderPass;
  private world: World;
  private onSnap: (s: Snapshot) => void;

  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  // ---- run state
  phase: Phase = "menu";
  locked = false;
  muted = false;
  sensitivity = 1;

  private hp = 100;
  private maxHp = 100;
  private shield = 0;
  private score = 0;
  private best = 0;
  private combo = 0;
  private comboTimer = 0;
  private wave = 0;
  private kills = 0;
  private shots = 0;
  private hitsLanded = 0;
  private elapsed = 0;
  private channel = 0;
  private saturation = 0;
  private overcharge = 0;
  private chrono = 0;
  private timeScale = 1;
  private hurtFx = 0;
  private shake = 0;
  private aimState: 0 | 1 | 2 = 0;

  private waveBanner: { title: string; sub: string; key: number } | null = null;
  private bannerTimer = 0;
  private pickupToast: { text: string; key: number } | null = null;
  private toastTimer = 0;

  // ---- player kinematics
  private pos = new THREE.Vector3(0, 0, 12);
  private vel = new THREE.Vector3();
  private yaw = Math.PI;
  private pitch = 0;
  private grounded = true;
  private bobT = 0;
  private fov = 78;
  private dashCharges = 2;
  private dashMax = 2;
  private dashRecharge = 0;
  private dashTime = 0;
  private invuln = 0;
  private hurtCd = 0;
  private recoil = 0;
  private sway = new THREE.Vector2();
  private deathTilt = 0;
  private intensityAcc = 0;
  private lastIntensity = -1;
  private dbgT = 0;
  private now = 0;
  private sharedGeo = new Set<THREE.BufferGeometry>();

  // ---- input
  private keys: Record<string, boolean> = {};
  private firing = false;
  private fireTimer = 0;

  // ---- entities
  private enemies: Enemy[] = [];
  private spawnQueue: EnemyKind[] = [];
  private spawnTimer = 0;
  private intermission = 0;
  private pendingWave = 1;
  private bolts: Bolt[] = [];
  private orbs: Orb[] = [];
  private debris: Debris[] = [];
  private rings: Ring[] = [];
  private pickups: Pickup[] = [];
  private boss: Enemy | null = null;

  // ---- shared resources
  private geo: Record<string, THREE.BufferGeometry> = {};
  private weapon: THREE.Group;
  private weaponGlow: THREE.MeshBasicMaterial[] = [];
  private emitAcc = 0;

  constructor(canvas: HTMLCanvasElement, onSnap: (s: Snapshot) => void) {
    this.canvas = canvas;
    this.onSnap = onSnap;

    try {
      this.best = Number(localStorage.getItem("prismbreak.best") || 0) || 0;
    } catch {
      this.best = 0;
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0718, 0.0125);

    this.camera = new THREE.PerspectiveCamera(
      this.fov,
      window.innerWidth / window.innerHeight,
      0.05,
      900,
    );
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.world = buildWorld(this.scene);

    // ---------------------------------------------------------- geometries
    this.geo.bolt = new THREE.CapsuleGeometry(0.1, 0.62, 4, 8);
    this.geo.orb = new THREE.IcosahedronGeometry(0.3, 1);
    this.geo.debris = new THREE.TetrahedronGeometry(0.22, 0);
    this.geo.ring = new THREE.RingGeometry(0.72, 1, 48);
    this.geo.shardCore = new THREE.OctahedronGeometry(1, 0);
    this.geo.weaverCore = new THREE.TetrahedronGeometry(1, 0);
    this.geo.bulwarkCore = new THREE.IcosahedronGeometry(1, 0);
    this.geo.splitterCore = new THREE.DodecahedronGeometry(1, 0);
    this.geo.bossCore = new THREE.TorusKnotGeometry(1, 0.3, 160, 20, 2, 3);
    this.geo.bossShell = new THREE.IcosahedronGeometry(1.9, 1);
    this.geo.torus = new THREE.TorusGeometry(1, 0.06, 6, 40);
    this.geo.pickup = new THREE.OctahedronGeometry(0.42, 0);
    Object.values(this.geo).forEach((g) => this.sharedGeo.add(g));

    // ------------------------------------------------------- viewmodel gun
    this.weapon = this.buildWeapon();
    this.weapon.visible = false;
    this.camera.add(this.weapon);

    // -------------------------------------------------------- post fx
    const pr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rt = new THREE.WebGLRenderTarget(
      Math.floor(window.innerWidth * pr),
      Math.floor(window.innerHeight * pr),
      { type: THREE.HalfFloatType, samples: 4 },
    );
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.92,
      0.62,
      0.3,
    );
    this.composer.addPass(this.bloom);
    this.chroma = new ShaderPass(CHROMA_SHADER);
    this.composer.addPass(this.chroma);
    this.composer.addPass(new OutputPass());

    this.bindEvents();
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------ setup
  private buildWeapon(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({
      color: 0x191533,
      roughness: 0.35,
      metalness: 0.85,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x0c0a1c,
      roughness: 0.7,
      metalness: 0.4,
    });

    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...p);
      g.add(m);
      return m;
    };

    mk(new THREE.BoxGeometry(0.13, 0.15, 0.46), body, [0, 0, 0.05]);
    mk(new THREE.BoxGeometry(0.1, 0.22, 0.16), dark, [0, -0.14, 0.2]);
    const barrel = mk(new THREE.CylinderGeometry(0.045, 0.062, 0.5, 10), dark, [0, 0.01, -0.4]);
    barrel.rotation.x = Math.PI / 2;

    // side fins
    const fin = new THREE.BoxGeometry(0.02, 0.13, 0.3);
    mk(fin, body, [0.085, 0.03, -0.02]);
    mk(fin, body, [-0.085, 0.03, -0.02]);

    // glowing prism emitter
    const glowMat = new THREE.MeshBasicMaterial({ color: CHANNELS[0].hex, fog: false });
    glowMat.color.multiplyScalar(2.1);
    this.weaponGlow.push(glowMat);
    const tip = mk(new THREE.OctahedronGeometry(0.075, 0), glowMat, [0, 0.01, -0.68]);
    tip.name = "tip";

    const ringMat = new THREE.MeshBasicMaterial({ color: CHANNELS[0].hex, fog: false });
    ringMat.color.multiplyScalar(1.5);
    this.weaponGlow.push(ringMat);
    const r1 = mk(new THREE.TorusGeometry(0.085, 0.016, 6, 18), ringMat, [0, 0.01, -0.5]);
    r1.name = "ring1";
    const r2 = mk(new THREE.TorusGeometry(0.07, 0.013, 6, 18), ringMat, [0, 0.01, -0.36]);
    r2.name = "ring2";

    // cell strip along the body
    const cellMat = new THREE.MeshBasicMaterial({ color: CHANNELS[0].hex, fog: false });
    cellMat.color.multiplyScalar(1.2);
    this.weaponGlow.push(cellMat);
    mk(new THREE.BoxGeometry(0.02, 0.035, 0.3), cellMat, [0.075, 0.075, 0.06]);

    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.13, 0.15, 0.46));
    const lines = new THREE.LineSegments(
      eg,
      new THREE.LineBasicMaterial({ color: 0x8f7fff, transparent: true, opacity: 0.55 }),
    );
    lines.position.set(0, 0, 0.05);
    g.add(lines);

    g.position.set(0.3, -0.29, -0.62);
    g.rotation.y = -0.05;
    return g;
  }

  private bindEvents() {
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: true });
    this.canvas.addEventListener("contextmenu", this.onContext);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("blur", this.onBlur);
  }

  private onContext = (e: Event) => e.preventDefault();
  private onBlur = () => {
    this.keys = {};
    this.firing = false;
    if (this.phase === "playing") this.setPhase("paused");
  };

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  };

  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked && this.phase === "playing") this.setPhase("paused");
    if (this.locked && this.phase === "paused") this.setPhase("playing");
    this.emit(true);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.phase !== "playing") return;
    const s = 0.0022 * this.sensitivity;
    this.yaw -= e.movementX * s;
    this.pitch -= e.movementY * s;
    const lim = Math.PI / 2 - 0.06;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    this.sway.x = THREE.MathUtils.clamp(this.sway.x - e.movementX * 0.0007, -0.05, 0.05);
    this.sway.y = THREE.MathUtils.clamp(this.sway.y - e.movementY * 0.0007, -0.04, 0.04);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const c = e.code;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(c)) {
      e.preventDefault();
    }
    if (this.keys[c]) return;
    this.keys[c] = true;

    if (c === "KeyM") {
      this.setMuted(!this.muted);
      return;
    }
    if (this.phase === "menu" && (c === "Enter" || c === "Space")) {
      this.beginRun();
      return;
    }
    if (this.phase === "dead" && (c === "Enter" || c === "KeyR")) {
      this.beginRun();
      return;
    }
    if (c === "KeyP" || c === "Escape") {
      if (this.phase === "playing") this.setPhase("paused");
      else if (this.phase === "paused") this.resume();
      return;
    }
    if (this.phase !== "playing") return;

    if (c === "Digit1") this.setChannel(0);
    if (c === "Digit2") this.setChannel(1);
    if (c === "Digit3") this.setChannel(2);
    if (c === "Digit4") this.setChannel(3);
    if (c === "KeyQ") this.setChannel((this.channel + CHANNEL_COUNT - 1) % CHANNEL_COUNT);
    if (c === "KeyE") this.setChannel((this.channel + 1) % CHANNEL_COUNT);
    if (c === "KeyR") this.tryBurst();
    if (c === "Space" && this.grounded) {
      this.vel.y = 10.2;
      this.grounded = false;
      audio.jump();
    }
    if (c === "ShiftLeft" || c === "ShiftRight") this.tryDash();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.phase !== "playing") return;
    if (!this.locked) {
      this.requestLock();
      return;
    }
    if (e.button === 0) this.firing = true;
    if (e.button === 2) this.tryBurst();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.phase !== "playing") return;
    this.setChannel(
      (this.channel + (e.deltaY > 0 ? 1 : CHANNEL_COUNT - 1)) % CHANNEL_COUNT,
    );
  };

  requestLock() {
    try {
      const r = this.canvas.requestPointerLock() as unknown;
      if (r && typeof (r as Promise<void>).catch === "function") {
        (r as Promise<void>).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------- public API
  setMuted(m: boolean) {
    this.muted = m;
    audio.setMuted(m);
    this.emit(true);
  }

  setSensitivity(v: number) {
    this.sensitivity = v;
    this.emit(true);
  }

  setPhase(p: Phase) {
    this.phase = p;
    this.firing = false;
    if (p !== "playing") this.keys = {};
    this.emit(true);
  }

  resume() {
    if (this.phase !== "paused") return;
    this.setPhase("playing");
    this.requestLock();
  }

  toMenu() {
    this.clearEntities();
    this.phase = "menu";
    this.weapon.visible = false;
    this.emit(true);
  }

  beginRun() {
    audio.resume();
    audio.startDrone();
    this.clearEntities();
    this.hp = this.maxHp = 100;
    this.shield = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.kills = 0;
    this.shots = 0;
    this.hitsLanded = 0;
    this.elapsed = 0;
    this.wave = 0;
    this.saturation = 0.35;
    this.overcharge = 0;
    this.chrono = 0;
    this.timeScale = 1;
    this.hurtFx = 0;
    this.shake = 0;
    this.dashCharges = this.dashMax;
    this.dashRecharge = 0;
    this.invuln = 1.2;
    this.pos.set(0, 0, 12);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI;
    this.pitch = 0;
    this.setChannel(Math.floor(Math.random() * CHANNEL_COUNT), true);
    this.weapon.visible = true;
    this.phase = "playing";
    this.wave = 0;
    this.pendingWave = 1;
    this.intermission = 2.4;
    this.banner("CHROMATIC BREACH", "synchronise your spectrum · survive");
    this.requestLock();
    this.emit(true);
  }

  die() {
    if (this.phase === "dead") return;
    this.phase = "dead";
    this.firing = false;
    this.timeScale = 0.22;
    this.shake = 1.4;
    audio.gameOver();
    audio.setIntensity(0);
    if (this.score > this.best) {
      this.best = Math.round(this.score);
      try {
        localStorage.setItem("prismbreak.best", String(this.best));
      } catch {
        /* ignore */
      }
    }
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.emit(true);
  }

  private clearEntities() {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
      this.disposeObject(e.group);
    }
    this.enemies = [];
    this.boss = null;
    const drop = (m: THREE.Mesh) => {
      this.scene.remove(m);
      (m.material as THREE.Material).dispose();
    };
    for (const b of this.bolts) if (b.active) drop(b.mesh);
    this.bolts = [];
    for (const o of this.orbs) if (o.active) drop(o.mesh);
    this.orbs = [];
    for (const d of this.debris) if (d.active) drop(d.mesh);
    this.debris = [];
    for (const r of this.rings) if (r.active) drop(r.mesh);
    this.rings = [];
    for (const p of this.pickups) {
      if (!p.active) continue;
      this.scene.remove(p.group);
      this.disposeObject(p.group);
    }
    this.pickups = [];
    this.spawnQueue = [];
    this.waveBanner = null;
    this.pickupToast = null;
    this.deathTilt = 0;
    this.lastIntensity = -1;
  }

  // ---------------------------------------------------------------- waves
  private startWave(n: number) {
    this.wave = n;
    const bossWave = n % 5 === 0;
    const q: EnemyKind[] = [];
    if (bossWave) {
      q.push("specter");
      const adds = Math.min(4 + Math.floor(n / 5) * 2, 10);
      for (let i = 0; i < adds; i++) q.push(Math.random() < 0.55 ? "shard" : "weaver");
    } else {
      let budget = 5 + Math.floor(n * 2.3);
      const table: [EnemyKind, number, number][] = [
        ["shard", 1, 3],
        ["weaver", 2, 2],
        ["splitter", 3, 5],
        ["bulwark", 4, 7],
      ];
      let guard = 0;
      while (budget > 0 && guard++ < 80) {
        const avail = table.filter((t) => n >= t[1]);
        const pick = avail[Math.floor(Math.random() * avail.length)];
        q.push(pick[0]);
        budget -= pick[2];
      }
    }
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    if (bossWave) {
      const b = q.shift();
      q.unshift(b as EnemyKind);
    }
    this.spawnQueue = q;
    this.spawnTimer = 0.4;
    this.banner(
      bossWave ? "SPECTER INBOUND" : `WAVE ${n}`,
      bossWave ? "match its shifting colour" : `${q.length} hostiles · chromatic breach`,
    );
    audio.waveStinger(bossWave);
  }

  private banner(title: string, sub: string) {
    this.waveBanner = { title, sub, key: Math.random() };
    this.bannerTimer = 2.1;
  }

  private toast(text: string) {
    this.pickupToast = { text, key: Math.random() };
    this.toastTimer = 1.5;
  }

  // -------------------------------------------------------------- spawning
  private spawnEnemy(kind: EnemyKind) {
    const def = ENEMY_DEFS[kind];
    const isBoss = kind === "specter";
    const w = this.wave;
    const hpScale = isBoss ? 1 + (w / 5 - 1) * 0.55 : 1 + (w - 1) * 0.085;
    const spdScale = 1 + Math.min(0.45, (w - 1) * 0.022);

    // pick a spawn point far from the player
    let sp = this.world.spawnPoints[0];
    for (let i = 0; i < 8; i++) {
      const cand = this.world.spawnPoints[Math.floor(Math.random() * this.world.spawnPoints.length)];
      if (cand.distanceTo(this.pos) > 20) {
        sp = cand;
        break;
      }
      sp = cand;
    }

    const group = new THREE.Group();
    group.position.copy(sp);
    if (isBoss) group.position.y = 6.5;

    const ch = Math.floor(Math.random() * CHANNEL_COUNT);
    const col = channelColor(ch);
    const coreMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(col.hex).multiplyScalar(0.35),
      emissive: new THREE.Color(col.hex),
      emissiveIntensity: 1.25,
      roughness: 0.24,
      metalness: 0.72,
      flatShading: true,
      transparent: true,
      opacity: 1,
    });

    const radius = def.radius * (isBoss ? 1.9 : 1);
    let coreGeo = this.geo.shardCore;
    if (kind === "weaver") coreGeo = this.geo.weaverCore;
    if (kind === "bulwark") coreGeo = this.geo.bulwarkCore;
    if (kind === "splitter") coreGeo = this.geo.splitterCore;
    if (isBoss) coreGeo = this.geo.bossCore;

    const core = new THREE.Mesh(coreGeo, coreMat);
    core.scale.setScalar(radius);
    group.add(core);

    const shellMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(col.hex).multiplyScalar(1.6),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const shell = new THREE.LineSegments(
      new THREE.EdgesGeometry(isBoss ? this.geo.bossShell : coreGeo),
      shellMat,
    );
    shell.scale.setScalar(radius * (isBoss ? 1.06 : 1.42));
    group.add(shell);

    const extras: THREE.Object3D[] = [];
    if (kind === "bulwark" || isBoss) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(col.hex).multiplyScalar(1.9),
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const nRings = isBoss ? 3 : 1;
      for (let i = 0; i < nRings; i++) {
        const ring = new THREE.Mesh(this.geo.torus, ringMat);
        ring.scale.setScalar(radius * (1.5 + i * 0.42));
        ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        group.add(ring);
        extras.push(ring);
      }
    }

    const sightMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(col.hex).multiplyScalar(2.2),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const sightGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ]);
    const sight = new THREE.Line(sightGeo, sightMat);
    sight.frustumCulled = false;
    group.add(sight);

    this.scene.add(group);

    const e: Enemy = {
      kind,
      def,
      group,
      core,
      coreMat,
      shell,
      shellMat,
      extras,
      sight,
      sightMat,
      hp: def.hp * hpScale,
      maxHp: def.hp * hpScale,
      channel: ch,
      pos: group.position,
      vel: new THREE.Vector3(),
      fireTimer: 1 + Math.random() * 2,
      charge: 0,
      hitFlash: 0,
      bob: Math.random() * Math.PI * 2,
      bobSpeed: 0.8 + Math.random() * 1.5,
      strafe: Math.random() < 0.5 ? 1 : -1,
      contactCd: 0,
      isBoss,
      switchTimer: 3.2,
      attackPattern: 0,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.5) * 1.0,
      ),
      baseScale: radius,
      dead: false,
    };
    e.def = { ...def, speed: def.speed * spdScale, orbDamage: def.orbDamage + w * 0.22 };
    this.enemies.push(e);
    if (isBoss) this.boss = e;
    this.spawnRingFx(group.position, ch, isBoss ? 7 : 3);
    return e;
  }

  // ------------------------------------------------------------------ fx
  private spawnRingFx(p: THREE.Vector3, ch: number, scale: number) {
    const col = channelColor(ch);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(col.hex).multiplyScalar(2.2),
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.geo.ring, mat);
    mesh.position.copy(p);
    mesh.lookAt(this.camera.position);
    mesh.scale.setScalar(scale * 0.4);
    this.scene.add(mesh);
    this.rings.push({ mesh, life: 1, maxLife: 1, speed: scale * 5.5, active: true });
  }

  private spawnGroundRing(p: THREE.Vector3, ch: number, scale: number) {
    const col = channelColor(ch);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(col.hex).multiplyScalar(2.4),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.geo.ring, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, 0.09, p.z);
    mesh.scale.setScalar(scale * 0.3);
    this.scene.add(mesh);
    this.rings.push({ mesh, life: 1.1, maxLife: 1.1, speed: scale * 7, active: true });
  }

  private spawnDebris(p: THREE.Vector3, ch: number, count: number, power: number) {
    const col = channelColor(ch);
    for (let i = 0; i < count; i++) {
      if (this.debris.length > 210) break;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(col.hex).multiplyScalar(1.9),
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(this.geo.debris, mat);
      const s = 0.5 + Math.random() * 1.5;
      mesh.scale.setScalar(s);
      mesh.position.copy(p);
      this.scene.add(mesh);
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.9 + 0.15,
        Math.random() - 0.5,
      )
        .normalize()
        .multiplyScalar(power * (0.4 + Math.random()));
      const life = 0.8 + Math.random() * 0.75;
      this.debris.push({
        mesh,
        vel: dir,
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
        ),
        life,
        maxLife: life,
        scale0: s,
        active: true,
      });
    }
  }

  // ------------------------------------------------------------- shooting
  private setChannel(id: number, silent = false) {
    const prev = this.channel;
    this.channel = ((id % CHANNEL_COUNT) + CHANNEL_COUNT) % CHANNEL_COUNT;
    if (this.channel === prev && !silent) return;
    this.world.setChannel(this.channel);
    const col = channelColor(this.channel);
    for (const m of this.weaponGlow) m.color.setHex(col.hex).multiplyScalar(2.0);
    this.chroma.uniforms.uTint.value.setHex(col.hex);
    this.refreshEnemyAppearance();
    if (!silent) {
      audio.shift(this.channel > prev ? 1 : -1, this.channel);
      this.chroma.uniforms.uTintAmt.value = 0.5;
    }
    this.emit(true);
  }

  /** retints every material on an enemy to a new spectrum channel */
  private recolorEnemy(e: Enemy, ch: number) {
    e.channel = ((ch % CHANNEL_COUNT) + CHANNEL_COUNT) % CHANNEL_COUNT;
    const col = channelColor(e.channel);
    e.coreMat.color.setHex(col.hex).multiplyScalar(0.35);
    e.coreMat.emissive.setHex(col.hex);
    e.shellMat.color.setHex(col.hex).multiplyScalar(1.6);
    for (const x of e.extras) {
      ((x as THREE.Mesh).material as THREE.MeshBasicMaterial).color
        .setHex(col.hex)
        .multiplyScalar(1.9);
    }
    e.sightMat.color.setHex(col.hex).multiplyScalar(2.2);
    this.refreshEnemyAppearance();
  }

  private refreshEnemyAppearance() {
    for (const e of this.enemies) {
      const match = e.channel === this.channel || this.overcharge > 0;
      e.coreMat.opacity = match ? 1 : 0.17;
      e.coreMat.depthWrite = match;
      e.coreMat.emissiveIntensity = match ? 1.3 : 0.16;
      e.coreMat.roughness = match ? 0.24 : 0.9;
      e.shellMat.opacity = match ? 0.9 : 0.13;
      for (const x of e.extras) {
        const m = (x as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = match ? 0.75 : 0.09;
      }
    }
  }

  private fire() {
    const over = this.overcharge > 0;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = this.camera.position.clone().addScaledVector(dir, 0.7);
    const right = _v1.crossVectors(dir, UP).normalize();
    origin.addScaledVector(right, 0.17).addScaledVector(UP, -0.15);

    // tiny spread that tightens while stationary
    const moving = this.vel.length() > 3 ? 1 : 0.32;
    const spread = 0.0055 * moving;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    // converge the muzzle onto the crosshair so shots go where you look
    const aimPoint = _v2.copy(this.camera.position).addScaledVector(dir, 60);
    dir.copy(aimPoint).sub(origin).normalize();

    const col = channelColor(this.channel);
    const mat = new THREE.MeshBasicMaterial({
      color: over
        ? new THREE.Color(0xffffff).lerp(new THREE.Color(col.hex), 0.4).multiplyScalar(2.6)
        : new THREE.Color(col.hex).multiplyScalar(2.6),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.geo.bolt, mat);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(UP, dir);
    mesh.scale.setScalar(over ? 1.65 : 1);
    this.scene.add(mesh);
    this.bolts.push({
      mesh,
      vel: dir.clone().multiplyScalar(over ? 190 : 155),
      life: 1.5,
      channel: this.channel,
      dmg: over ? 22 : 12,
      pierce: over ? 2 : 0,
      radius: over ? 0.85 : 0.58,
      active: true,
      chromatic: over,
    });

    this.shots++;
    this.recoil = 1;
    this.shake = Math.min(this.shake + 0.055, 0.4);
    audio.shoot(this.channel, over);
    this.world.flash(origin, _c1.setHex(col.hex), over ? 0.9 : 0.45);
    // horizontal muzzle push (never launches you vertically)
    _v2.set(dir.x, 0, dir.z);
    if (_v2.lengthSq() > 0.001) {
      _v2.normalize();
      this.vel.addScaledVector(_v2, over ? -1.5 : -0.55);
    }
  }

  private tryBurst() {
    if (this.phase !== "playing") return;
    if (this.saturation < 1) {
      audio.dissonance();
      this.chroma.uniforms.uHurt.value = Math.max(this.chroma.uniforms.uHurt.value, 0.12);
      return;
    }
    this.saturation = 0;
    this.overcharge = 7.5;
    this.timeScale = 0.3;
    this.chrono = Math.max(this.chrono, 1.6);
    this.shake = 1.6;
    this.invuln = Math.max(this.invuln, 0.7);
    audio.burst();
    this.world.shockwave();
    this.world.flash(this.camera.position.clone(), _c1.setHex(0xffffff), 3.5);
    this.refreshEnemyAppearance();

    const center = this.camera.position;
    for (const e of this.enemies) {
      const d = e.pos.distanceTo(center);
      if (d < 34) {
        const dmg = 130 * (1 - d / 46);
        this.damageEnemy(e, Math.max(28, dmg), true);
        _v2.copy(e.pos).sub(center).normalize().multiplyScalar(26 * (1 - d / 40));
        e.vel.add(_v2);
      }
    }
    for (const o of this.orbs) {
      if (o.active && o.mesh.position.distanceTo(center) < 30) this.killOrb(o, true);
    }
    this.spawnRingFx(center.clone().addScaledVector(this.camera.getWorldDirection(_v3), 3), 0, 12);
    this.banner("PRISM BURST", "chromatic overcharge engaged");
  }

  private tryDash() {
    if (this.dashCharges <= 0 || this.dashTime > 0) return;
    this.dashCharges--;
    if (this.dashCharges === this.dashMax - 1) this.dashRecharge = 1.5;
    this.dashTime = 0.24;
    this.invuln = Math.max(this.invuln, 0.34);
    const dir = this.moveDir();
    if (dir.lengthSq() < 0.01) this.camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    this.vel.x = dir.x * 36;
    this.vel.z = dir.z * 36;
    if (!this.grounded) this.vel.y = Math.max(this.vel.y, 1.5);
    audio.dash();
    this.chroma.uniforms.uAberr.value = 0.03;
    this.shake = Math.min(this.shake + 0.2, 0.6);
    // dash shatters incoming orbs
    for (const o of this.orbs) {
      if (o.active && o.mesh.position.distanceTo(this.pos.clone().setY(PLAYER_EYE)) < 3.2) {
        this.killOrb(o, true);
        this.score += 12;
      }
    }
    this.spawnRingFx(this.pos.clone().setY(1.1), this.channel, 3);
  }

  private moveDir(out = new THREE.Vector3()) {
    const f = out.set(0, 0, 0);
    const forward = (this.keys["KeyW"] || this.keys["ArrowUp"] ? 1 : 0) -
      (this.keys["KeyS"] || this.keys["ArrowDown"] ? 1 : 0);
    const side = (this.keys["KeyD"] || this.keys["ArrowRight"] ? 1 : 0) -
      (this.keys["KeyA"] || this.keys["ArrowLeft"] ? 1 : 0);
    if (forward) {
      _v1.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      f.addScaledVector(_v1, forward);
    }
    if (side) {
      _v2.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      f.addScaledVector(_v2, side);
    }
    if (f.lengthSq() > 0) f.normalize();
    return f;
  }

  // -------------------------------------------------------------- damage
  private damageEnemy(e: Enemy, dmg: number, chromatic: boolean) {
    if (e.dead) return;
    e.hp -= dmg;
    e.hitFlash = 1;
    this.spawnDebris(e.pos, e.channel, chromatic ? 6 : 3, chromatic ? 9 : 5);
    this.world.flash(e.pos, _c1.setHex(channelColor(e.channel).hex), 0.5);
    if (e.hp <= 0) this.killEnemy(e, chromatic);
    else audio.hit(e.channel);
  }

  private killEnemy(e: Enemy, chromatic: boolean) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this.combo++;
    this.comboTimer = 3.4;
    const mult = this.multiplier();
    this.score += Math.round(e.def.score * mult * (chromatic ? 0.7 : 1));
    this.saturation = Math.min(1, this.saturation + e.def.saturation * (e.isBoss ? 0 : 1));
    this.hp = Math.min(this.maxHp, this.hp + (e.isBoss ? 40 : 2.5));

    audio.kill(e.channel);
    this.spawnDebris(e.pos, e.channel, e.isBoss ? 90 : 22, e.isBoss ? 18 : 9);
    this.spawnGroundRing(e.pos, e.channel, e.isBoss ? 14 : 3.4);
    this.spawnRingFx(e.pos.clone(), e.channel, e.isBoss ? 12 : 4);
    this.world.flash(e.pos.clone(), _c1.setHex(channelColor(e.channel).hex), e.isBoss ? 4 : 1.2);
    this.shake = Math.min(this.shake + (e.isBoss ? 1.5 : 0.16), 1.8);

    if (e.isBoss) {
      this.timeScale = 0.25;
      this.chrono = Math.max(this.chrono, 1.8);
      this.saturation = 1;
      audio.victory();
      this.banner("SPECTER SHATTERED", "spectrum restored · +40 integrity");
      this.boss = null;
      for (let i = 0; i < 3; i++) this.dropPickup(e.pos.clone(), ["hp", "sat", "chrono"][i] as Pickup["type"]);
    } else {
      if (Math.random() < (e.kind === "bulwark" ? 0.3 : 0.11)) {
        const types: Pickup["type"][] = ["hp", "sat", "chrono"];
        this.dropPickup(e.pos.clone(), types[Math.floor(Math.random() * types.length)]);
      }
      if (e.kind === "splitter") {
        const origin = e.pos.clone();
        for (let i = 0; i < 2; i++) {
          const child = this.spawnEnemy("weaver");
          child.pos.copy(origin).add(
            new THREE.Vector3((Math.random() - 0.5) * 3.5, Math.random() * 1.6, (Math.random() - 0.5) * 3.5),
          );
          child.vel.set((Math.random() - 0.5) * 6, 1.5, (Math.random() - 0.5) * 6);
          this.recolorEnemy(child, e.channel);
          child.hp = child.maxHp = 15 + this.wave * 1.6;
        }
      }
    }
    this.scene.remove(e.group);
    this.disposeObject(e.group);
    this.enemies = this.enemies.filter((x) => x !== e);
  }

  /** frees materials + per-instance geometries (shared ones are protected) */
  private disposeObject(root: THREE.Object3D) {
    root.traverse((o) => {
      const m = (o as unknown as THREE.Mesh).material as
        | THREE.Material
        | THREE.Material[]
        | undefined;
      if (m) {
        if (Array.isArray(m)) for (const x of m) x.dispose();
        else m.dispose();
      }
      const g = (o as unknown as THREE.Mesh).geometry;
      if (g && !this.sharedGeo.has(g)) g.dispose();
    });
  }

  private multiplier() {
    return Math.min(8, 1 + Math.floor(this.combo / 2));
  }

  private hurt(dmg: number, from: THREE.Vector3 | null) {
    if (this.invuln > 0 || this.phase !== "playing") return;
    let d = dmg;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, d);
      this.shield -= absorbed;
      d -= absorbed;
    }
    this.hp -= d;
    this.invuln = 0.28;
    this.hurtFx = Math.min(1, this.hurtFx + 0.55 + dmg / 90);
    this.shake = Math.min(this.shake + 0.4 + dmg / 70, 1.6);
    this.combo = 0;
    this.chroma.uniforms.uAberr.value = 0.05;
    audio.hurt();
    if (from) {
      _v1.copy(from).sub(this.pos).setY(0).normalize();
      this.vel.addScaledVector(_v1, -3.2);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
    this.emit(true);
  }

  // ------------------------------------------------------------- pickups
  private dropPickup(p: THREE.Vector3, type: Pickup["type"]) {
    const group = new THREE.Group();
    const color = type === "hp" ? 0xff4d6d : type === "sat" ? 0xffffff : 0x8f7fff;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.2),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const core = new THREE.Mesh(this.geo.pickup, mat);
    group.add(core);
    const ring = new THREE.Mesh(this.geo.torus, mat);
    ring.scale.setScalar(0.85);
    group.add(ring);
    group.position.set(p.x, Math.max(1.2, p.y * 0.6), p.z);
    this.scene.add(group);
    this.pickups.push({ group, type, pos: group.position, life: 18, bob: Math.random() * 6, active: true });
  }

  // ---------------------------------------------------------------- orbs
  private fireOrb(e: Enemy, target: THREE.Vector3, speed: number, dmg: number, homing = 0) {
    const col = channelColor(e.channel);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(col.hex).multiplyScalar(2.6),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.geo.orb, mat);
    mesh.scale.setScalar(e.isBoss ? 1.5 : 1);
    mesh.position.copy(e.pos);
    this.scene.add(mesh);
    const dir = _v1.copy(target).sub(e.pos).normalize();
    this.orbs.push({
      mesh,
      vel: dir.multiplyScalar(speed),
      life: 6,
      dmg,
      radius: e.isBoss ? 0.62 : 0.42,
      active: true,
      homing,
    });
    this.world.flash(e.pos, _c1.setHex(col.hex), 0.45);
  }

  private killOrb(o: Orb, fx: boolean) {
    if (!o.active) return;
    o.active = false;
    if (fx) {
      this.spawnDebris(o.mesh.position, this.channel, 4, 5);
      this.world.flash(o.mesh.position, _c1.setHex(0xffffff), 0.5);
    }
    this.scene.remove(o.mesh);
    (o.mesh.material as THREE.Material).dispose();
  }

  // ----------------------------------------------------------------- loop
  /**
   * Advances the simulation by `seconds` at a fixed 60hz without rendering.
   * Used by the automated play-through harness (no effect on live play).
   */
  debugStep(seconds: number) {
    const fixed = 1 / 60;
    const n = Math.max(1, Math.round(seconds / fixed));
    for (let i = 0; i < n; i++) {
      this.dbgT += fixed;
      this.now = this.dbgT;
      if (this.phase === "menu") this.updateMenu(this.dbgT, fixed);
      else this.update(fixed, this.dbgT);
      this.world.update(this.dbgT, fixed, 0.5);
      this.updatePost(fixed);
    }
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const raw = Math.min(this.clock.getDelta(), 0.05);
    const t = this.dbgT > 0 ? (this.dbgT += raw) : this.clock.elapsedTime;
    this.now = t;

    if (this.phase === "menu") {
      this.updateMenu(t, raw);
    } else {
      this.update(raw, t);
    }

    this.world.update(t, raw, this.phase === "playing" ? Math.min(1, this.enemies.length / 12) : 0.35);
    this.updatePost(raw);
    this.composer.render();

    this.emitAcc += raw;
    if (this.emitAcc > 0.07) {
      this.emitAcc = 0;
      this.emit(false);
    }
  };

  private updateMenu(t: number, dt: number) {
    const r = 27 + Math.sin(t * 0.11) * 7;
    const a = t * 0.085;
    this.camera.position.set(Math.cos(a) * r, 5.2 + Math.sin(t * 0.23) * 2.6, Math.sin(a) * r);
    this.camera.lookAt(0, 2.6, 0);
    this.camera.rotation.z = Math.sin(t * 0.17) * 0.04;
    if (this.enemies.length < 6 && Math.random() < dt * 0.8) {
      const kinds: EnemyKind[] = ["shard", "weaver", "bulwark", "splitter"];
      const e = this.spawnEnemy(kinds[Math.floor(Math.random() * kinds.length)]);
      e.hp = e.maxHp = 1e9;
    }
    for (const e of this.enemies) {
      e.pos.y += Math.sin(t * e.bobSpeed + e.bob) * dt * 0.6;
      e.core.rotation.x += dt * e.spin.x * 0.4;
      e.core.rotation.y += dt * e.spin.y * 0.4;
      e.shell.rotation.y -= dt * 0.5;
      this.moveEnemyToward(e, new THREE.Vector3(Math.cos(t * 0.2) * 12, e.pos.y, Math.sin(t * 0.2) * 12), dt, 0.35);
      if (e.pos.length() > ARENA_RADIUS - 8) {
        e.pos.multiplyScalar((ARENA_RADIUS - 8) / e.pos.length());
      }
    }
    if (this.enemies.length > 6) {
      const old = this.enemies.shift();
      if (old) this.scene.remove(old.group);
    }
    this.chroma.uniforms.uAberr.value = 0.006 + Math.sin(t * 0.7) * 0.002;
    this.chroma.uniforms.uSlow.value = 0;
    this.chroma.uniforms.uHurt.value = 0;
  }

  private update(dt: number, t: number) {
    const playing = this.phase === "playing";

    // ------- time scaling
    if (playing) {
      this.chrono = Math.max(0, this.chrono - dt);
      const targetSlow = this.chrono > 0 ? 0.32 : 1;
      this.timeScale += (targetSlow - this.timeScale) * Math.min(1, dt * 6);
      if (Math.abs(this.timeScale - 1) < 0.01 && this.chrono <= 0) this.timeScale = 1;
    } else if (this.phase === "dead") {
      this.timeScale += (0.16 - this.timeScale) * Math.min(1, dt * 2.4);
    }
    const sdt = dt * this.timeScale;
    const pdt = dt * (0.4 + 0.6 * this.timeScale);
    this.elapsed += playing ? dt : 0;

    if (this.overcharge > 0) {
      this.overcharge = Math.max(0, this.overcharge - dt);
      if (this.overcharge === 0) this.refreshEnemyAppearance();
    }

    // ------- input / firing
    this.fireTimer -= pdt;
    if (playing && this.firing && this.fireTimer <= 0) {
      const rate = this.overcharge > 0 ? 0.085 : 0.125;
      this.fireTimer = rate;
      this.fire();
    }

    // ------- player movement
    if (playing) this.updatePlayer(pdt, dt);
    else this.updateDeadCamera(dt, t);

    // ------- dash recharge
    if (this.dashCharges < this.dashMax) {
      this.dashRecharge -= dt;
      if (this.dashRecharge <= 0) {
        this.dashCharges++;
        this.dashRecharge = this.dashCharges < this.dashMax ? 1.5 : 0;
      }
    }
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0 && this.combo > 0) this.combo = 0;

    // ------- waves
    if (playing) this.updateWaves(dt);

    // ------- entities
    this.updateEnemies(sdt, t, playing);
    this.updateBolts(sdt);
    this.updateOrbs(sdt, playing);
    this.updateDebris(sdt);
    this.updateRings(sdt);
    this.updatePickups(dt, playing);

    // ------- aim feedback
    this.updateAim();

    // ------- camera shake / fov
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.hurtFx = Math.max(0, this.hurtFx - dt * 1.7);
    this.intensityAcc -= dt;
    if (this.intensityAcc <= 0) {
      this.intensityAcc = 0.22;
      const v = THREE.MathUtils.clamp(
        (this.enemies.length / 14) * 0.6 + (this.boss ? 0.45 : 0) + this.combo * 0.02,
        0,
        1,
      );
      if (Math.abs(v - this.lastIntensity) > 0.04) {
        this.lastIntensity = v;
        audio.setIntensity(v);
      }
    }
  }

  private updatePlayer(pdt: number, dt: number) {
    const dir = this.moveDir();
    const speedBase = 9.4;
    const inDash = this.dashTime > 0;
    const targetSpeed = inDash ? 34 : speedBase;
    const accel = this.grounded ? (inDash ? 6 : 74) : 26;

    _v1.set(dir.x * targetSpeed, 0, dir.z * targetSpeed);
    if (!inDash) {
      this.vel.x += (_v1.x - this.vel.x) * Math.min(1, accel * pdt * 0.16);
      this.vel.z += (_v1.z - this.vel.z) * Math.min(1, accel * pdt * 0.16);
    } else {
      this.vel.x *= Math.pow(0.28, dt);
      this.vel.z *= Math.pow(0.28, dt);
    }

    this.vel.y -= GRAVITY * pdt;
    this.pos.addScaledVector(this.vel, pdt);

    if (this.pos.y <= 0) {
      if (!this.grounded && this.vel.y < -8) audio.land();
      this.pos.y = 0;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // arena bounds
    const radial = Math.hypot(this.pos.x, this.pos.z);
    const lim = ARENA_RADIUS - 1.6;
    if (radial > lim) {
      const k = lim / radial;
      this.pos.x *= k;
      this.pos.z *= k;
      this.vel.x *= 0.4;
      this.vel.z *= 0.4;
    }

    // pillar collisions
    for (const c of this.world.colliders) {
      const dx = this.pos.x - c.x;
      const dz = this.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 0.62;
      if (d < min && d > 0.0001) {
        const push = (min - d) / d;
        this.pos.x += dx * push;
        this.pos.z += dz * push;
        this.vel.x += dx * push * 6;
        this.vel.z += dz * push * 6;
      }
    }

    // ------- camera
    const walkSpeed = Math.hypot(this.vel.x, this.vel.z);
    const bobSpeed = Math.min(walkSpeed, 13);
    if (this.grounded) this.bobT += pdt * bobSpeed * 0.85;
    const bobAmt = Math.min(bobSpeed / 10, 1) * (this.grounded ? 1 : 0.2);
    const bobY = Math.sin(this.bobT * 2.1) * 0.045 * bobAmt;
    const bobX = Math.cos(this.bobT * 1.05) * 0.035 * bobAmt;

    const shakeAmt = this.shake * this.shake;
    const sx = (Math.random() - 0.5) * shakeAmt * 0.5;
    const sy = (Math.random() - 0.5) * shakeAmt * 0.5;
    const sr = (Math.random() - 0.5) * shakeAmt * 0.16;

    this.camera.position.set(
      this.pos.x + bobX * 0.4 + sx,
      this.pos.y + PLAYER_EYE + bobY + sy,
      this.pos.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    const lean =
      ((this.keys["KeyA"] ? 1 : 0) - (this.keys["KeyD"] ? 1 : 0)) * 0.026 +
      THREE.MathUtils.clamp(this.vel.x * 0.0016, -0.02, 0.02);
    this.camera.rotateZ(sr + lean + this.sway.x * 0.85);

    // fov
    const targetFov = 78 + (this.dashTime > 0 ? 16 : 0) + Math.min(walkSpeed * 0.35, 4) + this.shake * 3;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 9);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // sway decay
    this.sway.x *= Math.pow(0.0009, dt);
    this.sway.y *= Math.pow(0.0009, dt);

    // ------- weapon viewmodel
    const w = this.weapon;
    this.recoil = Math.max(0, this.recoil - dt * 7.5);
    const rc = this.recoil * this.recoil;
    w.position.set(
      0.3 + this.sway.x * 1.6 + Math.sin(this.bobT * 1.05) * 0.012 * bobAmt,
      -0.29 + this.sway.y * 1.2 - Math.abs(Math.sin(this.bobT * 2.1)) * 0.018 * bobAmt - rc * 0.02,
      -0.62 + rc * 0.16,
    );
    w.rotation.set(rc * 0.16 + this.sway.y * 1.4, -0.05 + this.sway.x * 1.6, -this.sway.x * 2.4 + lean * 6);
    const tip = w.getObjectByName("tip");
    if (tip) {
      tip.rotation.y += dt * 2.6;
      tip.rotation.x += dt * 1.4;
      const s = 1 + rc * 0.9 + (this.overcharge > 0 ? 0.5 + Math.sin(this.now * 22) * 0.22 : 0);
      tip.scale.setScalar(s);
    }
    const r1 = w.getObjectByName("ring1");
    const r2 = w.getObjectByName("ring2");
    if (r1) r1.rotation.z += dt * (3 + this.recoil * 22);
    if (r2) r2.rotation.z -= dt * (2 + this.recoil * 16);

    this.world.playerLight.position.copy(this.camera.position).addScaledVector(
      this.camera.getWorldDirection(_v2),
      1.6,
    );
    this.world.playerLight.intensity =
      34 + (this.overcharge > 0 ? 46 : 0) + this.recoil * 60 + (this.dashTime > 0 ? 70 : 0);
  }

  private updateDeadCamera(dt: number, t: number) {
    this.camera.position.y = Math.max(0.45, this.camera.position.y - dt * 1.25);
    this.deathTilt = Math.min(this.deathTilt + dt * 0.11, 0.6);
    this.camera.rotation.z = this.deathTilt + Math.sin(t * 0.7) * 0.014;
    this.fov += (66 - this.fov) * Math.min(1, dt * 1.6);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this.recoil = Math.max(0, this.recoil - dt * 4);
    this.weapon.position.z = -0.62 + this.recoil * 0.16;
    this.weapon.position.y = Math.max(-0.62, this.weapon.position.y - dt * 0.35);
    this.weapon.rotation.x = Math.min(this.weapon.rotation.x + dt * 0.5, 0.85);
    this.world.playerLight.intensity *= Math.pow(0.2, dt);
  }

  private updateWaves(dt: number) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.waveBanner = null;
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.pickupToast = null;
    }

    if (this.intermission > 0) {
      this.intermission -= dt;
      if (this.intermission <= 0) this.startWave(this.pendingWave);
      return;
    }

    const aliveCap = Math.min(9 + this.wave * 2, 26);
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemies.length < aliveCap) {
        const kind = this.spawnQueue.shift();
        if (kind) this.spawnEnemy(kind);
        this.spawnTimer = Math.max(0.32, 1.5 - this.wave * 0.055);
      }
    } else if (this.enemies.length === 0) {
      // wave cleared
      const cleared = this.wave;
      this.score += 250 * cleared;
      this.hp = Math.min(this.maxHp, this.hp + 14);
      this.shield = Math.min(50, this.shield + 15);
      this.saturation = Math.min(1, this.saturation + 0.18);
      this.banner(`WAVE ${cleared} CLEARED`, "+14 integrity · +15 shield · spectrum bonus");
      audio.waveStinger(false);
      this.pendingWave = cleared + 1;
      this.intermission = 3.4;
    }
  }

  private moveEnemyToward(e: Enemy, target: THREE.Vector3, dt: number, mul = 1) {
    _v1.copy(target).sub(e.pos);
    const dist = _v1.length();
    if (dist < 0.001) return dist;
    _v1.divideScalar(dist);
    const speed = e.def.speed * mul;
    e.vel.x += (_v1.x * speed - e.vel.x) * Math.min(1, dt * 3.4);
    e.vel.z += (_v1.z * speed - e.vel.z) * Math.min(1, dt * 3.4);
    return dist;
  }

  private updateEnemies(dt: number, t: number, playing: boolean) {
    const playerHead = _v3.copy(this.pos).setY(this.pos.y + PLAYER_EYE);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.bob += dt * e.bobSpeed;
      e.hitFlash = Math.max(0, e.hitFlash - dt * 4.5);
      e.contactCd = Math.max(0, e.contactCd - dt);

      // spin + float
      e.core.rotation.x += dt * e.spin.x;
      e.core.rotation.y += dt * e.spin.y;
      e.shell.rotation.y -= dt * (0.5 + e.hitFlash * 3);
      e.shell.rotation.x += dt * 0.32;
      for (let k = 0; k < e.extras.length; k++) {
        const x = e.extras[k];
        x.rotation.x += dt * (0.6 + k * 0.22);
        x.rotation.y += dt * (0.45 - k * 0.13);
      }

      const baseY = e.isBoss ? 6.5 : 1.5 + (e.kind === "weaver" ? 0.5 : 1.1);
      const bobY = Math.sin(e.bob) * (e.kind === "weaver" ? 0.55 : 0.35);

      if (playing) {
        if (e.isBoss) {
          e.switchTimer -= dt;
          if (e.switchTimer <= 0) {
            e.switchTimer = 2.9 + Math.random() * 1.3;
            this.recolorEnemy(
              e,
              e.channel + 1 + Math.floor(Math.random() * (CHANNEL_COUNT - 1)),
            );
            this.spawnRingFx(e.pos.clone(), e.channel, 9);
            audio.shift(1, e.channel);
          }
        }

        // _v4 = vector to player (survives helper calls that clobber _v1/_v2)
        const toPlayer = _v4.copy(playerHead).sub(e.pos);
        const dist = toPlayer.length();
        const perp = _v5.set(-toPlayer.z, 0, toPlayer.x);
        if (perp.lengthSq() > 0.0001) perp.normalize();

        if (e.kind === "weaver") {
          // zig-zag charge
          _v6.copy(toPlayer).normalize().addScaledVector(perp, Math.sin(t * 3 + e.bob) * 0.78);
          e.vel.x += (_v6.x * e.def.speed - e.vel.x) * Math.min(1, dt * 3.6);
          e.vel.z += (_v6.z * e.def.speed - e.vel.z) * Math.min(1, dt * 3.6);
          e.vel.y += ((playerHead.y - 0.6 - e.pos.y) * 2.2 - e.vel.y) * Math.min(1, dt * 2.6);
        } else if (e.isBoss) {
          const want = 20;
          this.moveEnemyToward(e, playerHead, dt, dist > want ? 1 : -0.45);
          e.vel.addScaledVector(perp, e.strafe * 22 * dt);
          e.vel.y += ((6.5 + Math.sin(t * 0.6) * 2.2 - e.pos.y) * 1.6 - e.vel.y) * Math.min(1, dt * 1.6);
          if (Math.random() < dt * 0.12) e.strafe *= -1;
        } else {
          const want = e.def.range;
          if (dist > want + 2) this.moveEnemyToward(e, playerHead, dt, 1);
          else if (dist < want - 3) this.moveEnemyToward(e, playerHead, dt, -0.65);
          else {
            e.vel.x += (perp.x * e.def.speed * 0.7 * e.strafe - e.vel.x) * Math.min(1, dt * 2.6);
            e.vel.z += (perp.z * e.def.speed * 0.7 * e.strafe - e.vel.z) * Math.min(1, dt * 2.6);
            if (Math.random() < dt * 0.25) e.strafe *= -1;
          }
          e.vel.y +=
            ((baseY + bobY + Math.sin(t * 0.5 + e.bob) * 0.6 - e.pos.y) * 2.4 - e.vel.y) *
            Math.min(1, dt * 2.2);
        }

        // separation
        for (let j = 0; j < this.enemies.length; j++) {
          if (j === i) continue;
          const o = this.enemies[j];
          const d = e.pos.distanceTo(o.pos);
          const minD = e.baseScale + o.baseScale + 0.9;
          if (d < minD && d > 0.001) {
            _v6.copy(e.pos).sub(o.pos).divideScalar(d);
            e.vel.addScaledVector(_v6, (minD - d) * 44 * dt);
          }
        }

        // pillar avoidance
        for (const c of this.world.colliders) {
          const dx = e.pos.x - c.x;
          const dz = e.pos.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + e.baseScale + 0.5;
          if (d < min && d > 0.001) {
            e.vel.x += (dx / d) * (min - d) * 9 * dt * 6;
            e.vel.z += (dz / d) * (min - d) * 9 * dt * 6;
          }
        }

        // firing
        if (e.def.fireCd > 0) {
          const inRange = dist < (e.isBoss ? 60 : 46);
          if (e.charge > 0) {
            e.charge -= dt * 1.9;
            if (e.charge <= 0) {
              e.charge = 0;
              if (e.isBoss) {
                e.attackPattern = (e.attackPattern + 1) % 3;
                if (e.attackPattern === 0) {
                  for (let k = 0; k < 11; k++) {
                    const a = (k / 11) * Math.PI * 2 + t;
                    const dirp = new THREE.Vector3(Math.cos(a), (Math.random() - 0.5) * 0.35, Math.sin(a));
                    const target = e.pos.clone().addScaledVector(dirp, 30);
                    this.fireOrb(e, target, e.def.orbSpeed, e.def.orbDamage);
                  }
                } else if (e.attackPattern === 1) {
                  for (let k = 0; k < 3; k++) {
                    this.fireOrb(e, playerHead.clone(), e.def.orbSpeed * 0.8, e.def.orbDamage, 1.6);
                  }
                } else {
                  if (this.enemies.length < 22) {
                    for (let k = 0; k < 2; k++) {
                      const add = this.spawnEnemy(Math.random() < 0.5 ? "shard" : "weaver");
                      add.pos
                        .copy(e.pos)
                        .add(
                          new THREE.Vector3(
                            (Math.random() - 0.5) * 7,
                            -1.5,
                            (Math.random() - 0.5) * 7,
                          ),
                        );
                      this.recolorEnemy(add, e.channel);
                    }
                  }
                  this.fireOrb(e, playerHead.clone(), e.def.orbSpeed * 1.2, e.def.orbDamage);
                }
              } else if (e.kind === "bulwark") {
                for (let k = -1; k <= 1; k++) {
                  const aim = playerHead.clone();
                  _v2.copy(aim).sub(e.pos).normalize();
                  const perp = new THREE.Vector3(-_v2.z, 0, _v2.x).multiplyScalar(k * 0.16);
                  this.fireOrb(e, e.pos.clone().addScaledVector(_v2.add(perp).normalize(), 40), e.def.orbSpeed, e.def.orbDamage);
                }
              } else {
                this.fireOrb(e, playerHead.clone(), e.def.orbSpeed, e.def.orbDamage);
              }
              e.fireTimer = e.def.fireCd * (0.75 + Math.random() * 0.6);
            }
          } else {
            e.fireTimer -= dt;
            if (e.fireTimer <= 0 && inRange) {
              e.charge = 1;
              e.fireTimer = 0.55;
            }
          }
        }

        // contact damage
        const cd = dist - e.baseScale;
        if (cd < 1.05 && e.contactCd <= 0 && this.dashTime <= 0) {
          e.contactCd = 0.8;
          this.hurt(e.def.contactDamage, e.pos);
          e.vel.addScaledVector(_v1.copy(e.pos).sub(playerHead).setY(0).normalize(), 9);
        }
      }

      e.pos.addScaledVector(e.vel, dt);

      // keep in the arena
      const rad = Math.hypot(e.pos.x, e.pos.z);
      const limR = ARENA_RADIUS - (e.isBoss ? 6 : 2.2);
      if (rad > limR) {
        const k = limR / rad;
        e.pos.x *= k;
        e.pos.z *= k;
        e.vel.x *= -0.35;
        e.vel.z *= -0.35;
      }
      e.pos.y = Math.max(0.7, Math.min(e.pos.y, e.isBoss ? 16 : 12));

      // charge telegraph visuals
      const charging = e.charge > 0;
      const match = e.channel === this.channel || this.overcharge > 0;
      const pulse = charging ? 0.5 + 0.5 * Math.sin(t * 30) : 0;
      e.coreMat.emissiveIntensity =
        (match ? 1.25 : 0.16) + e.hitFlash * 3.2 + pulse * (match ? 1.5 : 0.1);
      const s = e.baseScale * (1 + e.hitFlash * 0.16 + pulse * 0.12);
      e.core.scale.setScalar(s);
      e.shell.scale.setScalar(s * (e.isBoss ? 1.06 : 1.42) * (1 - e.hitFlash * 0.05));
      if (e.hitFlash > 0.01) {
        e.coreMat.color.setRGB(1, 1, 1);
      } else {
        e.coreMat.color.setHex(channelColor(e.channel).hex).multiplyScalar(0.35);
      }

      // laser sight during charge
      if (charging && e.def.fireCd > 0) {
        const dirp = _v1.copy(playerHead).sub(e.pos).normalize();
        const posAttr = e.sight.geometry.getAttribute("position") as THREE.BufferAttribute;
        posAttr.setXYZ(0, 0, 0, 0);
        const len = Math.min(70, e.pos.distanceTo(playerHead));
        posAttr.setXYZ(1, dirp.x * len, dirp.y * len, dirp.z * len);
        posAttr.needsUpdate = true;
        e.sightMat.opacity = (1 - e.charge) * (match ? 0.55 : 0.12);
      } else {
        e.sightMat.opacity = 0;
      }
    }
  }

  private collidesWithWorld(p: THREE.Vector3, r: number) {
    if (Math.hypot(p.x, p.z) > ARENA_RADIUS - 0.4) return true;
    for (const c of this.world.colliders) {
      if (Math.hypot(p.x - c.x, p.z - c.z) < c.r + r) return true;
    }
    return false;
  }

  private updateBolts(dt: number) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      if (!b.active) continue;
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      const p = b.mesh.position;

      const fresh = b.life > 1.42; // muzzle grace so point-blank cover can't eat your own shot
      let remove = b.life <= 0 || (!fresh && (p.y < 0.05 || this.collidesWithWorld(p, b.radius)));

      if (!remove) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d = p.distanceTo(e.pos);
          if (d < e.baseScale * 1.28 + b.radius) {
            const match = e.channel === b.channel || b.chromatic;
            if (match) {
              this.hitsLanded++;
              this.damageEnemy(e, b.dmg, b.chromatic);
              if (b.pierce > 0) {
                b.pierce--;
                b.dmg *= 0.72;
              } else {
                remove = true;
              }
            } else {
              // dissonance: wrong colour, bolt fizzles
              audio.dissonance();
              this.spawnDebris(p, b.channel, 5, 4);
              this.world.flash(p, _c1.setHex(channelColor(b.channel).hex), 0.4);
              this.chroma.uniforms.uAberr.value = Math.max(this.chroma.uniforms.uAberr.value, 0.014);
              remove = true;
            }
            if (remove) break;
          }
        }
      }

      if (remove) {
        b.active = false;
        this.spawnDebris(p, b.channel, 3, 4);
        this.world.flash(p, _c1.setHex(channelColor(b.channel).hex), 0.4);
        this.scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.bolts.splice(i, 1);
      }
    }
  }

  private updateOrbs(dt: number, playing: boolean) {
    const head = _v3.copy(this.pos).setY(this.pos.y + PLAYER_EYE);
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      if (!o.active) continue;
      o.life -= dt;
      if (o.homing > 0 && playing) {
        o.homing -= dt;
        _v1.copy(head).sub(o.mesh.position).normalize();
        o.vel.lerp(_v1.multiplyScalar(o.vel.length()), Math.min(1, dt * 1.9));
      }
      o.mesh.position.addScaledVector(o.vel, dt);
      o.mesh.rotation.x += dt * 4;
      o.mesh.rotation.y += dt * 3;

      const dHead = o.mesh.position.distanceTo(head);
      const dBody = Math.hypot(o.mesh.position.x - this.pos.x, o.mesh.position.z - this.pos.z);
      let hit = false;
      if (playing && dHead < o.radius + 0.62 && this.dashTime <= 0 && this.invuln <= 0) hit = true;
      if (playing && dBody < o.radius + 0.55 && o.mesh.position.y < 1.9 && this.dashTime <= 0 && this.invuln <= 0)
        hit = true;

      if (hit) {
        this.hurt(o.dmg, o.mesh.position);
        this.killOrb(o, true);
        this.orbs.splice(i, 1);
        continue;
      }

      if (o.life <= 0 || o.mesh.position.y < 0.06 || this.collidesWithWorld(o.mesh.position, o.radius)) {
        this.spawnDebris(o.mesh.position, this.channel, 4, 4);
        this.world.flash(o.mesh.position, _c1.copy((o.mesh.material as THREE.MeshBasicMaterial).color), 0.5);
        this.killOrb(o, false);
        this.orbs.splice(i, 1);
      }
    }
  }

  private updateDebris(dt: number) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        (d.mesh.material as THREE.Material).dispose();
        this.debris.splice(i, 1);
        continue;
      }
      d.vel.y -= 13 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      if (d.mesh.position.y < 0.1) {
        d.mesh.position.y = 0.1;
        d.vel.y *= -0.42;
        d.vel.x *= 0.7;
        d.vel.z *= 0.7;
      }
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      const mat = d.mesh.material as THREE.MeshBasicMaterial;
      const k = Math.max(0, d.life / d.maxLife);
      mat.opacity = k * k;
      d.mesh.scale.setScalar(Math.max(0.02, d.scale0 * k));
    }
  }

  private updateRings(dt: number) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const k = r.life / r.maxLife;
      r.mesh.scale.addScalar(dt * r.speed);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = k * k;
    }
  }

  private updatePickups(dt: number, playing: boolean) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      p.bob += dt * 2.2;
      p.group.rotation.y += dt * 1.8;
      p.group.children[1].rotation.x += dt * 2.4;
      p.group.position.y = Math.max(1.1, p.pos.y + Math.sin(p.bob) * 0.3);
      const mat = (p.group.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = p.life < 4 ? 0.35 + 0.6 * Math.abs(Math.sin(p.life * 8)) : 0.95;

      if (playing && p.group.position.distanceTo(this.pos.clone().setY(PLAYER_EYE * 0.7)) < 2.1) {
        if (p.type === "hp") {
          this.hp = Math.min(this.maxHp, this.hp + 28);
          this.toast("+28 INTEGRITY");
        } else if (p.type === "sat") {
          this.saturation = Math.min(1, this.saturation + 0.45);
          this.toast("+45% SATURATION");
        } else {
          this.chrono = Math.max(this.chrono, 5);
          this.toast("CHRONO FIELD · 5s");
        }
        this.shield = Math.min(60, this.shield + 8);
        audio.pickup();
        this.spawnRingFx(p.group.position.clone(), this.channel, 2.4);
        this.scene.remove(p.group);
        this.disposeObject(p.group);
        this.pickups.splice(i, 1);
        continue;
      }
      if (p.life <= 0) {
        this.scene.remove(p.group);
        this.disposeObject(p.group);
        this.pickups.splice(i, 1);
      }
    }
  }

  private updateAim() {
    const dir = this.camera.getWorldDirection(_v1);
    const origin = this.camera.position;
    let best: 0 | 1 | 2 = 0;
    let bestT = Infinity;
    for (const e of this.enemies) {
      _v2.copy(e.pos).sub(origin);
      const proj = _v2.dot(dir);
      if (proj < 0.5 || proj > bestT) continue;
      const perp = _v2.lengthSq() - proj * proj;
      const r = e.baseScale * 1.25 + 0.2;
      if (perp < r * r) {
        bestT = proj;
        best = e.channel === this.channel || this.overcharge > 0 ? 1 : 2;
      }
    }
    this.aimState = best;
  }

  private updatePost(dt: number) {
    const u = this.chroma.uniforms;
    u.uTime.value = this.now;
    u.uHurt.value = Math.max(this.hurtFx * 0.55, u.uHurt.value * Math.pow(0.02, dt));
    u.uAberr.value = Math.max(
      this.dashTime > 0 ? 0.035 : 0.0025,
      u.uAberr.value * Math.pow(0.0025, dt) + this.shake * 0.012,
    );
    u.uTintAmt.value = Math.max(0, u.uTintAmt.value * Math.pow(0.0015, dt));
    u.uSlow.value += ((this.timeScale < 0.9 ? 1 - this.timeScale : 0) - u.uSlow.value) * Math.min(1, dt * 5);
    u.uVig.value = 0.82 + (1 - this.hp / this.maxHp) * 0.18;
    this.bloom.strength = 0.88 + (this.overcharge > 0 ? 0.5 : 0) + this.shake * 0.3;
  }

  // --------------------------------------------------------------- emit
  private emit(force = false) {
    if (this.disposed) return;
    const snap: Snapshot = {
      phase: this.phase,
      locked: this.locked,
      hp: Math.max(0, Math.round(this.hp)),
      maxHp: this.maxHp,
      shield: Math.round(this.shield),
      score: Math.round(this.score),
      best: Math.round(this.best),
      combo: this.combo,
      mult: this.multiplier(),
      comboTime: THREE.MathUtils.clamp(this.comboTimer / 3.4, 0, 1),
      wave: this.wave,
      waveBanner: this.waveBanner,
      enemiesLeft: this.enemies.length + this.spawnQueue.length,
      channel: this.channel,
      saturation: this.saturation,
      overcharge: this.overcharge,
      dashCharges: this.dashCharges,
      dashMax: this.dashMax,
      dashRecharge: this.dashCharges < this.dashMax ? 1 - THREE.MathUtils.clamp(this.dashRecharge / 1.5, 0, 1) : 1,
      kills: this.kills,
      accuracy: this.shots > 0 ? this.hitsLanded / this.shots : 0,
      elapsed: this.elapsed,
      boss: this.boss
        ? {
            hp: Math.max(0, this.boss.hp),
            max: this.boss.maxHp,
            channel: this.boss.channel,
            name: "SPECTER",
          }
        : null,
      aim: this.aimState,
      hurt: this.hurtFx,
      slowmo: 1 - this.timeScale,
      muted: this.muted,
      sensitivity: this.sensitivity,
      pickupToast: this.pickupToast,
    };
    void force;
    this.onSnap(snap);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("blur", this.onBlur);
    audio.dispose();
    this.clearEntities();
    this.world.dispose();
    Object.values(this.geo).forEach((g) => g.dispose());
    this.composer.dispose();
    this.renderer.dispose();
  }
}


