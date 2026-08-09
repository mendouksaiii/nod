import * as THREE from "three";
import {
  box, crayonDrawing, D, divider, fills, FloorBuild, journalPage,
  makeKey, shell, solid, stairwellDoor, writing, Zone,
} from "../build";

// FLOOR 6 — THE FLOODED BATHS. Black water to the ankles, and something
// blind standing very still in it. It was a child who would not stop crying.
// It hunts by SOUND: water doubles every noise you make. Move slow, and
// throw things to send it somewhere else.

const WALL = 0x18242a;
const FLOOR = 0x101a1e;
const TILE = 0x223038;
const DARK = 0x162026;
const W = 96;

/** Shallow black water — walking in it is loud, and it shows every ripple. */
function water(group: THREE.Group, zones: Zone[], x: number, w: number, level = 0.16) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, D - 0.6),
    new THREE.MeshStandardMaterial({
      color: 0x08131a,
      roughness: 0.16,
      metalness: 0.55,
      transparent: true,
      opacity: 0.88,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, level, 0);
  group.add(mesh);
  zones.push({ box: box(x, 0.5, 0, w / 2, 0.9, D / 2), kind: "water", mesh, active: true });
  return mesh;
}

export function buildFloor6(scene: THREE.Scene, seed: number): FloorBuild {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const interactables: FloorBuild["interactables"] = [];
  const zones: Zone[] = [];

  shell(group, colliders, W, FLOOR, WALL);
  divider(group, colliders, 11, DARK);
  divider(group, colliders, 30, DARK);
  divider(group, colliders, 52, DARK);
  divider(group, colliders, 68, DARK);
  divider(group, colliders, 82, DARK);

  // ── Landing (0–11): dry, and the last dry place ──
  writing(group, "it cannot see. do not splash.", 6, 4.4, 4.4, "#7b8f96");
  journalPage(group, 8.6, 0.5, interactables, 6);
  const ll = new THREE.PointLight(0x6f7f6a, 120, 18, 1.6);
  ll.position.set(5, 6, 2);
  group.add(ll);

  // Duckboards: dry islands that keep you quiet. Low enough to step onto.
  for (const bx of [13.5, 24, 39, 58, 73]) {
    solid(group, colliders, 3.2, 0.26, 2.0, bx, 0.13, 0.6, 0x2b3630);
    zones.push({ box: box(bx, 0.7, 0.4, 1.6, 0.9, 1.4), kind: "quiet" });
  }

  // ── Washroom row (11–30): sinks at adult height, water underfoot ──
  water(group, zones, 20.5, 19);
  for (let i = 0; i < 4; i++) {
    const sx = 14 + i * 4.4;
    solid(group, colliders, 2.6, 0.7, 1.8, sx, 3.1, -3.0, TILE); // basin
    solid(group, colliders, 0.5, 2.8, 0.5, sx, 1.4, -3.0, DARK); // pedestal
    interactables.push({
      type: "climb", trigger: box(sx, 1.4, -1.6, 1.3, 1.4, 1.0),
      label: "climb the basin", climbTopY: 3.45, climbXMin: sx - 1.1, climbXMax: sx + 1.1,
      climbZ: -3.0,
    });
  }
  writing(group, "she hears you cry", 26, 5.2, 3.4, "#8ba0a6");

  const stall = solid(group, colliders, 2.2, 5.5, 2.4, 28.4, 2.75, -2.6, TILE);
  stall.name = "stall";
  interactables.push({
    type: "hide", trigger: box(28.4, 1, -0.6, 1.1, 1, 1.2), label: "hide in the stall",
    hidePoint: new THREE.Vector3(28.4, 0, -2.4), hidePose: "stand",
  });
  const wl = new THREE.PointLight(0x3f6b70, 190, 26, 1.5);
  wl.position.set(21, 7, 2.5);
  group.add(wl);

  // ── The great bath (30–52): the centrepiece, and the key is under it ──
  // The pool is sunk into the BACK of the room; the walk lane runs in front
  // of it, so the corridor never seals shut.
  const bathX = 41;
  const bathZ = -2.6;
  solid(group, colliders, 18, 1.5, 0.8, bathX, 0.75, -1.0, TILE); // front rim
  solid(group, colliders, 18, 1.5, 0.8, bathX, 0.75, -4.2, TILE); // back rim
  solid(group, colliders, 0.8, 1.5, 3.2, bathX - 8.6, 0.75, bathZ, TILE);
  solid(group, colliders, 0.8, 1.5, 3.2, bathX + 8.6, 0.75, bathZ, TILE);

  const bathWater = new THREE.Mesh(
    new THREE.PlaneGeometry(16.4, 2.4),
    new THREE.MeshStandardMaterial({
      color: 0x07131b, roughness: 0.1, metalness: 0.65, transparent: true, opacity: 0.93,
    })
  );
  bathWater.rotation.x = -Math.PI / 2;
  bathWater.position.set(bathX, 1.35, bathZ);
  group.add(bathWater);
  water(group, zones, 35, 8);
  water(group, zones, 49, 6);

  // Over the rim and down into it, once there is nothing left to drown in
  interactables.push({
    type: "climb", trigger: box(bathX, 1.0, -0.2, 8, 1.0, 1.0),
    label: "climb over the rim", climbTopY: 1.5, climbXMin: bathX - 8, climbXMax: bathX + 8,
    climbZ: -1.0,
  });

  const bl = new THREE.PointLight(0x35707a, 240, 30, 1.5);
  bl.position.set(bathX, 8, 3);
  group.add(bl);

  // ── Boiler room (52–68): the valve that empties the bath ──
  const boiler = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 6.5, 16),
    new THREE.MeshStandardMaterial({ color: 0x2b2723, roughness: 1, metalness: 0.3 })
  );
  boiler.position.set(62, 3.25, -2.8);
  boiler.castShadow = true;
  group.add(boiler);
  colliders.push(box(62, 3.25, -2.8, 1.5, 3.25, 1.5));

  // pipes along the wall
  for (const [py, pw] of [[5.2, 14], [3.6, 10]]) {
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, pw, 10),
      new THREE.MeshStandardMaterial({ color: 0x33302b, roughness: 1, metalness: 0.35 })
    );
    p.rotation.z = Math.PI / 2;
    p.position.set(60, py, -4.0);
    group.add(p);
  }

  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.09, 8, 18),
    new THREE.MeshStandardMaterial({ color: 0x6b5a34, roughness: 0.6, metalness: 0.5 })
  );
  wheel.position.set(58.4, 1.5, -1.9);
  wheel.rotation.y = Math.PI / 2;
  wheel.castShadow = true;
  group.add(wheel);

  const pipeHide = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 4.2, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 1, side: THREE.DoubleSide })
  );
  pipeHide.rotation.z = Math.PI / 2;
  pipeHide.position.set(66, 0.55, -3.9);
  group.add(pipeHide);
  interactables.push({
    type: "hide", trigger: box(66, 0.7, -1.0, 1.8, 0.7, 1.6),
    label: "crawl into the pipe", hidePoint: new THREE.Vector3(66, 0.1, -3.9), hidePose: "crawl",
  });

  const cell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10),
    new THREE.MeshStandardMaterial({
      color: 0x3a4a3e, emissive: 0x223a26, emissiveIntensity: 0.8, roughness: 0.9,
    })
  );
  cell.position.set(63.6, 6.65, -2.8);
  cell.castShadow = true;
  group.add(cell);
  interactables.push({
    type: "climb", trigger: box(60.2, 1.5, -2.6, 0.8, 1.5, 1.2), label: "climb the pipes",
    climbTopY: 3.84, climbXMin: 55, climbXMax: 64, climbZ: -4.0,
  });
  interactables.push({
    type: "battery", trigger: box(63.6, 6.9, -2.8, 1.2, 0.9, 1.4),
    label: "take the battery", mesh: cell,
  });

  const bol = new THREE.PointLight(0x7a5230, 160, 22, 1.6);
  bol.position.set(61, 4, 2.4);
  group.add(bol);

  // ── Laundry (68–82): sheets, tubs, and quiet ground ──
  for (let i = 0; i < 5; i++) {
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 4.6),
      new THREE.MeshStandardMaterial({
        color: 0x59605c, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
      })
    );
    sheet.position.set(70 + i * 2.4, 4.4, -1.2 + (i % 2) * 0.7);
    sheet.rotation.y = 0.1 * (i % 3);
    group.add(sheet);
  }
  zones.push({ box: box(75, 1, -1, 6, 1.4, 2), kind: "quiet" });
  const tub = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 0.95, 1.7, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2f3a38, roughness: 1, side: THREE.DoubleSide })
  );
  tub.position.set(79.5, 0.85, -1.4);
  tub.castShadow = true;
  group.add(tub);
  interactables.push({
    type: "hide", trigger: box(79.5, 0.8, -0.2, 1.4, 0.8, 1.3), label: "hide in the tub",
    hidePoint: new THREE.Vector3(79.5, 0.15, -1.4), hidePose: "stand",
  });

  // A tin cup — the decoy that teaches the floor's real verb
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.1, 0.24, 10),
    new THREE.MeshStandardMaterial({ color: 0x7f8378, roughness: 0.6, metalness: 0.4 })
  );
  cup.position.set(72.5, 0.12, 0.6);
  cup.castShadow = true;
  group.add(cup);
  interactables.push({
    type: "carry", trigger: box(72.5, 0.5, 0.6, 0.9, 0.6, 0.9),
    label: "pick up the tin cup", mesh: cup, tag: "throwable",
  });
  writing(group, "throw something. it goes to the noise.", 74, 6.4, 5.2, "#7b8f96");

  const lal = new THREE.PointLight(0x4a5f5a, 150, 22, 1.6);
  lal.position.set(76, 6, 2.6);
  group.add(lal);

  // ── Antechamber (82–96) ──
  stairwellDoor(group, interactables, 95.8, 0x9ec6b4);
  crayonDrawing(group, 86, 2.1, (ctx) => {
    // a wide low thing, all mouth
    ctx.beginPath(); ctx.ellipse(128, 120, 62, 46, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(128, 132, 34, 0, Math.PI); ctx.stroke();
    ctx.lineWidth = 4;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(100 + i * 9, 138); ctx.lineTo(100 + i * 9, 158); ctx.stroke();
    }
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(70, 150); ctx.lineTo(44, 196);
    ctx.moveTo(186, 150); ctx.lineTo(212, 196); ctx.stroke();
  }, "it smells you coming");
  writing(group, "down is out", 90.5, 4.9, 2.8, "#8ba0a6");
  const al = new THREE.PointLight(0x40605c, 160, 24, 1.5);
  al.position.set(88, 7, 2);
  group.add(al);

  // ── The key: at the bottom of the great bath, or two drier places ──
  const keySpot = seed % 3;
  const spots: THREE.Vector3[] = [
    new THREE.Vector3(bathX, 0.12, bathZ), // in the drained bath
    new THREE.Vector3(28.4, 5.62, -2.6), // atop the stall
    new THREE.Vector3(63.6, 6.65, -2.4), // on the boiler
  ];
  const key = makeKey();
  key.position.copy(spots[keySpot]);
  if (keySpot === 0) key.visible = false; // hidden until the bath drains
  group.add(key);
  const keyIt: FloorBuild["interactables"][number] = {
    type: "carry",
    trigger: box(spots[keySpot].x, spots[keySpot].y + 0.2, spots[keySpot].z, 1.4, 0.9, 1.4),
    label: "take the old key", mesh: key, isKey: true,
    consumed: keySpot === 0, // unreachable until drained
  };
  interactables.push(keyIt);

  // ── The valve: draining is loud, and it sends her into the room ──
  let draining = 0;
  let drained = false;
  interactables.push({
    type: "lever",
    trigger: box(58.4, 1.5, -0.9, 1.3, 1.5, 1.3),
    label: "turn the valve",
    tag: "valve",
    onUse: (b) => {
      if (drained) return;
      draining = 6.5;
      b.noise = 1; // the pipes shriek: she comes
    },
  });

  fills(group, [[5, 70], [21, 78], [41, 85], [61, 70], [76, 70], [89, 78]], 0x2b3a40);
  scene.add(group);

  return {
    floor: 6, name: "the flooded baths",
    group, colliders, interactables, zones,
    bounds: { minX: 0.7, maxX: 95.3 },
    camClamp: [5, 92],
    spawnX: 2.8, stairX: 95.3, unlocked: false, keySpot,
    noise: 0,
    entity: {
      sense: "sound", shape: "listener",
      waypoints: [15, 27, 41, 55, 70, 78], dwellSeconds: 3.2, startIndex: 2,
      safeBelow: 12.5, safeAbove: 81,
    },
    update(dt) {
      if (draining > 0) {
        draining -= dt;
        // the bath empties, and every pipe in the floor screams about it
        bathWater.position.y = THREE.MathUtils.damp(bathWater.position.y, 0.1, 0.9, dt);
        wheel.rotation.x += dt * 5;
        this.noise = Math.max(0, draining / 6.5);
        if (draining <= 0) {
          drained = true;
          this.noise = 0;
          bathWater.visible = false;
          if (keySpot === 0) {
            key.visible = true;
            keyIt.consumed = false;
          }
        }
      }
    },
  };
}
