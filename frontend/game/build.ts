import * as THREE from "three";

// Shared vocabulary for building floors of the house. Every floor is one
// 2.5D strip of rooms; only the palette, the furniture and the sense that
// hunts you change as you go down.

// "use" is the verb that makes the house feel touchable: taps, drawers,
// chairs, pot stacks, a gramophone. Everything you handle makes a noise, and
// most of what lives here hunts by noise — so being curious costs you.
export type InteractableType =
  | "hide"
  | "climb"
  | "carry"
  | "battery"
  | "lever" // valves, switches, things that change the room
  | "cover" // mirrors to drape, scent to mask — one-shot state changes
  | "read" // Wren's journal
  | "use" // touch the world: it answers, and it is heard
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
  /** 0..1 — how loud handling this is. Most wardens can hear it. */
  noise?: number;
  /** Seconds the noise keeps drawing attention. Taps and gramophones run on. */
  sustain?: number;
  /** A "use" object can be handled more than once. */
  repeatable?: boolean;
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
  /**
   * A place the warden should be drawn to for as long as it lasts — a tap
   * left running, a record still playing. Unlike a thrown object this does
   * not expire on its own; the floor keeps setting it.
   */
  lure?: number;
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

// ── Shared geometry and materials ─────────────────────────────────
// Every solid() used to mint its own BoxGeometry and MeshStandardMaterial,
// which meant ~190 unique materials for ~280 meshes on a single floor and
// almost no batching. Boxes of the same size and blocks of the same colour
// are indistinguishable, so they are cached and reused across the house.
// Anything flagged `shared` must never be disposed with a floor.
const geoCache = new Map<string, THREE.BoxGeometry>();
const matCache = new Map<number, THREE.MeshStandardMaterial>();

function sharedBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

function sharedMatte(color: number): THREE.MeshStandardMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 1 });
    m.userData.shared = true;
    matCache.set(color, m);
  }
  return m;
}

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
  const mesh = new THREE.Mesh(sharedBox(w, h, d), sharedMatte(color));
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

/**
 * Wren got further than anyone. She left a page on every floor, tucked where
 * she hid. Her voice is a scared eleven-year-old, not a narrator — and her
 * last page stops mid-sentence one step from the door.
 */
export const WREN_PAGES: Record<number, string> = {
  7: "there were four of us when i woke up.\ni am writing this down so the next one knows.\nit sees you move. it does not see you if you are still.\n— wren",
  6: "tom went in the water.\ni counted to two hundred before i moved again.\nshe cannot see. she only listens.\nthrow something. she goes to the noise, not to you.",
  5: "it does not walk a route like the others.\nit walks where i walked, about a minute late.\ni stood in the smoke for a while and it went straight past me.\ni am so hungry.",
  4: "being still does not work here. i learned that badly.\nit makes a sound like a bat and the walls give me away.\nthe soft rooms are safe. the curtains, the books, the carpet.\nit talks in mum's voice. it is not mum.",
  3: "DO NOT RUN ON THE THIRD.\nit is under the floor. it does not care about noise or light.\nit only knows the boards.\ni crossed the long one on the furniture and it never knew i was there.",
  2: "i forgot my mum's face today.\ni looked in the glass to check mine and something in there\nlooked back and copied me a half second late.\ncover them. cover all of them.\nmy name is wren. i am going home.",
  1: "there is a door at the end and there is real light under it.\nthe rooms on the way are warm and they say things\nand i am so tired.\nit's not what you think. it's —",
};

/**
 * Everything else the children left. Wren's pages tell you how to survive;
 * these tell you who else was here, and — on the mirror floor — begin the
 * quiet argument about whether the bear under your arm was ever yours.
 */
