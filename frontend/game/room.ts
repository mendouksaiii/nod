import * as THREE from "three";

// Floor 7 — the Nursery. Five rooms on one 2.5D strip (x: 0..90).
// Landing → cot room → playroom → wardrobe room → stair antechamber.
// Still graybox: flat volumes, one light per room, no textures except
// the diegetic wall writings. `seed` picks the key spot and which
// optional writings exist — the slot the Inco run seed will fill later.

export type InteractableType = "hide" | "climb" | "carry" | "battery";

export interface Interactable {
  type: InteractableType;
  trigger: THREE.Box3;
  label: string;
  hidePoint?: THREE.Vector3;
  hidePose?: "crawl" | "stand";
  climbTopY?: number;
  climbXMin?: number;
  climbXMax?: number;
  climbZ?: number;
  mesh?: THREE.Object3D;
  consumed?: boolean;
  isKey?: boolean;
}

export interface RoomBuild {
  group: THREE.Group;
  colliders: THREE.Box3[];
  interactables: Interactable[];
  bounds: { minX: number; maxX: number };
  camClamp: [number, number];
  spawnX: number;
  keySpot: number;
}

const WALL = 0x1b212c;
const WALL_DIVIDER = 0x171c26;
const FLOOR = 0x161b24;
const FURNITURE = 0x252b38;
const FURNITURE_DARK = 0x1e2430;
const STRIP_W = 90;
const H = 13;
const D = 9;

function solid(
  group: THREE.Group,
  colliders: THREE.Box3[] | null,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 1 })
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (colliders) {
    colliders.push(
      new THREE.Box3(
        new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)
      )
    );
  }
  return mesh;
}

function trigger(
  cx: number,
  cy: number,
  cz: number,
  hw: number,
  hh: number,
  hd: number
): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(cx - hw, cy - hh, cz - hd),
    new THREE.Vector3(cx + hw, cy + hh, cz + hd)
  );
}

/** Diegetic wall text in a child's hand, drawn to a canvas texture. */
function writing(
  group: THREE.Group,
  text: string,
  x: number,
  y: number,
  width = 3.2,
  color = "#79839c"
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "600 72px 'Segoe Print', 'Comic Sans MS', cursive";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 128, 980);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
  );
  plane.position.set(x, y, -D / 2 + 0.06);
  plane.rotation.z = (Math.random() - 0.5) * 0.06;
  group.add(plane);
}

/** A child's crayon drawing taped to the wall. */
function crayonDrawing(group: THREE.Group, x: number, y: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#c9c3ae";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#6d4034";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  // a tall wobbly figure with too-long ears — floor 6's listener
  ctx.beginPath();
  ctx.ellipse(128, 84, 34, 40, 0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath(); // ears
  ctx.moveTo(102, 56);
  ctx.quadraticCurveTo(84, -6, 106, 30);
  ctx.moveTo(154, 54);
  ctx.quadraticCurveTo(178, -10, 152, 28);
  ctx.stroke();
  ctx.beginPath(); // body + arms to the floor
  ctx.moveTo(128, 124);
  ctx.lineTo(124, 210);
  ctx.moveTo(112, 140);
  ctx.lineTo(74, 226);
  ctx.moveTo(146, 140);
  ctx.lineTo(188, 228);
  ctx.stroke();
  // no eyes: scribbled out
  ctx.lineWidth = 4;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(106 + Math.random() * 10, 74 + Math.random() * 12);
    ctx.lineTo(120 + Math.random() * 10, 82 + Math.random() * 10);
    ctx.moveTo(134 + Math.random() * 10, 74 + Math.random() * 12);
    ctx.lineTo(148 + Math.random() * 10, 82 + Math.random() * 10);
    ctx.stroke();
  }
  ctx.font = "600 30px 'Segoe Print', 'Comic Sans MS', cursive";
  ctx.fillStyle = "#6d4034";
  ctx.textAlign = "center";
  ctx.fillText("it lives in the water", 128, 246);
  // tape corners
  ctx.fillStyle = "rgba(180,176,156,0.8)";
  ctx.fillRect(8, 2, 52, 20);
  ctx.fillRect(196, 2, 52, 20);

  const tex = new THREE.CanvasTexture(canvas);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  plane.position.set(x, y, -D / 2 + 0.07);
  plane.rotation.z = -0.05;
  group.add(plane);
}

