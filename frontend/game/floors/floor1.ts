import * as THREE from "three";
import {
  box, D, divider, fills, FloorBuild, journalPage,
  shell, solid, writing, Zone,
} from "../build";

// FLOOR 1 — THE GROUND FLOOR. Near-monochrome cold, and nothing chases you.
// There is no monster and no key. There is one long room, and the exit at
// the end of it with real daylight under the door.
//
// The house makes its last offer instead: doors open along the walls as you
// pass, each one warm, each one exactly what an exhausted child wants. Step
// into any of them and you stay — you become another warden, and the next
// player will walk past a door with your name on it.
//
// Keep walking and nothing happens. That is the horror.

const WALL = 0x191c21;
const FLOOR = 0x14171b;
const DARK = 0x121519;
const W = 108;

interface Temptation {
  x: number;
  label: string;
  /** The lie it tells, on the wall above it. */
  line: string;
  light: THREE.PointLight;
  glow: THREE.Mesh;
  opened: boolean;
}

export function buildFloor1(scene: THREE.Scene, seed: number): FloorBuild {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const interactables: FloorBuild["interactables"] = [];
  const zones: Zone[] = [];

  shell(group, colliders, W, FLOOR, WALL);
  divider(group, colliders, 12, DARK);
  divider(group, colliders, 96, DARK);

  // ── Stair bottom (0–12): where you arrive, and the last writing ──
  writing(group, "i got this far. i am going to keep walking.", 6, 4.6, 6.4, "#9aa0aa");
  journalPage(group, 8.8);
  const ll = new THREE.PointLight(0x5c6470, 70, 16, 1.6);
  ll.position.set(5, 6, 2);
  group.add(ll);

  // ── The long room (12–96): one walk, and five ways to stop ──
  const temptations: Temptation[] = [
    { x: 24, label: "go inside and sit down", line: "you can rest here" },
    { x: 40, label: "go inside — someone is calling you", line: "she is calling you" },
    { x: 56, label: "go inside and get warm", line: "it is warm in here" },
    { x: 72, label: "go inside — it is your room", line: "this is your room" },
    { x: 86, label: "go inside and stop", line: "you do not have to be brave" },
  ].map((t) => {
    // A doorway of warm light in a cold wall
    solid(group, null, 3.0, 5.6, 0.3, t.x, 2.8, -D / 2 + 0.18, 0x0d1013);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 5.0),
      new THREE.MeshBasicMaterial({
        color: 0xd8a463, transparent: true, opacity: 0, side: THREE.DoubleSide,
      })
    );
    glow.position.set(t.x, 2.6, -D / 2 + 0.34);
    group.add(glow);

    const light = new THREE.PointLight(0xd89a52, 0, 16, 1.7);
    light.position.set(t.x, 2.4, -2.4);
    group.add(light);

    return { ...t, light, glow, opened: false };
  });

  // Bare, enormous, empty. A few shapes so the walk is not featureless.
  for (const [cx, cw] of [[31, 5], [49, 4], [66, 6], [81, 4]]) {
    solid(group, colliders, cw, 1.0, 2.6, cx, 0.5, -3.2, 0x1b1f25);
  }
  writing(group, "do not stop", 47, 6.2, 3.4, "#7d838f");
  writing(group, "whatever it offers you", 63, 5.6, 4.6, "#70767f");

  // ── The door (96–108). Cold real daylight, and no lock ──
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 8.8, 4.8),
    new THREE.MeshStandardMaterial({ color: 0x0f1216, roughness: 1 })
  );
  panel.position.set(107.7, 4.4, 0);
  group.add(panel);
  solid(group, null, 0.34, 0.32, 5.4, 107.6, 8.95, 0, 0x1b1f25);

  const slit = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xf2f6ff })
  );
  slit.rotation.y = -Math.PI / 2;
  slit.position.set(107.55, 0.15, 0);
  group.add(slit);
  const dayl = new THREE.PointLight(0xdfe9ff, 120, 22, 1.5);
  dayl.position.set(105.5, 1.0, 0.8);
  group.add(dayl);
  const dayl2 = new THREE.SpotLight(0xeaf1ff, 90, 26, 0.75, 0.8, 1.2);
  dayl2.position.set(106.5, 0.6, 0);
  dayl2.target.position.set(96, 0, 0);
  group.add(dayl2, dayl2.target);

  // The way out. Section 5 hooks the ending to this.
  interactables.push({
    type: "door",
    trigger: box(105.6, 1.4, 0, 2.0, 1.6, 2.2),
    label: "open the door",
    tag: "exit",
  });

  fills(group, [[6, 30], [26, 22], [45, 22], [64, 22], [83, 24], [101, 40]], 0x262b33);
  scene.add(group);

  return {
    floor: 1, name: "the ground floor",
    group, colliders, interactables, zones,
    bounds: { minX: 0.7, maxX: 107.0 },
    camClamp: [5, 103],
    spawnX: 2.8, stairX: 107.0, unlocked: true, keySpot: 0,
    entity: null,
    update(dt, ctx) {
      // Each door wakes as he draws level with it, and dims once he is past.
      for (const t of temptations) {
        const d = Math.abs(ctx.theoX - t.x);
        const near = THREE.MathUtils.clamp(1 - d / 11, 0, 1);
        const want = near * near;
        t.light.intensity = THREE.MathUtils.damp(t.light.intensity, want * 55, 3, dt);
        (t.glow.material as THREE.MeshBasicMaterial).opacity =
          THREE.MathUtils.damp((t.glow.material as THREE.MeshBasicMaterial).opacity, want * 0.6, 3, dt);

        if (!t.opened && d < 6) {
          t.opened = true;
          writing(this.group, t.line, t.x, 6.4, 4.6, "#c09a68");
          this.interactables.push({
            type: "door",
            trigger: box(t.x, 1.4, -1.6, 1.6, 1.6, 1.8),
            label: t.label,
            tag: "settle",
          });
        }
      }
    },
  };
}