export const FOUND_TEXT: Record<string, string> = {
  // Floor 7 — the room he wakes in
  "note:chart": [
    "pencil marks up the doorframe, one above the other.",
    "",
    "        wren   ——————   this tall",
    "        tom    ————     this tall",
    "        ivy    ———      this tall",
    "",
    "and one more, fresh, at the bottom.",
    "nobody wrote a name beside it.",
  ].join("\n"),

  // Floor 7 — the dolls' house
  "note:dollhouse": [
    "somebody built a model of a house and left it in the playroom.",
    "",
    "it has seven floors. the top one has a small bed in it",
    "and a smaller chair, and a window painted grey.",
    "",
    "the floors below are furnished too. there is a bath on the sixth.",
    "there are shelves on the fifth. the third has a long empty corridor",
    "and something has been pushed up underneath its floorboards.",
    "",
    "one room on the top floor has a light on.",
    "it is the room you woke up in.",
  ].join("\n"),

  // Floor 6 — Tom
  "note:shoes": [
    "a pair of shoes set side by side at the water's edge,",
    "laces tucked in, the way you leave them",
    "when you mean to come back for them.",
    "",
    "they are much too small to be yours.",
  ].join("\n"),

  // Floor 5 — Ivy
  "note:ivy": [
    "scratched into the shelf, low down, where an adult would not look:",
    "",
    "  IVY WAS HERE AND IVY IS STILL HERE",
    "  I AM NOT HUNGRY ANY MORE",
    "  I AM NOT ANYTHING ANY MORE",
    "",
    "the letters get rounder and softer toward the end,",
    "like whoever wrote them was forgetting how.",
  ].join("\n"),

  // Floor 4 — the house's own record of itself
  "note:ledger": [
    "a ledger, in an adult's handwriting. the only adult writing",
    "anywhere in this house.",
    "",
    "  arrived 14th — settled 2nd floor",
    "  arrived 3rd  — settled 5th floor",
    "  arrived 9th  — settled 3rd floor",
    "  arrived 27th — reached the ground floor",
    "",
    "the last line is scored out so hard the paper has torn.",
  ].join("\n"),

  // Floor 2 — the bear
  "note:bear": [
    "you hold the bear up so you can both be in the glass.",
    "",
    "there is a name tape stitched inside its ear.",
    "your mother sewed it there. you remember her doing it.",
    "you remember the kitchen table and the light and her hands.",
    "",
    "the name on the tape is not your name.",
    "",
    "you look at your own face in the glass for a long time",
    "and you cannot remember what it is supposed to look like either.",
  ].join("\n"),
};

export function journalPage(
  group: THREE.Group,
  x: number,
  y = 0.5,
  interactables?: Interactable[],
  floor?: number
) {
  const page = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.56),
    new THREE.MeshStandardMaterial({
      color: 0xc4bda8,
      emissive: 0x3a3830,
      emissiveIntensity: 0.5,
      roughness: 1,
    })
  );
  page.position.set(x, y, -D / 2 + 0.1);
  page.rotation.z = 0.1;
  group.add(page);

  if (interactables && floor !== undefined) {
    interactables.push({
      type: "read",
      trigger: box(x, 1.0, -2.0, 1.3, 1.4, 2.4),
      label: "read the page",
      tag: `wren${floor}`,
      mesh: page,
    });
  }
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
/**
 * A grab volume for a key resting at (x, y, z).
 *
 * Keys are seeded onto furniture — shelves, sills, the tops of dressers — so
 * they sit high and set back. A trigger merely centred on the key reaches
 * neither the floor nor the walk lane, and the key becomes impossible to pick
 * up by walking: you stand directly beneath it and the game offers nothing.
 * That, plus a silently-skipped locked door, is a floor with no way down.
 *
 * So the volume always spans from the ground up to just above the key, and
 * from wherever it rests forward to the lane the boy actually walks in.
 */
export function keyTrigger(x: number, y: number, z: number, hw = 1.2): THREE.Box3 {
  // It reaches DOWN only as far as the surface the key is resting on — a
  // child's reach, not the height of the room. Spanning all the way to the
  // ground fixed the unreachable case but broke the opposite one: a key left
  // on top of a 6.6m stack of crates, or along the rail of the cot, could be
  // taken from the floor below, skipping the climb the placement exists for.
  // 2.0 rather than a tighter number because a key can sit a shelf above the
  // highest rung — on the pantry ladder the top rung is 5.65 and the key is at
  // 7.65, which put the probe exactly ON the boundary at 1.5 and would have
  // depended on floating point for whether the floor was completable.
  const standY = Math.max(0, y - 2.0);
  const topY = Math.max(y + 0.7, standY + 1.6);
  return new THREE.Box3(
    new THREE.Vector3(x - hw, standY, Math.min(z - 0.9, -1.2)),
    new THREE.Vector3(x + hw, topY, Math.max(z + 0.9, 0.9))
  );
}

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

/**
 * The locked stairwell down, with cold air leaking under it. Pushes its own
 * interactable — the game only offers it once you are carrying that floor's
 * key, so this is the thing every floor is actually about.
 */
export function stairwellDoor(
  group: THREE.Group,
  interactables: Interactable[],
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

  interactables.push({
    type: "door",
    trigger: box(x - 1.5, 1.4, 0, 2.2, 1.8, 2.4),
    label: "unlock the door and go down",
    tag: "stairs",
  });

  return { panel, plate };
}

/**
 * Make something touchable. `noise` is the whole point: 0.2 is a drawer
 * sliding, 0.6 is a chair scraping, 1.0 is a stack of pans going over. Give
 * it `sustain` and it keeps calling attention to itself after you walk away —
 * which turns a running tap into a decoy you can plan around.
 */
