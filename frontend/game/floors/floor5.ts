import * as THREE from "three";
import {
  box, crayonDrawing, D, divider, fills, FloorBuild, journalPage,
  makeKey, shell, solid, stairwellDoor, writing, Zone,
} from "../build";

// FLOOR 5 — THE PANTRY. Jaundiced yellows, everything sticky. The feeder
// was a child who could not stop eating. It hunts by SMELL and does not
// patrol a route — it walks where you walked, always late. Hiding is
// useless. Mask your scent in smoke or spilled spice, and bait it away.

const WALL = 0x2a2419;
const FLOOR = 0x1d1a13;
const SHELF = 0x33291c;
const DARK = 0x241d14;
const W = 104;

function maskCloud(group: THREE.Group, zones: Zone[], x: number, color: number, tag: string) {
  const cloud = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 14, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false })
  );
  cloud.position.set(x, 1.4, -0.6);
  cloud.scale.set(1.5, 0.75, 1);
  group.add(cloud);
  zones.push({ box: box(x, 1.4, -0.6, 3.4, 1.8, 2.4), kind: "mask", mesh: cloud, active: true, tag });
  return cloud;
}

export function buildFloor5(scene: THREE.Scene, seed: number): FloorBuild {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const interactables: FloorBuild["interactables"] = [];
  const zones: Zone[] = [];

  shell(group, colliders, W, FLOOR, WALL);
  for (const dx of [11, 27, 46, 62, 76, 90]) divider(group, colliders, dx, DARK);

  // ── Landing (0–11) ──
  writing(group, "it follows where you have been", 6, 4.5, 5.0, "#a08d5e");
  journalPage(group, 8.4);
  const ll = new THREE.PointLight(0x8a7038, 75, 16, 1.6);
  ll.position.set(5, 6, 2);
  group.add(ll);

  // ── Cold store (11–27): hanging carcasses, a cold that hides nothing ──
  for (let i = 0; i < 6; i++) {
    const hx = 13.5 + i * 2.3;
    const hook = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.035, 6, 12, Math.PI * 1.4),
      new THREE.MeshStandardMaterial({ color: 0x6d6353, roughness: 0.6, metalness: 0.5 })
    );
    hook.position.set(hx, 5.2, -2.2);
    group.add(hook);
    const meat = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 1.5, 5, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a2f2a, roughness: 1 })
    );
    meat.position.set(hx, 4.0, -2.2);
    meat.castShadow = true;
    group.add(meat);
  }
  solid(group, colliders, 3.4, 1.3, 2.4, 24, 0.65, -2.4, SHELF);
  interactables.push({
    type: "hide", trigger: box(24, 0.6, -0.8, 1.7, 0.6, 1.2),
    label: "hide under the slab", hidePoint: new THREE.Vector3(24, 0, -2.4), hidePose: "crawl",
  });
  const cl = new THREE.PointLight(0x50607a, 85, 20, 1.6);
  cl.position.set(19, 7, 2.4);
  group.add(cl);

  // ── The great shelves (27–46): a climbable cliff of preserves ──
  for (let tier = 0; tier < 4; tier++) {
    const y = 1.5 + tier * 2.0;
    solid(group, colliders, 15, 0.3, 2.6, 36, y, -2.6, SHELF);
    for (let j = 0; j < 7; j++) {
      const jar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.75, 10),
        new THREE.MeshStandardMaterial({
          color: [0x4b5230, 0x5a3a26, 0x3f4442][(tier + j) % 3],
          roughness: 0.55, transparent: true, opacity: 0.92,
        })
      );
      jar.position.set(30 + j * 2.05, y + 0.53, -2.6);
      jar.castShadow = true;
      group.add(jar);
    }
    if (tier < 3) {
      interactables.push({
        type: "climb",
        trigger: box(29.4, y + 0.6, -1.6, 0.7, 1.0, 1.4),
        label: "climb the shelves",
        climbTopY: y + 0.15, climbXMin: 29.2, climbXMax: 43, climbZ: -2.6,
      });
    }
  }
  writing(group, "keep something smelly between you and it", 40, 9.4, 6.2, "#9a8a5c");
  const sl = new THREE.PointLight(0x8a7434, 100, 24, 1.5);
  sl.position.set(36, 9.5, 3);
  group.add(sl);

  // ── Kitchen (46–62): the spice sack you knock down ──
  solid(group, colliders, 7, 1.6, 3.0, 53, 0.8, -2.0, SHELF); // table
  interactables.push(
    { type: "climb", trigger: box(49.2, 1.0, -0.6, 0.7, 1.0, 1.2), label: "climb the table",
      climbTopY: 1.6, climbXMin: 49.8, climbXMax: 56.2, climbZ: -2.0 },
    { type: "hide", trigger: box(53, 0.6, 0.2, 3.2, 0.6, 1.2), label: "hide under the table",
      hidePoint: new THREE.Vector3(53, 0, -2.0), hidePose: "crawl" }
  );

  const sack = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 0.6, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0x7a6434, roughness: 1 })
  );
  sack.position.set(55.5, 2.1, -2.0);
  sack.castShadow = true;
  group.add(sack);
  let spice: THREE.Mesh | null = null;
  interactables.push({
    type: "lever",
    trigger: box(55.5, 2.1, -1.0, 1.2, 1.3, 1.3),
    label: "push the spice sack",
    tag: "spice",
    onUse: (b) => {
      sack.position.set(55.5, 0.35, -0.4);
      sack.rotation.z = 1.2;
      if (!spice) spice = maskCloud(b.group, b.zones, 55.5, 0xbb9a4a, "spice");
    },
  });

  const kl = new THREE.PointLight(0x9a7a34, 95, 22, 1.5);
  kl.position.set(54, 7, 2.6);
  group.add(kl);

  // ── Smokehouse (62–76): standing in it masks you, for a while ──
  const smoker = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 5.5, 3.0),
    new THREE.MeshStandardMaterial({ color: 0x241c15, roughness: 1 })
  );
  smoker.position.set(68, 2.75, -2.6);
  smoker.castShadow = true;
  group.add(smoker);
  colliders.push(box(68, 2.75, -2.6, 2.1, 2.75, 1.5));
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.1),
    new THREE.MeshBasicMaterial({ color: 0xc2621f, transparent: true, opacity: 0.75 })
  );
  glow.position.set(68, 1.1, -1.08);
  group.add(glow);
  const fire = new THREE.PointLight(0xd06a20, 110, 16, 1.7);
  fire.position.set(68, 1.6, -0.2);
  group.add(fire);
  maskCloud(group, zones, 70.5, 0x6b6157, "smoke");
  writing(group, "stand in the smoke. it forgets you.", 71, 7.4, 5.6, "#b08a4a");

  // ── Larder (76–90): where the key is, and where it eats ──
  for (const [bx, by] of [[79, 1.2], [79, 3.4], [86, 1.2], [86, 3.4]])
    solid(group, colliders, 4.5, 0.3, 2.4, bx, by, -2.8, SHELF);
  interactables.push(
    { type: "climb", trigger: box(76.9, 1.2, -1.8, 0.7, 1.2, 1.2), label: "climb the larder",
      climbTopY: 1.35, climbXMin: 77.2, climbXMax: 81, climbZ: -2.8 },
    { type: "climb", trigger: box(79, 2.2, -2.6, 2.2, 1.0, 0.9), label: "climb higher",
      climbTopY: 3.55, climbXMin: 77.2, climbXMax: 81, climbZ: -2.8 }
  );
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 0.95, 2.0, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x40311f, roughness: 1, side: THREE.DoubleSide })
  );
  barrel.position.set(83, 1.0, -1.2);
  barrel.castShadow = true;
  group.add(barrel);
  interactables.push({
    type: "hide", trigger: box(83, 0.9, 0, 1.3, 0.9, 1.2), label: "hide in the barrel",
    hidePoint: new THREE.Vector3(83, 0.15, -1.2), hidePose: "stand",
  });

  const cell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10),
    new THREE.MeshStandardMaterial({
      color: 0x3a4a3e, emissive: 0x223a26, emissiveIntensity: 0.8, roughness: 0.9,
    })
  );
  cell.position.set(86, 3.7, -2.8);
  cell.castShadow = true;
  group.add(cell);
  interactables.push({
    type: "battery", trigger: box(86, 3.9, -2.8, 1.4, 0.8, 1.2),
    label: "take the battery", mesh: cell,
  });

  // The bait: a joint of meat you drag somewhere far and drop
  const bait = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.4, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a3630, roughness: 1 })
  );
  bait.position.set(81, 0.25, 0.5);
  bait.castShadow = true;
  group.add(bait);
  interactables.push({
    type: "carry", trigger: box(81, 0.6, 0.5, 0.9, 0.7, 0.9),
    label: "pick up the meat", mesh: bait, tag: "throwable",
  });

  const larl = new THREE.PointLight(0x7a5c2c, 85, 20, 1.6);
  larl.position.set(83, 6.5, 2.4);
  group.add(larl);

  // ── Antechamber (90–104) ──
  stairwellDoor(group, interactables, 103.8, 0xb9b4a0);
  crayonDrawing(group, 94, 2.1, (ctx) => {
    // a thin tall thing with a dish for a face
    ctx.beginPath(); ctx.moveTo(128, 60); ctx.lineTo(128, 200); ctx.stroke();
    ctx.beginPath(); ctx.arc(128, 48, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(150, 48, 16, -1.2, 1.2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128, 96); ctx.lineTo(84, 168);
    ctx.moveTo(128, 96); ctx.lineTo(172, 168);
    ctx.moveTo(128, 200); ctx.lineTo(104, 226);
    ctx.moveTo(128, 200); ctx.lineTo(152, 226); ctx.stroke();
    ctx.lineWidth = 3;
    for (const r of [40, 58, 76]) { ctx.beginPath(); ctx.arc(150, 48, r, -0.9, 0.9); ctx.stroke(); }
  }, "it listens in circles");
  writing(group, "down is out", 98.5, 4.9, 2.8, "#a08d5e");
  const al = new THREE.PointLight(0x6b6248, 90, 22, 1.5);
  al.position.set(96, 7, 2);
  group.add(al);

  // ── The key: it reeks, and carrying it doubles what the feeder smells ──
  const keySpot = seed % 3;
  const spots: THREE.Vector3[] = [
    new THREE.Vector3(86, 3.75, -2.6),
    new THREE.Vector3(36, 7.65, -2.6),
    new THREE.Vector3(53, 1.75, -2.0),
  ];
  const key = makeKey();
  key.position.copy(spots[keySpot]);
  group.add(key);
  interactables.push({
    type: "carry",
    trigger: box(spots[keySpot].x, spots[keySpot].y + 0.2, spots[keySpot].z, 1.2, 0.9, 1.2),
    label: "take the reeking key", mesh: key, isKey: true, tag: "reeking",
  });

  fills(group, [[5, 40], [19, 45], [36, 45], [54, 45], [69, 35], [83, 40], [97, 45]], 0x3a3020);
  scene.add(group);

  // Masks burn off — and faster once you are carrying that key
  let maskLife = 0;
  return {
    floor: 5, name: "the pantry",
    group, colliders, interactables, zones,
    bounds: { minX: 0.7, maxX: 103.3 },
    camClamp: [5, 100],
    spawnX: 2.8, stairX: 103.3, unlocked: false, keySpot,
    entity: {
      sense: "smell", shape: "feeder",
      waypoints: [16, 34, 52, 68, 84], dwellSeconds: 1.6, startIndex: 3,
      safeBelow: 12.5, safeAbove: 89,
    },
    update(dt, ctx) {
      const inMask = this.zones.some(
        (z) => z.kind === "mask" && z.active !== false &&
          z.box.containsPoint(new THREE.Vector3(ctx.theoX, ctx.theoY + 0.3, 0))
      );
      if (inMask) maskLife = 9;
      else if (maskLife > 0) maskLife -= dt;
      // The spice cloud thins out; the smokehouse keeps burning
      for (const z of this.zones) {
        if (z.tag === "spice" && z.mesh) {
          const m = z.mesh as THREE.Mesh;
          const mat = m.material as THREE.MeshBasicMaterial;
          mat.opacity = Math.max(0, mat.opacity - dt * 0.006);
          if (mat.opacity <= 0.01) z.active = false;
        }
      }
    },
  };
}