/** A big old brass key. */
function makeKey(): THREE.Group {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({
    color: 0x7d6b3d,
    roughness: 0.6,
    metalness: 0.5,
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.62, 8), brass);
  shaft.rotation.z = Math.PI / 2;
  g.add(shaft);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 8, 14), brass);
  bow.position.x = -0.36;
  g.add(bow);
  const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.06), brass);
  tooth1.position.set(0.26, -0.11, 0);
  g.add(tooth1);
  const tooth2 = tooth1.clone();
  tooth2.position.set(0.14, -0.09, 0);
  g.add(tooth2);
  g.traverse((m) => (m.castShadow = true));
  return g;
}

/** Dividing wall with a child-height doorway at the walk lane. */
function divider(group: THREE.Group, colliders: THREE.Box3[], x: number) {
  const gapZ = 1.0;
  const gapH = 2.4;
  // above the doorway
  solid(group, colliders, 1.2, H - gapH, D, x, gapH + (H - gapH) / 2, 0, WALL_DIVIDER);
  // beside it (back and front of the walk lane)
  const sideD = (D - gapZ * 2) / 2;
  solid(group, colliders, 1.2, gapH, sideD, x, gapH / 2, -(gapZ + sideD / 2), WALL_DIVIDER);
  solid(group, colliders, 1.2, gapH, sideD, x, gapH / 2, gapZ + sideD / 2, WALL_DIVIDER);
  // door frame trim
  solid(group, null, 1.4, 0.18, gapZ * 2, x, gapH + 0.09, 0, FURNITURE_DARK);
}

