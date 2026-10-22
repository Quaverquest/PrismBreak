import * as THREE from "three";
import { ARENA_RADIUS, CHANNELS, channelColor } from "./config";

export interface Collider {
  x: number;
  z: number;
  r: number;
}

export interface World {
  group: THREE.Group;
  colliders: Collider[];
  spawnPoints: THREE.Vector3[];
  playerLight: THREE.PointLight;
  setChannel: (id: number) => void;
  shockwave: () => void;
  flash: (pos: THREE.Vector3, color: THREE.Color, power: number) => void;
  update: (t: number, dt: number, intensity: number) => void;
  dispose: () => void;
}

const FLOOR_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FLOOR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uShock;
  uniform float uShockAmp;
  uniform float uRadius;
  uniform float uIntensity;
  uniform vec3 uColor;
  uniform vec3 uColorB;
  varying vec3 vWorld;

  float gridLine(vec2 p, float cell, float w) {
    vec2 c = p / cell;
    vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    float l = min(g.x, g.y);
    return 1.0 - clamp(l / w, 0.0, 1.0);
  }

  void main() {
    vec2 p = vWorld.xz;
    float d = length(p);

    float fine = gridLine(p, 2.0, 1.05);
    float coarse = gridLine(p, 10.0, 1.5);

    float rings = pow(max(sin(d * 0.5 - uTime * 1.3), 0.0), 14.0);
    float ang = atan(p.y, p.x);
    float sweep = fract(ang / 6.2831853 + uTime * 0.045);
    float wedge = pow(1.0 - sweep, 26.0);

    vec3 col = uColor * (0.085 + fine * 0.30);
    col += uColorB * coarse * (0.55 + uIntensity * 0.35);
    col += uColor * rings * 0.30;
    col += uColorB * wedge * 0.32 * smoothstep(uRadius, uRadius * 0.15, d);

    float sr = d - uShock;
    col += uColorB * exp(-sr * sr * 0.05) * uShockAmp * 3.0;

    float fade = 1.0 - smoothstep(uRadius * 0.62, uRadius, d);
    col *= 0.35 + 0.65 * fade;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uTint;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.42, 0.98, h));

    float band = exp(-abs(d.y) * 7.5);
    col += uTint * band * (0.10 + 0.05 * sin(uTime * 0.4));

    vec3 cell = floor(d * 150.0);
    float n = hash(cell);
    float tw = 0.55 + 0.45 * sin(uTime * 2.4 + n * 90.0);
    col += step(0.9972, n) * tw * vec3(0.85, 0.9, 1.0) * smoothstep(0.45, 0.75, h);

    float halo = pow(max(0.0, 1.0 - abs(d.y - 0.06) * 5.0), 3.0);
    col += uTint * halo * 0.07;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function rnd(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function buildWorld(scene: THREE.Scene): World {
  const group = new THREE.Group();
  scene.add(group);

  const colliders: Collider[] = [];
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  const track = <T extends THREE.BufferGeometry | THREE.Material>(x: T) => {
    disposables.push(x);
    return x;
  };

  const c0 = new THREE.Color(channelColor(0).hex);
  const c1 = new THREE.Color(0x6a4bff);

  // ---------------------------------------------------------------- sky dome
  const skyGeo = track(new THREE.SphereGeometry(420, 40, 24));
  const skyMat = track(
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uHorizon: { value: new THREE.Color(0x150f31) },
        uZenith: { value: new THREE.Color(0x04030c) },
        uTint: { value: new THREE.Color(0x3a2a8a) },
      },
    }) as THREE.Material,
  ) as THREE.ShaderMaterial;
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  group.add(sky);

  // ------------------------------------------------------------------ floor
  const floorGeo = track(new THREE.CircleGeometry(ARENA_RADIUS, 128));
  const floorMat = track(
    new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uShock: { value: -999 },
        uShockAmp: { value: 0 },
        uRadius: { value: ARENA_RADIUS },
        uIntensity: { value: 0 },
        uColor: { value: c0.clone() },
        uColorB: { value: c1.clone() },
      },
    }) as THREE.Material,
  ) as THREE.ShaderMaterial;
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  group.add(floor);

  // abyss plate below the arena so the void reads as depth, not emptiness
  const abyssGeo = track(new THREE.CircleGeometry(ARENA_RADIUS * 5, 48));
  const abyssMat = track(
    new THREE.MeshBasicMaterial({ color: 0x05040d, fog: false }),
  ) as THREE.Material;
  const abyss = new THREE.Mesh(abyssGeo, abyssMat);
  abyss.rotation.x = -Math.PI / 2;
  abyss.position.y = -14;
  group.add(abyss);

  // -------------------------------------------------------------- arena rim
  const rimGeo = track(new THREE.TorusGeometry(ARENA_RADIUS, 0.28, 8, 160));
  const rimMat = track(
    new THREE.MeshBasicMaterial({ color: c0.clone(), fog: false }),
  ) as THREE.MeshBasicMaterial;
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.3;
  group.add(rim);

  const rim2Geo = track(new THREE.TorusGeometry(ARENA_RADIUS + 2.6, 0.1, 6, 160));
  const rim2Mat = track(
    new THREE.MeshBasicMaterial({ color: c1.clone(), fog: false, transparent: true, opacity: 0.7 }),
  ) as THREE.MeshBasicMaterial;
  const rim2 = new THREE.Mesh(rim2Geo, rim2Mat);
  rim2.rotation.x = -Math.PI / 2;
  rim2.position.y = 0.14;
  group.add(rim2);

  // ------------------------------------------- perimeter spectrum light bars
  const beams: THREE.Mesh[] = [];
  const beamGeo = track(new THREE.BoxGeometry(0.22, 1, 0.22));
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const ch = CHANNELS[i % CHANNELS.length];
    const h = 9 + Math.sin(i * 1.7) * 5 + (i % 3) * 2.5;
    const mat = track(
      new THREE.MeshBasicMaterial({
        color: ch.hex,
        transparent: true,
        opacity: 0.5,
        fog: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ) as THREE.MeshBasicMaterial;
    const m = new THREE.Mesh(beamGeo, mat);
    m.position.set(Math.cos(a) * (ARENA_RADIUS + 1.4), h / 2, Math.sin(a) * (ARENA_RADIUS + 1.4));
    m.scale.y = h;
    m.userData.phase = i * 0.4;
    m.userData.base = 0.34 + (i % 4) * 0.06;
    group.add(m);
    beams.push(m);
  }

  // ---------------------------------------------------------------- pillars
  const pillarMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1b1738,
      roughness: 0.42,
      metalness: 0.55,
      flatShading: true,
    }),
  ) as THREE.MeshStandardMaterial;
  const edgeMat = track(
    new THREE.LineBasicMaterial({
      color: c0.clone(),
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  ) as THREE.LineBasicMaterial;
  const capMat = track(
    new THREE.MeshBasicMaterial({ color: c0.clone(), fog: false }),
  ) as THREE.MeshBasicMaterial;

  const pillarGeoCache = new Map<string, THREE.CylinderGeometry>();
  const getPillarGeo = (r: number, h: number) => {
    const key = `${r.toFixed(2)}_${h.toFixed(2)}`;
    let g = pillarGeoCache.get(key);
    if (!g) {
      g = new THREE.CylinderGeometry(r, r * 1.12, h, 6, 1);
      pillarGeoCache.set(key, g);
      track(g);
    }
    return g;
  };

  const placed: Collider[] = [];
  let guard = 0;
  while (placed.length < 17 && guard++ < 900) {
    const a = Math.random() * Math.PI * 2;
    const rad = rnd(9, ARENA_RADIUS - 6);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const r = rnd(1.1, 2.5);
    if (Math.hypot(x, z) < 7.5) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 4.5)) continue;
    const h = rnd(4.5, 12.5);
    const geo = getPillarGeo(r, h);
    const m = new THREE.Mesh(geo, pillarMat);
    m.position.set(x, h / 2, z);
    m.rotation.y = Math.random() * Math.PI;
    group.add(m);

    const eg = track(new THREE.EdgesGeometry(geo));
    const lines = new THREE.LineSegments(eg, edgeMat);
    lines.position.copy(m.position);
    lines.rotation.copy(m.rotation);
    group.add(lines);

    const capGeo = track(new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.16, 6));
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(x, h + 0.02, z);
    cap.rotation.y = m.rotation.y;
    group.add(cap);

    const c = { x, z, r: r * 1.15 };
    placed.push(c);
    colliders.push(c);
  }

  // ------------------------------------------------------- low cover blocks
  const crateMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x241d47,
      roughness: 0.6,
      metalness: 0.3,
      flatShading: true,
    }),
  ) as THREE.MeshStandardMaterial;
  const crateGeo = track(new THREE.BoxGeometry(1, 1, 1));
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const rad = rnd(6, ARENA_RADIUS - 4);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    if (Math.hypot(x, z) < 6.5) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 3)) continue;
    const w = rnd(1.8, 3.4);
    const h = rnd(1.1, 2.2);
    const d = rnd(1.8, 3.4);
    const m = new THREE.Mesh(crateGeo, crateMat);
    m.scale.set(w, h, d);
    m.position.set(x, h / 2, z);
    m.rotation.y = Math.random() * Math.PI;
    group.add(m);
    const eg = track(new THREE.EdgesGeometry(crateGeo));
    const lines = new THREE.LineSegments(eg, edgeMat);
    lines.scale.copy(m.scale);
    lines.position.copy(m.position);
    lines.rotation.copy(m.rotation);
    group.add(lines);
    colliders.push({ x, z, r: Math.max(w, d) * 0.62 });
  }

  // --------------------------------------- floating shards (ambient life)
  const floaters: { mesh: THREE.Mesh; base: number; sp: number; amp: number }[] = [];
  const floaterGeo = track(new THREE.TetrahedronGeometry(1, 0));
  const floaterMat = track(
    new THREE.MeshBasicMaterial({
      color: c1.clone(),
      wireframe: true,
      transparent: true,
      opacity: 0.4,
      fog: false,
    }),
  ) as THREE.MeshBasicMaterial;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const rad = rnd(6, ARENA_RADIUS + 12);
    const s = rnd(0.5, 2.1);
    const m = new THREE.Mesh(floaterGeo, floaterMat);
    m.scale.setScalar(s);
    const base = rnd(6, 30);
    m.position.set(Math.cos(a) * rad, base, Math.sin(a) * rad);
    group.add(m);
    floaters.push({ mesh: m, base, sp: rnd(0.3, 1.1), amp: rnd(0.6, 2.4) });
  }

  // ------------------------------------------------ overhead prism crown
  const crownGeo = track(new THREE.IcosahedronGeometry(34, 1));
  const crownMat = track(
    new THREE.MeshBasicMaterial({
      color: c0.clone(),
      wireframe: true,
      transparent: true,
      opacity: 0.16,
      fog: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  ) as THREE.MeshBasicMaterial;
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.position.y = 62;
  crown.scale.y = 0.55;
  group.add(crown);

  // ----------------------------------------------------------------- lights
  scene.add(new THREE.HemisphereLight(0x4b3a9a, 0x08060f, 1.5));
  const dir = new THREE.DirectionalLight(0xbfa8ff, 1.1);
  dir.position.set(18, 42, -12);
  scene.add(dir);

  const rimLights: THREE.PointLight[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    const pl = new THREE.PointLight(CHANNELS[i].hex, 900, 90, 2);
    pl.position.set(Math.cos(a) * (ARENA_RADIUS - 8), 12, Math.sin(a) * (ARENA_RADIUS - 8));
    scene.add(pl);
    rimLights.push(pl);
  }

  const playerLight = new THREE.PointLight(c0.getHex(), 55, 26, 2);
  scene.add(playerLight);

  const flashLight = new THREE.PointLight(0xffffff, 0, 34, 2);
  scene.add(flashLight);
  let flashLife = 0;
  let flashPeak = 0;

  // ------------------------------------------------------------- spawn ring
  const spawnPoints: THREE.Vector3[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    spawnPoints.push(
      new THREE.Vector3(Math.cos(a) * (ARENA_RADIUS - 9), rnd(1.6, 5), Math.sin(a) * (ARENA_RADIUS - 9)),
    );
  }

  let shockR = -999;
  let shockAmp = 0;

  const world: World = {
    group,
    colliders,
    spawnPoints,
    playerLight,
    setChannel(id: number) {
      const col = new THREE.Color(channelColor(id).hex);
      floorMat.uniforms.uColor.value.copy(col);
      floorMat.uniforms.uColorB.value.copy(col).lerp(new THREE.Color(0xffffff), 0.22);
      rimMat.color.copy(col);
      rim2Mat.color.copy(col).multiplyScalar(0.7);
      edgeMat.color.copy(col);
      capMat.color.copy(col);
      floaterMat.color.copy(col).lerp(new THREE.Color(0x8f7fff), 0.5);
      crownMat.color.copy(col);
      skyMat.uniforms.uTint.value.copy(col).multiplyScalar(0.5);
      playerLight.color.copy(col);
    },
    shockwave() {
      shockR = 0;
      shockAmp = 1;
    },
    flash(pos, color, power) {
      flashLight.position.copy(pos);
      flashLight.color.copy(color);
      flashPeak = power;
      flashLife = 1;
    },
    update(t, dt, intensity) {
      floorMat.uniforms.uTime.value = t;
      floorMat.uniforms.uIntensity.value = intensity;
      skyMat.uniforms.uTime.value = t;

      if (shockAmp > 0.001) {
        shockR += dt * 62;
        shockAmp *= Math.pow(0.12, dt);
        floorMat.uniforms.uShock.value = shockR;
        floorMat.uniforms.uShockAmp.value = shockAmp;
      } else if (shockAmp !== 0) {
        shockAmp = 0;
        floorMat.uniforms.uShockAmp.value = 0;
        floorMat.uniforms.uShock.value = -999;
      }

      if (flashLife > 0) {
        flashLife = Math.max(0, flashLife - dt * 5.5);
        flashLight.intensity = flashPeak * flashLife * flashLife * 260;
      }

      crown.rotation.y += dt * 0.045;
      crown.rotation.x = Math.sin(t * 0.12) * 0.06;
      crown.position.y = 62 + Math.sin(t * 0.3) * 1.6;

      for (const f of floaters) {
        f.mesh.rotation.x += dt * f.sp * 0.5;
        f.mesh.rotation.y += dt * f.sp * 0.35;
        f.mesh.position.y = f.base + Math.sin(t * f.sp + f.amp) * f.amp;
      }

      for (const b of beams) {
        const mat = b.material as THREE.MeshBasicMaterial;
        mat.opacity =
          b.userData.base + Math.sin(t * 1.6 + b.userData.phase) * 0.16 + intensity * 0.2;
      }

      rim.rotation.z += dt * 0.06;
      rim2.rotation.z -= dt * 0.1;

      for (let i = 0; i < rimLights.length; i++) {
        rimLights[i].intensity = 700 + Math.sin(t * 0.8 + i * 2.1) * 260 + intensity * 500;
      }
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      pillarGeoCache.clear();
      scene.remove(group);
    },
  };

  world.setChannel(0);
  return world;
}
