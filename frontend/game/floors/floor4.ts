import * as THREE from "three";
import {
  box, crayonDrawing, D, divider, fills, FloorBuild, journalPage,
  makeKey, shell, solid, stairwellDoor, writing, Zone,
} from "../build";

// FLOOR 4 — THE STUDY. Wet greens, and a thing with no face that pings the
// dark like a bat. It was a child who sat down to listen. Holding still does
// NOT work here — hard surfaces throw you straight back to it. Only soft
// things (curtains, book stacks, carpet) swallow the pulse.
//
// The lock is a music box in three brass pieces, and the pieces CHIME when
// they touch — assemble them anywhere but the padded nook and it hears.

const WALL = 0x1f2a22;
const FLOOR = 0x161d18;
const WOOD = 0x2a2a1e;
const DARK = 0x1a2019;
const W = 100;

/** Soft cover — the only thing on this floor that hides you. */
function soft(
  group: THREE.Group, zones: Zone[], x: number, y: number, w: number, h: number, color: number
) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })
  );
  m.position.set(x, y, -1.0);
  group.add(m);
  zones.push({ box: box(x, h / 2, -0.4, w / 2, h / 2 + 0.4, 1.8), kind: "soft" });
  return m;
}

export function buildFloor4(scene: THREE.Scene, seed: number): FloorBuild {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const interactables: FloorBuild["interactables"] = [];
  const zones: Zone[] = [];

  shell(group, colliders, W, FLOOR, WALL);
  for (const dx of [11, 28, 44, 58, 72, 86]) divider(group, colliders, dx, DARK);

  // ── Landing (0–11) ──
  writing(group, "standing still will not save you here", 6, 4.6, 5.8, "#7f9a80");
  journalPage(group, 8.5);
  const ll = new THREE.PointLight(0x6d8a62, 75, 16, 1.6);
  ll.position.set(5, 6, 2);
  group.add(ll);

  // ── Stack one (11–28) ──
  for (let i = 0; i < 4; i++) {
    const bx = 13.5 + i * 3.6;
    solid(group, colliders, 2.8, 7.5, 2.2, bx, 3.75, -2.6, WOOD);
    // books make the stacks soft
    zones.push({ box: box(bx, 3.75, -1.6, 1.6, 3.9, 1.4), kind: "soft" });
    for (let s = 0; s < 5; s++) {
      const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 0.9, 0.5),
        new THREE.MeshStandardMaterial({
          color: [0x3d3524, 0x2f3a2c, 0x453a2a][(i + s) % 3], roughness: 1,
        })
      );
      shelf.position.set(bx, 0.8 + s * 1.5, -1.6);
      shelf.castShadow = true;
      group.add(shelf);
    }
  }
  interactables.push({
    type: "hide", trigger: box(20, 1, -0.6, 7, 1, 1.2), label: "press into the books",
    hidePoint: new THREE.Vector3(20, 0, -1.9), hidePose: "stand",
  });
  const s1 = new THREE.PointLight(0x4f6a4a, 90, 22, 1.6);
  s1.position.set(20, 8, 3);
  group.add(s1);

  // ── Reading room (28–44): the padded nook — assemble the box HERE ──
  soft(group, zones, 33, 4.2, 5.5, 7.5, 0x3b4536); // heavy curtain
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 4.5),
    new THREE.MeshStandardMaterial({ color: 0x38302a, roughness: 1 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(36, 0.02, 0);
  group.add(rug);
  zones.push({ box: box(36, 1.2, 0, 4, 1.6, 2.4), kind: "soft" });

  const chair = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.2, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x3a4034, roughness: 1 })
  );
  chair.position.set(39, 0.6, -1.8);
  chair.castShadow = true;
  group.add(chair);
  colliders.push(box(39, 0.6, -1.8, 1.6, 0.6, 1.3));
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 2.6, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x333929, roughness: 1 })
  );
  back.position.set(39, 1.9, -2.9);
  back.castShadow = true;
  group.add(back);
  zones.push({ box: box(39, 1.6, -2.2, 1.8, 2, 1.4), kind: "soft" });
  interactables.push({
    type: "hide", trigger: box(39, 0.8, -0.4, 1.7, 0.8, 1.1),
    label: "hide behind the armchair",
    hidePoint: new THREE.Vector3(39, 0, -2.5), hidePose: "crawl",
  });
  writing(group, "the padded room is the only quiet one", 36, 8.6, 6.4, "#8aa88a");
  const rl = new THREE.PointLight(0x5c7a52, 95, 22, 1.5);
  rl.position.set(36, 7, 3);
  group.add(rl);

  // ── Archive (44–58) ──
  for (let i = 0; i < 5; i++) {
    const dx2 = 46 + i * 2.4;
    solid(group, colliders, 2.0, 1.1, 2.2, dx2, 0.55 + (i % 2) * 1.15, -2.4, WOOD);
  }
  interactables.push(
    { type: "climb", trigger: box(45, 0.7, -1.2, 0.7, 0.8, 1.2), label: "climb the drawers",
      climbTopY: 1.1, climbXMin: 45.2, climbXMax: 55, climbZ: -2.4 },
    { type: "climb", trigger: box(50, 1.6, -2.2, 2.4, 0.9, 0.9), label: "climb higher",
      climbTopY: 2.25, climbXMin: 47, climbXMax: 55, climbZ: -2.4 }
  );
  const cell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10),
    new THREE.MeshStandardMaterial({
      color: 0x3a4a3e, emissive: 0x223a26, emissiveIntensity: 0.8, roughness: 0.9,
    })
  );
  cell.position.set(53.5, 2.4, -2.4);
  cell.castShadow = true;
  group.add(cell);
  interactables.push({
    type: "battery", trigger: box(53.5, 2.6, -2.4, 1.2, 0.8, 1.2),
    label: "take the battery", mesh: cell,
  });
  const al2 = new THREE.PointLight(0x4a5f46, 80, 20, 1.6);
  al2.position.set(51, 6.5, 2.6);
  group.add(al2);

  // ── Stack two (58–72) ──
  for (let i = 0; i < 3; i++) {
    const bx = 60.5 + i * 4;
    solid(group, colliders, 3.0, 8.5, 2.2, bx, 4.25, -2.6, WOOD);
    zones.push({ box: box(bx, 4.25, -1.6, 1.7, 4.4, 1.4), kind: "soft" });
  }
  soft(group, zones, 69.5, 3.5, 3.5, 6.5, 0x39432f);
  const s2 = new THREE.PointLight(0x455c40, 80, 20, 1.6);
  s2.position.set(65, 8, 2.8);
  group.add(s2);

  // ── Record room (72–86) ──
  const cabinet = solid(group, colliders, 5.5, 3.2, 2.6, 76.5, 1.6, -2.4, WOOD);
  cabinet.name = "cabinet";
  const horn = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 0.22, 2.0, 14, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x6b5c34, roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide,
    })
  );
  horn.position.set(76.5, 4.4, -2.2);
  horn.rotation.z = -0.5;
  horn.castShadow = true;
  group.add(horn);
  interactables.push(
    { type: "climb", trigger: box(73.4, 1.6, -1.4, 0.7, 1.6, 1.2), label: "climb the cabinet",
      climbTopY: 3.2, climbXMin: 74, climbXMax: 79, climbZ: -2.4 },
    { type: "hide", trigger: box(81, 1, -0.6, 1.6, 1, 1.2), label: "hide behind the curtain",
      hidePoint: new THREE.Vector3(81, 0, -2.2), hidePose: "stand" }
  );
  soft(group, zones, 81, 3.5, 3.4, 6.8, 0x36402e);
  const rl2 = new THREE.PointLight(0x50663f, 85, 20, 1.6);
  rl2.position.set(78, 6.5, 2.6);
  group.add(rl2);

  // ── Antechamber (86–100) ──
  stairwellDoor(group, 99.8, 0xa8b49c);
  crayonDrawing(group, 90, 2.1, (ctx) => {
    // something long under a floor
    ctx.beginPath(); ctx.moveTo(20, 150); ctx.lineTo(236, 150); ctx.stroke();
    ctx.lineWidth = 4;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath(); ctx.moveTo(20 + i * 26, 150); ctx.lineTo(20 + i * 26, 172); ctx.stroke();
    }
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(40, 196);
    for (let i = 0; i < 6; i++) ctx.quadraticCurveTo(60 + i * 34, i % 2 ? 168 : 224, 76 + i * 34, 196);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(48, 110, 22, 0, Math.PI * 2); ctx.stroke();
  }, "do not run on the third");
  writing(group, "down is out", 94.5, 4.9, 2.8, "#8aa88a");
  const anl = new THREE.PointLight(0x556b4c, 90, 22, 1.5);
  anl.position.set(92, 7, 2);
  group.add(anl);

  // ── The music-box lock: three brass pieces, and they ring when they meet ──
  const piecePos: THREE.Vector3[] = [
    new THREE.Vector3(17, 0.2, 0.6),
    new THREE.Vector3(52, 2.4, -2.4),
    new THREE.Vector3(76.5, 3.35, -2.4),
  ];
  let assembled = 0;
  const key = makeKey();
  key.visible = false;
  key.position.set(36, 0.2, 0.4);
  group.add(key);
  const keyIt: FloorBuild["interactables"][number] = {
    type: "carry",
    trigger: box(36, 0.5, 0.4, 1.0, 0.7, 1.0),
    label: "take the wound key", mesh: key, isKey: true, consumed: true,
  };

  const build: FloorBuild = {
    floor: 4, name: "the study",
    group, colliders, interactables, zones,
    bounds: { minX: 0.7, maxX: 99.3 },
    camClamp: [5, 96],
    spawnX: 2.8, stairX: 99.3, unlocked: false, keySpot: seed % 3,
    noise: 0,
    entity: {
      sense: "echo", shape: "whisperer",
      waypoints: [16, 33, 50, 65, 80], dwellSeconds: 2.0, startIndex: 2,
      safeBelow: 12.5, safeAbove: 85,
    },
    update(dt) {
      if (this.noise! > 0) this.noise = Math.max(0, this.noise! - dt * 0.8);
    },
  };

  piecePos.forEach((p, i) => {
    const piece = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.22, 0.3),
      new THREE.MeshStandardMaterial({
        color: 0x8a7440, roughness: 0.5, metalness: 0.55,
      })
    );
    piece.position.copy(p);
    piece.castShadow = true;
    group.add(piece);
    interactables.push({
      type: "carry",
      trigger: box(p.x, p.y + 0.3, p.z, 0.9, 0.7, 1.0),
      label: `take the brass piece (${i + 1} of 3)`,
      mesh: piece, tag: "brass",
    });
  });

  // The cradle in the padded nook — the only place the chime is swallowed
  interactables.push({
    type: "lever",
    trigger: box(36, 1.0, 0.4, 1.6, 1.2, 1.4),
    label: "fit the piece into the music box",
    tag: "cradle",
    onUse: (b) => {
      assembled++;
      if (assembled >= 3) {
        key.visible = true;
        keyIt.consumed = false;
      }
    },
  });
  interactables.push(keyIt);

  const cradle = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.55, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x4a4028, roughness: 0.7, metalness: 0.3 })
  );
  cradle.position.set(36, 0.28, 0.4);
  cradle.castShadow = true;
  group.add(cradle);

  fills(group, [[5, 40], [20, 42], [36, 48], [51, 40], [65, 38], [79, 40], [93, 45]], 0x2c3a2c);
  scene.add(group);
  return build;
}