export function buildRoom(scene: THREE.Scene, seed: number): RoomBuild {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const interactables: Interactable[] = [];

  // ── Shell ──
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(STRIP_W, D),
    new THREE.MeshStandardMaterial({ color: FLOOR, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.x = STRIP_W / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(STRIP_W, H),
    new THREE.MeshStandardMaterial({ color: WALL, roughness: 1 })
  );
  back.position.set(STRIP_W / 2, H / 2, -D / 2);
  back.receiveShadow = true;
  group.add(back);

  // skirting the height of a fence
  solid(group, null, STRIP_W, 0.9, 0.06, STRIP_W / 2, 0.45, -D / 2 + 0.04, FURNITURE_DARK);

  // end walls
  colliders.push(trigger(-0.6, H / 2, 0, 0.6, H / 2, D));
  colliders.push(trigger(STRIP_W + 0.6, H / 2, 0, 0.6, H / 2, D));
  const endL = new THREE.Mesh(
    new THREE.PlaneGeometry(D, H),
    new THREE.MeshStandardMaterial({ color: WALL, roughness: 1 })
  );
  endL.rotation.y = Math.PI / 2;
  endL.position.set(0, H / 2, 0);
  endL.receiveShadow = true;
  group.add(endL);
  const endR = endL.clone();
  endR.rotation.y = -Math.PI / 2;
  endR.position.set(STRIP_W, H / 2, 0);
  group.add(endR);

  // room dividers
  divider(group, colliders, 12);
  divider(group, colliders, 34);
  divider(group, colliders, 58);
  divider(group, colliders, 76);

  // ════ Room 1 — the landing (0..12) ════
  // The sealed way up: a doorframe that leads nowhere, boarded shut.
  solid(group, null, 2.6, 5.2, 0.14, 4.5, 2.6, -D / 2 + 0.09, 0x11151d);
  solid(group, null, 3.0, 0.22, 0.2, 4.5, 5.3, -D / 2 + 0.12, FURNITURE_DARK);
  solid(group, null, 0.22, 5.2, 0.2, 3.1, 2.6, -D / 2 + 0.12, FURNITURE_DARK);
  solid(group, null, 0.22, 5.2, 0.2, 5.9, 2.6, -D / 2 + 0.12, FURNITURE_DARK);
  const board1 = solid(group, null, 3.2, 0.3, 0.1, 4.5, 3.4, -D / 2 + 0.18, 0x2c3040);
  board1.rotation.z = 0.14;
  const board2 = solid(group, null, 3.2, 0.3, 0.1, 4.5, 1.9, -D / 2 + 0.18, 0x2c3040);
  board2.rotation.z = -0.1;
  writing(group, "nod", 6.9, 2.1, 1.1, "#5d6579");
  writing(group, "the stairs only go down", 6.2, 4.6, 3.6);

  // rug, stool — the one almost-warm corner of the floor
  solid(group, null, 5, 0.05, 3.2, 6.5, 0.025, 0.4, 0x2a2733);
  solid(group, colliders, 1.1, 1.15, 1.1, 9.8, 0.575, -2.6, FURNITURE);

  const landingLamp = new THREE.PointLight(0x8a7a5e, 90, 18, 1.5);
  landingLamp.position.set(5, 6, 1.5);
  group.add(landingLamp);

  // ════ Room 2 — the cot room (12..34) ════
  const cotX = 21.5;
  // platform + legs: a cot the size of a shipping container
  solid(group, colliders, 11, 0.5, 4, cotX, 2.35, -1.5, FURNITURE);
  solid(group, colliders, 10.6, 0.4, 3.7, cotX, 2.8, -1.5, 0x2b3140);
  // Front legs sit inset — the walk lane (z≈0) must stay clear end to end
  for (const lx of [cotX - 5.2, cotX + 5.2]) {
    for (const lz of [-3.2, -0.75]) {
      solid(group, colliders, 0.5, 2.1, 0.5, lx, 1.05, lz, FURNITURE_DARK);
    }
  }
  // bars: visual only, in front of the mattress
  const barMat = new THREE.MeshStandardMaterial({ color: 0x1c222e, roughness: 1 });
  for (let bx = cotX - 5.2; bx <= cotX + 5.2; bx += 0.95) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.8, 8), barMat);
    bar.position.set(bx, 4.5, 0.45);
    bar.castShadow = true;
    group.add(bar);
  }
  solid(group, null, 11, 0.22, 0.22, cotX, 6.4, 0.45, FURNITURE_DARK);

  // step-stool → cot top
  solid(group, colliders, 1.4, 1.15, 1.6, 14.9, 0.575, -1.2, FURNITURE);
  interactables.push({
    type: "climb",
    trigger: trigger(14.0, 0.7, 0, 0.6, 0.7, 1.3),
    label: "climb up",
    climbTopY: 1.15,
    climbXMin: 14.3,
    climbXMax: 15.5,
    climbZ: -1.2,
  });
  interactables.push({
    type: "climb",
    trigger: trigger(15.7, 1.8, -1.2, 0.55, 0.75, 1.2),
    label: "climb into the cot",
    climbTopY: 3.0,
    climbXMin: 16.3,
    climbXMax: 26.6,
    climbZ: -1.5,
  });
  interactables.push({
    type: "hide",
    trigger: trigger(cotX, 0.6, 0.6, 5.0, 0.6, 1.0),
    label: "hide under the cot",
    hidePoint: new THREE.Vector3(cotX - 1, 0, -1.5),
    hidePose: "crawl",
  });

  // laundry basket
  const basket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.8, 1.5, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2e3341, roughness: 1, side: THREE.DoubleSide })
  );
  basket.position.set(30, 0.75, -1.3);
  basket.castShadow = true;
  group.add(basket);
  interactables.push({
    type: "hide",
    trigger: trigger(30, 0.7, 0.2, 1.2, 0.7, 1.2),
    label: "hide in the basket",
    hidePoint: new THREE.Vector3(30, 0.15, -1.3),
    hidePose: "stand",
  });

  // the ones who came before: shoes and height marks
  for (let i = 0; i < 5; i++) {
    solid(group, null, 0.34, 0.14, 0.5, 31.2 + i * 0.55, 0.07, -3.9, 0x2a2f3c);
  }
  writing(group, "— wren    — tom    — ivy", 32.2, 1.6, 2.6, "#69718a");
  writing(group, "stay still. it sees you move.", 21.5, 5.1, 4.6, "#8b93a8");

  const cotLight = new THREE.PointLight(0x46587c, 130, 26, 1.5);
  cotLight.position.set(20, 9, 2);
  group.add(cotLight);

  // ════ Room 3 — the playroom (34..58) ════
  // the window and its cold shaft — the floor's dangerous light
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x0c1118,
    emissive: 0x39496a,
    emissiveIntensity: 1.6,
    roughness: 1,
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

  // giant letter blocks, a terrace to nowhere (yet)
  solid(group, colliders, 2.2, 1.0, 2.4, 36.6, 0.5, -1.6, FURNITURE);
  interactables.push({
    type: "climb",
    trigger: trigger(35.3, 0.7, 0, 0.6, 0.7, 1.4),
    label: "climb up",
    climbTopY: 1.0,
    climbXMin: 35.7,
    climbXMax: 37.5,
    climbZ: -1.6,
  });
  solid(group, colliders, 2.2, 2.0, 2.4, 38.9, 1.0, -1.6, FURNITURE_DARK);
  interactables.push({
    type: "climb",
    trigger: trigger(37.7, 1.75, -1.6, 0.5, 0.8, 1.3),
    label: "climb up",
    climbTopY: 2.0,
    climbXMin: 38.0,
    climbXMax: 39.8,
    climbZ: -1.6,
  });
  solid(group, colliders, 2.2, 3.0, 2.4, 41.2, 1.5, -1.6, FURNITURE);
  interactables.push({
    type: "climb",
    trigger: trigger(40.0, 2.7, -1.6, 0.5, 0.85, 1.3),
    label: "climb up",
    climbTopY: 3.0,
    climbXMin: 40.3,
    climbXMax: 42.1,
    climbZ: -1.6,
  });

  // toy chest, lid ajar
  solid(group, colliders, 2.8, 1.15, 1.9, 50, 0.575, -1.4, FURNITURE);
  const lid = solid(group, null, 2.8, 0.14, 1.9, 50, 1.35, -1.9, FURNITURE_DARK);
  lid.rotation.x = -0.5;
  interactables.push({
    type: "hide",
    trigger: trigger(50, 0.7, 0.4, 1.7, 0.7, 1.1),
    label: "hide in the toy chest",
    hidePoint: new THREE.Vector3(50, 0.2, -1.4),
    hidePose: "crawl",
  });

  // rocking horse: body, head, rockers
  const horse = new THREE.Group();
  const horseMat = new THREE.MeshStandardMaterial({ color: 0x33313f, roughness: 1 });
  const hb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.7), horseMat);
  hb.position.y = 1.7;
  horse.add(hb);
  const hh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.5), horseMat);
  hh.position.set(0.95, 2.5, 0);
  hh.rotation.z = -0.25;
  horse.add(hh);
  for (const rz of [-0.3, 0.3]) {
    const rocker = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.09, 8, 20, Math.PI * 0.75),
      horseMat
    );
    rocker.rotation.z = Math.PI + Math.PI * 0.125;
    rocker.position.set(0, 1.45, rz);
    horse.add(rocker);
  }
  for (const [lx2, ly] of [
    [-0.7, 1.05],
    [0.7, 1.05],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.5), horseMat);
    leg.position.set(lx2, ly, 0);
    horse.add(leg);
  }
  horse.position.set(55, 0, -2.2);
  horse.traverse((m) => {
    m.castShadow = true;
  });
  group.add(horse);
  colliders.push(trigger(55, 1.4, -2.2, 1.3, 1.4, 0.6));

  // a ball and a carryable block
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0x3c3644, roughness: 1 })
  );
  ball.position.set(43.5, 0.5, 0.8);
  ball.castShadow = true;
  group.add(ball);
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.36, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x453d52, roughness: 1 })
  );
  block.position.set(47.5, 0.18, 0.5);
  block.castShadow = true;
  group.add(block);
  interactables.push({
    type: "carry",
    trigger: trigger(47.5, 0.5, 0.5, 0.8, 0.5, 0.9),
    label: "pick up the block",
    mesh: block,
  });

  if ((seed >> 3) % 2 === 0) {
    writing(group, "it walks when the house sleeps", 52.5, 4.4, 4.0, "#6d7590");
  }

  // ════ Room 4 — the wardrobe room (58..76) ════
  // wardrobe A
  solid(group, colliders, 3.4, 8.5, 2.4, 60.9, 4.25, -2.2, FURNITURE);
  const doorA = solid(group, null, 1.5, 7.8, 0.12, 59.7, 3.9, -0.7, FURNITURE_DARK);
  doorA.rotation.y = 0.5;
  interactables.push({
    type: "hide",
    trigger: trigger(60.9, 1, -0.3, 1.4, 1, 1.2),
    label: "hide in the wardrobe",
    hidePoint: new THREE.Vector3(60.9, 0, -2.0),
    hidePose: "stand",
  });

  // dresser with pulled drawers as steps, on legs (crawl gap beneath)
  solid(group, colliders, 3.4, 2.4, 2.2, 65.5, 1.7, -1.8, FURNITURE);
  for (const [lx3, lz3] of [
    [64.0, -2.7],
    [67.0, -2.7],
    [64.0, -0.9],
    [67.0, -0.9],
  ]) {
    solid(group, colliders, 0.28, 0.5, 0.28, lx3, 0.25, lz3, FURNITURE_DARK);
  }
  solid(group, colliders, 2.9, 0.24, 0.9, 65.5, 0.85, -0.85, FURNITURE_DARK); // drawer 1
  solid(group, colliders, 2.9, 0.24, 0.8, 65.5, 1.8, -1.0, FURNITURE_DARK); // drawer 2
  interactables.push({
    type: "climb",
    trigger: trigger(65.5, 0.6, 0.3, 1.5, 0.6, 0.9),
    label: "climb the drawers",
    climbTopY: 0.97,
    climbXMin: 64.2,
    climbXMax: 66.8,
    climbZ: -0.85,
  });
  interactables.push({
    type: "climb",
    trigger: trigger(65.5, 1.5, -0.85, 1.4, 0.6, 0.7),
    label: "climb up",
    climbTopY: 1.92,
    climbXMin: 64.2,
    climbXMax: 66.8,
    climbZ: -1.0,
  });
  interactables.push({
    type: "climb",
    trigger: trigger(65.5, 2.4, -1.0, 1.4, 0.65, 0.7),
    label: "climb onto the dresser",
    climbTopY: 2.9,
    climbXMin: 64.2,
    climbXMax: 66.8,
    climbZ: -1.8,
  });
  interactables.push({
    type: "hide",
    trigger: trigger(65.5, 0.5, 0.6, 1.6, 0.5, 0.9),
    label: "hide under the dresser",
    hidePoint: new THREE.Vector3(65.5, 0, -1.8),
    hidePose: "crawl",
  });

  // battery on the dresser top
  const cell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10),
    new THREE.MeshStandardMaterial({
      color: 0x3a4a3e,
      emissive: 0x223a26,
      emissiveIntensity: 0.8,
      roughness: 0.9,
    })
  );
  cell.position.set(66.3, 3.05, -1.8);
  cell.castShadow = true;
  group.add(cell);
  interactables.push({
    type: "battery",
    trigger: trigger(66.3, 3.3, -1.8, 0.8, 0.6, 1.0),
    label: "take the battery",
    mesh: cell,
  });

  // crate stack → tall wardrobe top
  solid(group, colliders, 1.9, 4.4, 2.0, 68.4, 2.2, -2.1, FURNITURE_DARK);
  interactables.push({
    type: "climb",
    trigger: trigger(67.2, 3.4, -1.8, 0.55, 0.8, 1.0),
    label: "climb the crates",
    climbTopY: 4.4,
    climbXMin: 67.6,
    climbXMax: 69.2,
    climbZ: -2.1,
  });
  solid(group, colliders, 3.2, 6.6, 2.4, 70.9, 3.3, -2.2, FURNITURE);
  interactables.push({
    type: "climb",
    trigger: trigger(69.5, 5.2, -2.1, 0.5, 0.9, 1.0),
    label: "climb on top",
    climbTopY: 6.6,
    climbXMin: 69.5,
    climbXMax: 72.3,
    climbZ: -2.2,
  });

  // floor pipe along the back wall
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.52, 3.6, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x2a303c,
      roughness: 1,
      side: THREE.DoubleSide,
    })
  );
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(74.2, 0.52, -3.8);
  pipe.castShadow = true;
  group.add(pipe);
  interactables.push({
    type: "hide",
    trigger: trigger(74.2, 0.7, -0.9, 1.6, 0.7, 1.6),
    label: "crawl into the pipe",
    hidePoint: new THREE.Vector3(74.2, 0.1, -3.8),
    hidePose: "crawl",
  });

  if ((seed >> 5) % 2 === 0) {
    writing(group, "some of these are not wardrobes", 63.5, 6.2, 4.2, "#69718a");
  }

  // Low and forward: the tall wardrobes eat anything hung near the ceiling
  const wardLight = new THREE.PointLight(0x53604f, 85, 24, 1.5);
  wardLight.position.set(66, 4.5, 2.6);
  group.add(wardLight);
  const wardLight2 = new THREE.PointLight(0x414d45, 55, 19, 1.6);
  wardLight2.position.set(72.5, 3.2, 2.2);
  group.add(wardLight2);

  // ════ Room 5 — the stair antechamber (76..90) ════
  // the stairwell door on the end wall, big enough for something larger
  const doorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 8.6, 4.6),
    new THREE.MeshStandardMaterial({ color: 0x131720, roughness: 1 })
  );
  doorPanel.position.set(89.8, 4.3, 0);
  group.add(doorPanel);
  solid(group, null, 0.3, 0.3, 5.2, 89.7, 8.75, 0, FURNITURE_DARK);
  // keyhole plate at a child's eye height
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.55, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x54492e, roughness: 0.7, metalness: 0.4 })
  );
  plate.position.set(89.68, 1.15, 0);
  group.add(plate);

  // cold air under the door
  const slit = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x9fb4d8 })
  );
  slit.rotation.y = -Math.PI / 2;
  slit.position.set(89.75, 0.07, 0);
  group.add(slit);
  const slitLight = new THREE.PointLight(0x8fa5cc, 26, 12, 1.9);
  slitLight.position.set(88.6, 0.5, 0.5);
  group.add(slitLight);

  crayonDrawing(group, 80, 2.1);
  writing(group, "down is out", 84.5, 4.9, 2.8, "#79839c");

  // wren's journal page, tucked at the skirting
  const page = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.56),
    new THREE.MeshStandardMaterial({ color: 0xb8b2a0, roughness: 1 })
  );
  page.position.set(84.2, 0.5, -D / 2 + 0.1);
  page.rotation.z = 0.1;
  group.add(page);

  const anteLight = new THREE.PointLight(0x3e4a66, 100, 22, 1.5);
  anteLight.position.set(82, 7, 2);
  group.add(anteLight);

  // ════ The key — its spot picked by the run seed ════
  const keySpot = seed % 3;
  const key = makeKey();
  const keyPositions: [THREE.Vector3, string][] = [
    [new THREE.Vector3(24.3, 2.95, -1.5), "in the cot"],
    [new THREE.Vector3(50.6, 1.32, -1.15), "on the toy chest"],
    [new THREE.Vector3(70.9, 6.72, -2.2), "on the tall wardrobe"],
  ];
  const [keyPos] = keyPositions[keySpot];
  key.position.copy(keyPos);
  group.add(key);
  interactables.push({
    type: "carry",
    trigger: trigger(keyPos.x, keyPos.y + 0.1, keyPos.z, 0.9, 0.8, 1.0),
    label: "take the old key",
    mesh: key,
    isKey: true,
  });

  // soft front fills so rooms never drown
  for (const [fx, fi] of [
    [6, 50],
    [22, 60],
    [46, 65],
    [67, 34],
    [83, 60],
  ]) {
    const fill = new THREE.PointLight(0x2e3648, fi, 30, 1.5);
    fill.position.set(fx, 4.5, 5.5);
    group.add(fill);
  }

  scene.add(group);
  return {
    group,
    colliders,
    interactables,
    bounds: { minX: 0.7, maxX: 89.3 },
    camClamp: [5, 86.5],
    spawnX: 2.8,
    keySpot,
  };
}