export function usable(
  interactables: Interactable[],
  x: number, y: number, z: number,
  label: string,
  noise: number,
  opts: {
    tag?: string; sustain?: number; repeatable?: boolean;
    onUse?: (b: FloorBuild) => void;
    hw?: number; hh?: number; hd?: number;
  } = {}
) {
  // `z` is where the object sits; the trigger has to reach the walk lane at
  // z = 0 or he can never touch it from the floor. Centre it between the two
  // and make it deep enough to always span both.
  const tz = -0.5;
  const hd = opts.hd ?? Math.max(1.8, Math.abs(z - tz) + 1.0);
  interactables.push({
    type: "use",
    trigger: box(x, y, tz, opts.hw ?? 1.1, opts.hh ?? 1.2, hd),
    label, noise,
    sustain: opts.sustain,
    repeatable: opts.repeatable ?? true,
    tag: opts.tag,
    onUse: opts.onUse,
  });
}

// ── Props ──
// Non-colliding set dressing. A room reads as lived-in when it holds the
// leftovers of somebody living in it: the cup nobody finished, the coat still
// on its hook, the thing knocked over on the way out.

/** Cloth hanging from something — a sheet, a towel, a coat, a curtain. */
export function cloth(
  group: THREE.Group, x: number, y: number, w: number, h: number,
  color: number, z = -D / 2 + 0.5, tilt = 0
) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })
  );
  m.position.set(x, y, z);
  m.rotation.z = tilt;
  // Deliberately not a shadow caster. Hanging cloth is dressing, and every
  // caster is re-rendered into each shadow map every single frame.
  group.add(m);
  return m;
}

/** A framed picture on the back wall. Faces are always too dark to make out. */
export function picture(
  group: THREE.Group, x: number, y: number, w = 0.9, h = 1.2, frameColor = 0x332c26
) {
  solid(group, null, w + 0.12, h + 0.12, 0.08, x, y, -D / 2 + 0.1, frameColor);
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color: 0x2b2b31, roughness: 1 })
  );
  canvas.position.set(x, y, -D / 2 + 0.15);
  group.add(canvas);
  return canvas;
}

/** A row of small bottles, jars or tins on a surface. */
export function bottles(
  group: THREE.Group, x: number, y: number, z: number, n: number,
  palette: number[] = [0x4b5230, 0x5a3a26, 0x3f4442], scale = 1
) {
  for (let i = 0; i < n; i++) {
    const h = (0.16 + (i % 3) * 0.06) * scale;
    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05 * scale, 0.055 * scale, h, 8),
      new THREE.MeshStandardMaterial({
        color: palette[i % palette.length], roughness: 0.6,
        transparent: true, opacity: 0.9,
      })
    );
    b.position.set(x + i * 0.15 * scale, y + h / 2, z);
    group.add(b);
  }
}

/** Small debris scattered on the floor — the house does not tidy itself. */
export function debris(
  group: THREE.Group, x: number, span: number, n: number, color: number, z = -0.9, scale = 1
) {
  for (let i = 0; i < n; i++) {
    const s = (0.06 + ((i * 37) % 9) * 0.015) * scale;
    const d = new THREE.Mesh(
      new THREE.BoxGeometry(s, s * 0.6, s),
      new THREE.MeshStandardMaterial({ color, roughness: 1 })
    );
    d.position.set(
      x + ((i * 53) % 100) / 100 * span - span / 2,
      s * 0.3,
      z + (((i * 31) % 100) / 100 - 0.5) * 1.6
    );
    d.rotation.y = i * 0.7;
    group.add(d);
  }
}

/** Cobweb in a corner — thin crossed threads, barely there. */
export function cobweb(group: THREE.Group, x: number, y: number, size = 0.8) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x8f97a4, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
  });
  const web = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  web.position.set(x, y, -D / 2 + 0.2);
  web.rotation.z = Math.PI / 4;
  group.add(web);
  return web;
}

/** A pile of books, tipped over the way children leave them. */
export function bookPile(group: THREE.Group, x: number, y: number, z: number, n = 4) {
  const colors = [0x3d3524, 0x2f3a2c, 0x453a2a, 0x3a2f36];
  for (let i = 0; i < n; i++) {
    const b = solid(
      group, null, 0.34 - i * 0.02, 0.07, 0.26, x + i * 0.015, y + 0.04 + i * 0.075, z,
      colors[i % colors.length]
    );
    b.rotation.y = i * 0.18 - 0.2;
  }
}

/** Soft front fills so silhouettes never drown in pure black. */
export function fills(group: THREE.Group, spots: [number, number][], color: number) {
  for (const [x, intensity] of spots) {
    const f = new THREE.PointLight(color, intensity, 30, 1.5);
    f.position.set(x, 4.5, 5.5);
    group.add(f);
  }
}
