import * as THREE from "three";

export interface Channel {
  id: number;
  name: string;
  glyph: string;
  hex: number;
  css: string;
  /** musical root used by the synth voice for this colour */
  tone: number;
}

export const CHANNELS: Channel[] = [
  { id: 0, name: "CYAN", glyph: "▲", hex: 0x25e6ff, css: "#25e6ff", tone: 523.25 },
  { id: 1, name: "MAGENTA", glyph: "◆", hex: 0xff2f9e, css: "#ff2f9e", tone: 415.3 },
  { id: 2, name: "AMBER", glyph: "●", hex: 0xffb020, css: "#ffb020", tone: 622.25 },
  { id: 3, name: "LIME", glyph: "■", hex: 0xa6ff3d, css: "#a6ff3d", tone: 698.46 },
];

export const CHANNEL_COUNT = CHANNELS.length;

export const ARENA_RADIUS = 46;
export const PLAYER_EYE = 1.75;
export const GRAVITY = 26;

export type EnemyKind = "shard" | "weaver" | "bulwark" | "splitter" | "specter";

export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  radius: number;
  speed: number;
  score: number;
  /** preferred distance from the player */
  range: number;
  /** seconds between shots, 0 = contact damage only */
  fireCd: number;
  orbSpeed: number;
  orbDamage: number;
  contactDamage: number;
  saturation: number;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  shard: {
    kind: "shard",
    hp: 34,
    radius: 0.95,
    speed: 4.4,
    score: 100,
    range: 15,
    fireCd: 2.3,
    orbSpeed: 19,
    orbDamage: 11,
    contactDamage: 10,
    saturation: 0.16,
  },
  weaver: {
    kind: "weaver",
    hp: 20,
    radius: 0.72,
    speed: 9.6,
    score: 140,
    range: 0,
    fireCd: 0,
    orbSpeed: 0,
    orbDamage: 0,
    contactDamage: 15,
    saturation: 0.13,
  },
  bulwark: {
    kind: "bulwark",
    hp: 120,
    radius: 1.7,
    speed: 2.5,
    score: 260,
    range: 21,
    fireCd: 3.1,
    orbSpeed: 15,
    orbDamage: 16,
    contactDamage: 18,
    saturation: 0.3,
  },
  splitter: {
    kind: "splitter",
    hp: 55,
    radius: 1.25,
    speed: 5.2,
    score: 180,
    range: 12,
    fireCd: 2.8,
    orbSpeed: 17,
    orbDamage: 10,
    contactDamage: 12,
    saturation: 0.2,
  },
  specter: {
    kind: "specter",
    hp: 1250,
    radius: 3.4,
    speed: 3.4,
    score: 3000,
    range: 24,
    fireCd: 1.5,
    orbSpeed: 22,
    orbDamage: 20,
    contactDamage: 26,
    saturation: 1,
  },
};

export function channelColor(id: number) {
  return CHANNELS[((id % CHANNEL_COUNT) + CHANNEL_COUNT) % CHANNEL_COUNT];
}

export function tmpColor(id: number) {
  return new THREE.Color(channelColor(id).hex);
}
