import * as THREE from "three";
import { FloorBuild } from "../build";
import { buildFloor7 } from "./floor7";
import { buildFloor6 } from "./floor6";
import { buildFloor5 } from "./floor5";
import { buildFloor4 } from "./floor4";
import { buildFloor3 } from "./floor3";
import { buildFloor2 } from "./floor2";
import { buildFloor1 } from "./floor1";

// The house, top to bottom. The stairs only go down.

export type FloorBuilder = (scene: THREE.Scene, seed: number) => FloorBuild;

export const FLOORS: Record<number, FloorBuilder> = {
  7: buildFloor7,
  6: buildFloor6,
  5: buildFloor5,
  4: buildFloor4,
  3: buildFloor3,
  2: buildFloor2,
  1: buildFloor1,
};

export const TOP_FLOOR = 7;
export const BOTTOM_FLOOR = 1;

/** What the child scratched on the wall about each floor, for the descent card. */
export const FLOOR_TITLES: Record<number, string> = {
  7: "the nursery",
  6: "the flooded baths",
  5: "the pantry",
  4: "the study",
  3: "the corridors",
  2: "the mirror floor",
  1: "the ground floor",
};

export function buildFloor(scene: THREE.Scene, floor: number, seed: number): FloorBuild {
  const make = FLOORS[floor];
  if (!make) throw new Error(`no such floor: ${floor}`);
  // Each floor gets its own slice of the run seed, so one floor's layout
  // tells you nothing about the next — which is what the chain enforces later.
  // Forced unsigned: a negative seed makes `seed % 3` negative and every
  // floor's key-spot lookup index off the front of its array.
  const perFloor = (((seed >>> (floor * 3)) ^ Math.imul(seed, floor + 1)) >>> 0);
  return make(scene, perFloor);
}
