import * as THREE from "three";

// Shared vocabulary for building floors of the house. Every floor is one
// 2.5D strip of rooms; only the palette, the furniture and the sense that
// hunts you change as you go down.

export type InteractableType =
  | "hide"
  | "climb"
  | "carry"
  | "battery"
  | "lever" // valves, switches, things that change the room
  | "cover" // mirrors to drape, scent to mask — one-shot state changes
  | "door"; // the stairwell down

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
  /** Free-form hook the floor reads in its own update (valve id, mirror id). */
  tag?: string;
  /** Set by floors to run their own logic when used. */
  onUse?: (build: FloorBuild) => void;
}

/** Which sense the floor's warden hunts by. */
export type SenseKind =
  | "sight"
  | "sound"
  | "smell"
  | "echo"
  | "vibration"
  | "reflection"
  | "none";

export interface EntitySpec {
  sense: SenseKind;
  waypoints: number[];
  dwellSeconds: number;
  startIndex: number;
  /** Cosmetic: how its silhouette is built. */
  shape: "nursery" | "listener" | "feeder" | "whisperer" | "constrictor" | "mirror";
  /** Rooms it refuses to enter — safe thresholds, in world x. */
  safeBelow: number;
  safeAbove: number;
}

/** A zone with a gameplay meaning — water, soft cover, rug, smoke. */
export interface Zone {
  box: THREE.Box3;
  kind: "water" | "soft" | "quiet" | "mask" | "temptation" | "mirror";
  /** Mirrors/vents/etc. can be switched off once the player deals with them. */
  active?: boolean;
  mesh?: THREE.Object3D;
  tag?: string;
}

export interface FloorBuild {
  floor: number;
  name: string;
  group: THREE.Group;
  colliders: THREE.Box3[];
  interactables: Interactable[];
  zones: Zone[];
  bounds: { minX: number; maxX: number };
  camClamp: [number, number];
  spawnX: number;
  /** Where the stairwell down is, and whether it's open yet. */
  stairX: number;
  unlocked: boolean;
  keySpot: number;
  entity: EntitySpec | null;
  /** Per-floor tick, for water levels, scent decay, pings, mirrors. */
  update?: (dt: number, ctx: FloorContext) => void;
  /** Extra noise the floor's sense should consider this frame (0..1). */
  noise?: number;
}

export interface FloorContext {
  theoX: number;
  theoY: number;
  theoZ: number;
  theoTier: "still" | "sneak" | "walk" | "run";
  theoHidden: boolean;
  flashOn: boolean;
  /** Raised by the game when the player throws something. */
  decoy: { x: number; strength: number } | null;
}

export const D = 9; // strip depth — the walk lane sits at z = 0
export const H = 13; // ceiling height a child can barely see

export function solid(
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

export function box(
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

/** Diegetic wall text in a child's frantic hand. */
export function writing(
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

/** A page torn from Wren's journal, tucked where she left it. */
export function journalPage(group: THREE.Group, x: number, y = 0.5) {
  const page = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.56),
    new THREE.MeshStandardMaterial({ color: 0xb8b2a0, roughness: 1 })
  );
  page.position.set(x, y, -D / 2 + 0.1);
  page.rotation.z = 0.1;
  group.add(page);
  return page;
}

/** A child's crayon warning about the floor below. */
export function crayonDrawing(
  group: THREE.Group,
  x: number,
  y: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  caption: string
) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#c9c3ae";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#6d4034";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  draw(ctx);
  ctx.font = "600 26px 'Segoe Print', 'Comic Sans MS', cursive";
  ctx.fillStyle = "#6d4034";
  ctx.textAlign = "center";
  ctx.fillText(caption, 128, 246, 244);
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

/** The big old brass key every floor hides somewhere. */
export function makeKey(): THREE.Group {
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

/** Wall between rooms with a child-height doorway on the walk lane. */
export function divider(
  group: THREE.Group,
  colliders: THREE.Box3[],
  x: number,
  color = 0x171c26,
  gapH = 2.4
) {
  const gapZ = 1.0;
  solid(group, colliders, 1.2, H - gapH, D, x, gapH + (H - gapH) / 2, 0, color);
  const sideD = (D - gapZ * 2) / 2;
  solid(group, colliders, 1.2, gapH, sideD, x, gapH / 2, -(gapZ + sideD / 2), color);
  solid(group, colliders, 1.2, gapH, sideD, x, gapH / 2, gapZ + sideD / 2, color);
  solid(group, null, 1.4, 0.18, gapZ * 2, x, gapH + 0.09, 0, 0x1e2430);
}

/** Floor plane, back wall, skirting and the two end walls. */
export function shell(
  group: THREE.Group,
  colliders: THREE.Box3[],
  width: number,
  floorColor: number,
  wallColor: number
) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, D),
    new THREE.MeshStandardMaterial({ color: floorColor, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.x = width / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(width, H),
    new THREE.MeshStandardMaterial({ color: wallColor, roughness: 1 })
  );
  back.position.set(width / 2, H / 2, -D / 2);
  back.receiveShadow = true;
  group.add(back);

  solid(group, null, width, 0.9, 0.06, width / 2, 0.45, -D / 2 + 0.04, 0x1e2430);

  colliders.push(box(-0.6, H / 2, 0, 0.6, H / 2, D));
  colliders.push(box(width + 0.6, H / 2, 0, 0.6, H / 2, D));

  const endL = new THREE.Mesh(
    new THREE.PlaneGeometry(D, H),
    new THREE.MeshStandardMaterial({ color: wallColor, roughness: 1 })
  );
  endL.rotation.y = Math.PI / 2;
  endL.position.set(0, H / 2, 0);
  endL.receiveShadow = true;
  group.add(endL);
  const endR = endL.clone();
  endR.rotation.y = -Math.PI / 2;
  endR.position.set(width, H / 2, 0);
  group.add(endR);
}

/** The locked stairwell down, with cold air leaking under it. */
export function stairwellDoor(
  group: THREE.Group,
  x: number,
  glowColor = 0x9fb4d8
) {
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 8.6, 4.6),
    new THREE.MeshStandardMaterial({ color: 0x131720, roughness: 1 })
  );
  panel.position.set(x, 4.3, 0);
  group.add(panel);
  solid(group, null, 0.3, 0.3, 5.2, x - 0.1, 8.75, 0, 0x1e2430);

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.55, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x54492e, roughness: 0.7, metalness: 0.4 })
  );
  plate.position.set(x - 0.12, 1.15, 0);
  group.add(plate);

  const slit = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 0.14),
    new THREE.MeshBasicMaterial({ color: glowColor })
  );
  slit.rotation.y = -Math.PI / 2;
  slit.position.set(x - 0.05, 0.07, 0);
  group.add(slit);

  const light = new THREE.PointLight(glowColor, 26, 12, 1.9);
  light.position.set(x - 1.2, 0.5, 0.5);
  group.add(light);

  return { panel, plate };
}

/** Soft front fills so silhouettes never drown in pure black. */
export function fills(group: THREE.Group, spots: [number, number][], color: number) {
  for (const [x, intensity] of spots) {
    const f = new THREE.PointLight(color, intensity, 30, 1.5);
    f.position.set(x, 4.5, 5.5);
    group.add(f);
  }
}
