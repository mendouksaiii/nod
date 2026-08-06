import * as THREE from "three";
import {
  box, crayonDrawing, D, divider, fills, FloorBuild, journalPage,
  makeKey, shell, solid, stairwellDoor, writing, Zone,
} from "../build";

// FLOOR 3 — THE CORRIDORS. Rusted reds, and the longest emptiest floor in
// the house. The constrictor lives UNDER the floorboards and feels every
// step. It cannot see, hear or smell — it only knows the floor.
//
// So: get off the floor. Furniture, ledges, mantels and rugs are all
// invisible to it. The key hangs over bare board in the middle of nowhere.

const WALL = 0x2b1c1a;
const FLOOR = 0x1d1412;
const WOOD = 0x33231d;
const DARK = 0x241715;
const W = 116;

/** Rug — dampens footfall completely. The islands of this floor. */
function rug(group: THREE.Group, zones: Zone[], x: number, w: number) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, 4.6),
    new THREE.MeshStandardMaterial({ color: 0x3a2622, roughness: 1 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, -0.3);
  group.add(m);
  zones.push({ box: box(x, 1.2, -0.3, w / 2, 1.6, 2.4), kind: "quiet" });
}

export function buildFloor3(scene: THREE.Scene, seed: number): FloorBuild {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const interactables: FloorBuild["interactables"] = [];
  const zones: Zone[] = [];

  shell(group, colliders, W, FLOOR, WALL);
  for (const dx of [11, 26, 41, 56, 71, 86, 101]) divider(group, colliders, dx, DARK, 2.6);

  // Floorboards you can read — the thing beneath follows their grain
  for (let i = 0; i < 58; i++) {
    solid(group, null, 1.9, 0.03, D - 0.4, 1 + i * 2, 0.015, 0, i % 2 ? 0x201613 : 0x241a15);
  }

  // ── Landing (0–11) ──
  writing(group, "DON'T RUN ON THE THIRD", 6, 5.0, 5.6, "#b06a58");
  journalPage(group, 8.6);
  rug(group, zones, 5.5, 8);
  const ll = new THREE.PointLight(0x8a5240, 75, 16, 1.6);
  ll.position.set(5, 6, 2);
  group.add(ll);

  // ── Six corridor segments, each with its own way to stay off the boards ──
  // Segment A (11–26): a run of low cabinets — the tutorial route
  for (let i = 0; i < 5; i++) {
    solid(group, colliders, 2.6, 1.3, 2.2, 13.5 + i * 2.7, 0.65, -2.2, WOOD);
  }
  interactables.push({
    type: "climb", trigger: box(12.0, 0.8, -1.2, 0.7, 0.9, 1.3), label: "climb the cabinets",
    climbTopY: 1.3, climbXMin: 12.4, climbXMax: 24.5, climbZ: -2.2,
  });
  writing(group, "stay off the boards", 20, 4.4, 4.0, "#a8705c");
  rug(group, zones, 24.5, 5);

  // Segment B (26–41): a parlour — armchairs and a mantel ledge
  const mantel = solid(group, colliders, 9, 0.5, 1.2, 33, 2.4, -3.4, WOOD);
  mantel.name = "mantel";
  solid(group, colliders, 3.0, 1.6, 2.4, 28.5, 0.8, -2.0, 0x3b2a24);
  interactables.push(
    { type: "climb", trigger: box(27.0, 0.9, -1.0, 0.7, 1.0, 1.3), label: "climb the armchair",
      climbTopY: 1.6, climbXMin: 27.2, climbXMax: 29.8, climbZ: -2.0 },
    { type: "climb", trigger: box(29.9, 1.9, -2.0, 0.6, 0.9, 1.2), label: "climb to the mantel",
      climbTopY: 2.65, climbXMin: 29, climbXMax: 37.2, climbZ: -3.4 },
    { type: "hide", trigger: box(28.5, 0.7, -0.5, 1.6, 0.7, 1.0), label: "hide under the armchair",
      hidePoint: new THREE.Vector3(28.5, 0, -2.0), hidePose: "crawl" }
  );
  const fire = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.6),
    new THREE.MeshBasicMaterial({ color: 0x8a3a1c, transparent: true, opacity: 0.5 })
  );
  fire.position.set(33, 1.0, -3.9);
  group.add(fire);
  const fl = new THREE.PointLight(0xa04a20, 90, 18, 1.7);
  fl.position.set(33, 1.6, -2.6);
  group.add(fl);
  rug(group, zones, 38.5, 5);

  // Segment C (41–56): the service hatch — a crawl route inside the wall
  solid(group, colliders, 2.4, 3.4, 0.4, 47, 1.7, -4.2, DARK);
  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.4, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x4a352c, roughness: 1 })
  );
  hatch.position.set(47, 0.75, -3.9);
  group.add(hatch);
  interactables.push({
    type: "hide", trigger: box(47, 0.8, -1.4, 1.3, 0.8, 2.0),
    label: "crawl into the wall", hidePoint: new THREE.Vector3(47, 0.1, -4.0), hidePose: "crawl",
  });
  // shelf run to keep you elevated across the segment
  solid(group, colliders, 10, 0.4, 1.6, 51, 1.9, -3.6, WOOD);
  interactables.push({
    type: "climb", trigger: box(45.6, 1.2, -2.6, 0.7, 1.2, 1.3), label: "climb the shelf",
    climbTopY: 2.1, climbXMin: 46.2, climbXMax: 55.8, climbZ: -3.6,
  });
  rug(group, zones, 54, 4);

  // Segment D (56–71): THE CROSSING — bare board, key overhead
  writing(group, "it feels the floor. not you.", 63, 5.4, 5.0, "#a8705c");
  const keyHook = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 4.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 1 })
  );
  keyHook.position.set(63.5, 6.6, -1.0);
  group.add(keyHook);

  // Segment E (71–86): tipped furniture makes a bridge, if you find the start
  const stack: [number, number][] = [[73.5, 1.2], [76.5, 2.4], [79.5, 3.4], [83, 2.2]];
  stack.forEach(([sx, sh], i) => {
    solid(group, colliders, 2.6, sh, 2.2, sx, sh / 2, -2.4, i % 2 ? 0x3b2a24 : WOOD);
    interactables.push({
      type: "climb",
      trigger: box(sx - 1.6, sh - 0.4, i === 0 ? -1.2 : -2.4, 0.7, 0.95, i === 0 ? 1.3 : 1.1),
      label: "climb up", climbTopY: sh, climbXMin: sx - 1.1, climbXMax: sx + 1.1, climbZ: -2.4,
    });
  });
  const cell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10),
    new THREE.MeshStandardMaterial({
      color: 0x3a4a3e, emissive: 0x223a26, emissiveIntensity: 0.8, roughness: 0.9,
    })
  );
  cell.position.set(79.5, 3.55, -2.4);
  cell.castShadow = true;
  group.add(cell);
  interactables.push({
    type: "battery", trigger: box(79.5, 3.8, -2.4, 1.2, 0.8, 1.2),
    label: "take the battery", mesh: cell,
  });

  // Segment F (86–101): a long rug and a heavy thing to throw
  rug(group, zones, 93, 12);
  const doorstop = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.8, metalness: 0.3 })
  );
  doorstop.position.set(90, 0.26, 0.5);
  doorstop.castShadow = true;
  group.add(doorstop);
  interactables.push({
    type: "carry", trigger: box(90, 0.6, 0.5, 0.9, 0.7, 0.9),
    label: "pick up the iron doorstop", mesh: doorstop, tag: "throwable",
  });
  writing(group, "throw it far. it goes where the floor shakes.", 95, 5.2, 6.4, "#a8705c");

  // ── Antechamber (101–116) ──
  stairwellDoor(group, 115.8, 0xc8b4b0);
  crayonDrawing(group, 105, 2.1, (ctx) => {
    // a child facing a child
    ctx.beginPath(); ctx.moveTo(128, 30); ctx.lineTo(128, 226); ctx.stroke();
    for (const s of [-1, 1]) {
      const cx = 128 + s * 52;
      ctx.beginPath(); ctx.arc(cx, 90, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, 112); ctx.lineTo(cx, 176);
      ctx.moveTo(cx, 126); ctx.lineTo(cx + s * 30, 152);
      ctx.moveTo(cx, 176); ctx.lineTo(cx - s * 18, 210);
      ctx.moveTo(cx, 176); ctx.lineTo(cx + s * 18, 210);
      ctx.stroke();
    }
    ctx.lineWidth = 4;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(120 + i * 4, 40 + i * 36); ctx.lineTo(136 - i * 4, 52 + i * 36); ctx.stroke();
    }
  }, "cover the mirrors");
  writing(group, "down is out", 110.5, 4.9, 2.8, "#b08878");
  const anl = new THREE.PointLight(0x7a4a3c, 90, 22, 1.5);
  anl.position.set(108, 7, 2);
  group.add(anl);

  // ── The key: over bare board, reachable only from a height ──
  const keySpot = seed % 3;
  const spots: THREE.Vector3[] = [
    new THREE.Vector3(63.5, 4.5, -1.0), // the crossing — the real one
    new THREE.Vector3(33, 2.75, -3.4), // the mantel
    new THREE.Vector3(79.5, 3.6, -2.4), // atop the stack
  ];
  const key = makeKey();
  key.position.copy(spots[keySpot]);
  group.add(key);
  interactables.push({
    type: "carry",
    trigger: box(spots[keySpot].x, spots[keySpot].y, spots[keySpot].z, 1.3, 1.6, 1.3),
    label: "take the old key", mesh: key, isKey: true,
  });
  if (keySpot === 0) {
    // Only way up in the crossing: a lamp table you must drag your nerve to
    solid(group, colliders, 1.8, 3.2, 1.8, 60.5, 1.6, -2.0, WOOD);
    interactables.push({
      type: "climb", trigger: box(59.3, 2.4, -1.2, 0.7, 1.4, 1.2), label: "climb the lamp table",
      climbTopY: 3.2, climbXMin: 59.9, climbXMax: 61.1, climbZ: -2.0,
    });
  }

  fills(group, [[5, 40], [19, 38], [33, 36], [48, 38], [63, 34], [78, 38], [94, 38], [109, 45]], 0x3a2622);
  scene.add(group);

  return {
    floor: 3, name: "the corridors",
    group, colliders, interactables, zones,
    bounds: { minX: 0.7, maxX: 115.3 },
    camClamp: [5, 112],
    spawnX: 2.8, stairX: 115.3, unlocked: false, keySpot,
    entity: {
      sense: "vibration", shape: "constrictor",
      waypoints: [18, 36, 52, 68, 84, 96], dwellSeconds: 1.4, startIndex: 3,
      safeBelow: 12.5, safeAbove: 100,
    },
  };
}
