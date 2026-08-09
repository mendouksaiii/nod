import * as THREE from "three";
import {
  box, crayonDrawing, D, divider, fills, FloorBuild, H, journalPage,
  makeKey, shell, solid, stairwellDoor, writing,
} from "../build";

// FLOOR 7 — THE NURSERY. Where he wakes. The teaching floor: it hunts by
// sight and motion, and the walls tell you so. Grey-blue, almost ordinary.

const WALL = 0x1b212c;
const FLOOR = 0x161b24;
const FURNITURE = 0x252b38;
const DARK = 0x1e2430;
const W = 90;

export function buildFloor7(scene: THREE.Scene, seed: number): FloorBuild {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const interactables: FloorBuild["interactables"] = [];

  shell(group, colliders, W, FLOOR, WALL);
  divider(group, colliders, 12);
  divider(group, colliders, 34);
  divider(group, colliders, 58);
  divider(group, colliders, 76);

  // ── The landing: the sealed way up ──
  solid(group, null, 2.6, 5.2, 0.14, 4.5, 2.6, -D / 2 + 0.09, 0x11151d);
  solid(group, null, 3.0, 0.22, 0.2, 4.5, 5.3, -D / 2 + 0.12, DARK);
  solid(group, null, 0.22, 5.2, 0.2, 3.1, 2.6, -D / 2 + 0.12, DARK);
  solid(group, null, 0.22, 5.2, 0.2, 5.9, 2.6, -D / 2 + 0.12, DARK);
  const b1 = solid(group, null, 3.2, 0.3, 0.1, 4.5, 3.4, -D / 2 + 0.18, 0x2c3040);
  b1.rotation.z = 0.14;
  const b2 = solid(group, null, 3.2, 0.3, 0.1, 4.5, 1.9, -D / 2 + 0.18, 0x2c3040);
  b2.rotation.z = -0.1;
  writing(group, "nod", 6.9, 2.1, 1.1, "#5d6579");
  writing(group, "the stairs only go down", 6.2, 4.6, 3.6);
  solid(group, null, 5, 0.05, 3.2, 6.5, 0.025, 0.4, 0x2a2733);
  solid(group, colliders, 1.1, 1.15, 1.1, 9.8, 0.575, -2.6, FURNITURE);
  const lamp = new THREE.PointLight(0x8a7a5e, 90, 18, 1.5);
  lamp.position.set(5, 6, 1.5);
  group.add(lamp);

  // ── The cot room ──
  const cotX = 21.5;
  solid(group, colliders, 11, 0.5, 4, cotX, 2.35, -1.5, FURNITURE);
  solid(group, colliders, 10.6, 0.4, 3.7, cotX, 2.8, -1.5, 0x2b3140);
  for (const lx of [cotX - 5.2, cotX + 5.2])
    for (const lz of [-3.2, -0.75])
      solid(group, colliders, 0.5, 2.1, 0.5, lx, 1.05, lz, DARK);
  const barMat = new THREE.MeshStandardMaterial({ color: 0x1c222e, roughness: 1 });
  for (let bx = cotX - 5.2; bx <= cotX + 5.2; bx += 0.95) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.8, 8), barMat);
    bar.position.set(bx, 4.5, 0.45);
    bar.castShadow = true;
    group.add(bar);
  }
  solid(group, null, 11, 0.22, 0.22, cotX, 6.4, 0.45, DARK);
  solid(group, colliders, 1.4, 1.15, 1.6, 14.9, 0.575, -1.2, FURNITURE);
  interactables.push(
    { type: "climb", trigger: box(14.0, 0.7, 0, 0.6, 0.7, 1.3), label: "climb up",
      climbTopY: 1.15, climbXMin: 14.3, climbXMax: 15.5, climbZ: -1.2 },
    { type: "climb", trigger: box(15.7, 1.8, -1.2, 0.55, 0.75, 1.2), label: "climb into the cot",
      climbTopY: 3.0, climbXMin: 16.3, climbXMax: 26.6, climbZ: -1.5 },
    { type: "hide", trigger: box(cotX, 0.6, 0.6, 5.0, 0.6, 1.0), label: "hide under the cot",
      hidePoint: new THREE.Vector3(cotX - 1, 0, -1.5), hidePose: "crawl" }
  );

  const basket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.8, 1.5, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2e3341, roughness: 1, side: THREE.DoubleSide })
  );
  basket.position.set(30, 0.75, -1.3);
  basket.castShadow = true;
  group.add(basket);
  interactables.push({
    type: "hide", trigger: box(30, 0.7, 0.2, 1.2, 0.7, 1.2), label: "hide in the basket",
    hidePoint: new THREE.Vector3(30, 0.15, -1.3), hidePose: "stand",
  });

  for (let i = 0; i < 5; i++)
    solid(group, null, 0.34, 0.14, 0.5, 31.2 + i * 0.55, 0.07, -3.9, 0x2a2f3c);
  writing(group, "— wren    — tom    — ivy", 32.2, 1.6, 2.6, "#69718a");
  writing(group, "stay still. it sees you move.", 21.5, 5.1, 4.6, "#8b93a8");
  const cotLight = new THREE.PointLight(0x46587c, 130, 26, 1.5);
  cotLight.position.set(20, 9, 2);
  group.add(cotLight);

  // ── The playroom: the window, and the light that gets you killed ──
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x0c1118, emissive: 0x39496a, emissiveIntensity: 1.6, roughness: 1,
  });
  for (const wx of [44.2, 46.9]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 6.8), winMat);
    pane.position.set(wx, 8.0, -D / 2 + 0.02);
    group.add(pane);
  }
  const moon = new THREE.SpotLight(0x5a6f95, 340, 34, 0.6, 0.65, 1.2);
  moon.position.set(45.5, 12, 3.5);
  moon.target.position.set(45.5, 0, -1);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.bias = -0.001;
  group.add(moon, moon.target);

  const blocks: [number, number, number][] = [
    [36.6, 1.0, 35.3], [38.9, 2.0, 37.7], [41.2, 3.0, 40.0],
  ];
  blocks.forEach(([bx, bh, tx], i) => {
    solid(group, colliders, 2.2, bh, 2.4, bx, bh / 2, -1.6, i % 2 ? DARK : FURNITURE);
    interactables.push({
      type: "climb",
      trigger: box(tx, bh - 0.35, i === 0 ? 0 : -1.6, 0.55, 0.78, i === 0 ? 1.4 : 1.3),
      label: "climb up", climbTopY: bh, climbXMin: bx - 1, climbXMax: bx + 1, climbZ: -1.6,
    });
  });

  solid(group, colliders, 2.8, 1.15, 1.9, 50, 0.575, -1.4, FURNITURE);
  const lid = solid(group, null, 2.8, 0.14, 1.9, 50, 1.35, -1.9, DARK);
  lid.rotation.x = -0.5;
  interactables.push({
    type: "hide", trigger: box(50, 0.7, 0.4, 1.7, 0.7, 1.1), label: "hide in the toy chest",
    hidePoint: new THREE.Vector3(50, 0.2, -1.4), hidePose: "crawl",
  });

  const horse = new THREE.Group();
  const hm = new THREE.MeshStandardMaterial({ color: 0x33313f, roughness: 1 });
  const hb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.7), hm);
  hb.position.y = 1.7;
  horse.add(hb);
  const hh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.5), hm);
  hh.position.set(0.95, 2.5, 0);
  hh.rotation.z = -0.25;
  horse.add(hh);
  for (const rz of [-0.3, 0.3]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.09, 8, 20, Math.PI * 0.75), hm);
    r.rotation.z = Math.PI + Math.PI * 0.125;
    r.position.set(0, 1.45, rz);
    horse.add(r);
  }
  horse.position.set(55, 0, -2.2);
  horse.traverse((m) => { m.castShadow = true; });
  group.add(horse);
  colliders.push(box(55, 1.4, -2.2, 1.3, 1.4, 0.6));

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0x3c3644, roughness: 1 })
  );
  ball.position.set(43.5, 0.5, 0.8);
  ball.castShadow = true;
  group.add(ball);
  const blockM = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.36, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x453d52, roughness: 1 })
  );
  blockM.position.set(47.5, 0.18, 0.5);
  blockM.castShadow = true;
  group.add(blockM);
  interactables.push({
    type: "carry", trigger: box(47.5, 0.5, 0.5, 0.8, 0.5, 0.9),
    label: "pick up the block", mesh: blockM, tag: "throwable",
  });
  if ((seed >> 3) % 2 === 0)
    writing(group, "it walks when the house sleeps", 52.5, 4.4, 4.0, "#6d7590");

  // ── The wardrobe room ──
  solid(group, colliders, 3.4, 8.5, 2.4, 60.9, 4.25, -2.2, FURNITURE);
  const doorA = solid(group, null, 1.5, 7.8, 0.12, 59.7, 3.9, -0.7, DARK);
  doorA.rotation.y = 0.5;
  interactables.push({
    type: "hide", trigger: box(60.9, 1, -0.3, 1.4, 1, 1.2), label: "hide in the wardrobe",
    hidePoint: new THREE.Vector3(60.9, 0, -2.0), hidePose: "stand",
  });

  solid(group, colliders, 3.4, 2.4, 2.2, 65.5, 1.7, -1.8, FURNITURE);
  for (const [lx, lz] of [[64, -2.7], [67, -2.7], [64, -0.9], [67, -0.9]])
    solid(group, colliders, 0.28, 0.5, 0.28, lx, 0.25, lz, DARK);
  solid(group, colliders, 2.9, 0.24, 0.9, 65.5, 0.85, -0.85, DARK);
  solid(group, colliders, 2.9, 0.24, 0.8, 65.5, 1.8, -1.0, DARK);
  interactables.push(
    { type: "climb", trigger: box(65.5, 0.6, 0.3, 1.5, 0.6, 0.9), label: "climb the drawers",
      climbTopY: 0.97, climbXMin: 64.2, climbXMax: 66.8, climbZ: -0.85 },
    { type: "climb", trigger: box(65.5, 1.5, -0.85, 1.4, 0.6, 0.7), label: "climb up",
      climbTopY: 1.92, climbXMin: 64.2, climbXMax: 66.8, climbZ: -1.0 },
    { type: "climb", trigger: box(65.5, 2.4, -1.0, 1.4, 0.65, 0.7), label: "climb onto the dresser",
      climbTopY: 2.9, climbXMin: 64.2, climbXMax: 66.8, climbZ: -1.8 },
    { type: "hide", trigger: box(65.5, 0.5, 0.6, 1.6, 0.5, 0.9), label: "hide under the dresser",
      hidePoint: new THREE.Vector3(65.5, 0, -1.8), hidePose: "crawl" }
  );

  const cell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10),
    new THREE.MeshStandardMaterial({
      color: 0x3a4a3e, emissive: 0x223a26, emissiveIntensity: 0.8, roughness: 0.9,
    })
  );
  cell.position.set(66.3, 3.05, -1.8);
  cell.castShadow = true;
  group.add(cell);
  interactables.push({
    type: "battery", trigger: box(66.3, 3.3, -1.8, 0.8, 0.6, 1.0),
    label: "take the battery", mesh: cell,
  });

  solid(group, colliders, 1.9, 4.4, 2.0, 68.4, 2.2, -2.1, DARK);
  interactables.push({
    type: "climb", trigger: box(67.2, 3.4, -1.8, 0.55, 0.8, 1.0), label: "climb the crates",
    climbTopY: 4.4, climbXMin: 67.6, climbXMax: 69.2, climbZ: -2.1,
  });
  solid(group, colliders, 3.2, 6.6, 2.4, 70.9, 3.3, -2.2, FURNITURE);
  interactables.push({
    type: "climb", trigger: box(69.5, 5.2, -2.1, 0.5, 0.9, 1.0), label: "climb on top",
    climbTopY: 6.6, climbXMin: 69.5, climbXMax: 72.3, climbZ: -2.2,
  });

  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.52, 3.6, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2a303c, roughness: 1, side: THREE.DoubleSide })
  );
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(74.2, 0.52, -3.8);
  pipe.castShadow = true;
  group.add(pipe);
  interactables.push({
    type: "hide", trigger: box(74.2, 0.7, -0.9, 1.6, 0.7, 1.6), label: "crawl into the pipe",
    hidePoint: new THREE.Vector3(74.2, 0.1, -3.8), hidePose: "crawl",
  });
  if ((seed >> 5) % 2 === 0)
    writing(group, "some of these are not wardrobes", 63.5, 6.2, 4.2, "#69718a");

  const wl = new THREE.PointLight(0x53604f, 85, 24, 1.5);
  wl.position.set(66, 4.5, 2.6);
  group.add(wl);
  const wl2 = new THREE.PointLight(0x414d45, 55, 19, 1.6);
  wl2.position.set(72.5, 3.2, 2.2);
  group.add(wl2);

  // ── The stair antechamber ──
  stairwellDoor(group, interactables, 89.8);
  crayonDrawing(group, 80, 2.1, (ctx) => {
    ctx.beginPath(); ctx.ellipse(128, 84, 34, 40, 0.1, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(102, 56); ctx.quadraticCurveTo(84, -6, 106, 30);
    ctx.moveTo(154, 54); ctx.quadraticCurveTo(178, -10, 152, 28); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128, 124); ctx.lineTo(124, 210);
    ctx.moveTo(112, 140); ctx.lineTo(74, 226);
    ctx.moveTo(146, 140); ctx.lineTo(188, 228); ctx.stroke();
  }, "it lives in the water");
  writing(group, "down is out", 84.5, 4.9, 2.8);
  journalPage(group, 84.2, 0.5, interactables, 7);
  const al = new THREE.PointLight(0x3e4a66, 100, 22, 1.5);
  al.position.set(82, 7, 2);
  group.add(al);

  // ── The key: three places, one seed ──
  const keySpot = seed % 3;
  const spots: THREE.Vector3[] = [
    new THREE.Vector3(24.3, 2.95, -1.5),
    new THREE.Vector3(50.6, 1.32, -1.15),
    new THREE.Vector3(70.9, 6.72, -2.2),
  ];
  const key = makeKey();
  key.position.copy(spots[keySpot]);
  group.add(key);
  interactables.push({
    type: "carry",
    trigger: box(spots[keySpot].x, spots[keySpot].y + 0.1, spots[keySpot].z, 0.9, 0.8, 1.0),
    label: "take the old key", mesh: key, isKey: true,
  });

  fills(group, [[6, 50], [22, 60], [46, 65], [67, 34], [83, 60]], 0x2e3648);
  scene.add(group);

  return {
    floor: 7, name: "the nursery",
    group, colliders, interactables, zones: [],
    bounds: { minX: 0.7, maxX: 89.3 },
    camClamp: [5, 86.5],
    spawnX: 2.8, stairX: 89.3, unlocked: false, keySpot,
    entity: {
      sense: "sight", shape: "nursery",
      waypoints: [17, 30, 45, 56, 70], dwellSeconds: 2.4, startIndex: 2,
      safeBelow: 13.5, safeAbove: 75,
    },
  };
}
