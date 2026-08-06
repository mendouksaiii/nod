import * as THREE from "three";

// Floor 7 graybox: one oversized nursery-scale room. Everything is a flat
// grey volume — geometry only exists to prove movement, hiding and climbing.

export type InteractableType = "hide" | "climb" | "carry" | "battery";

export interface Interactable {
  type: InteractableType;
  /** World-space trigger volume Theo must stand in. */
  trigger: THREE.Box3;
  label: string;
  /** hide: where Theo tweens to; pose while hidden */
  hidePoint?: THREE.Vector3;
  hidePose?: "crawl" | "stand";
  /** climb: the surface Theo mantles onto — top y, x-range, depth lane */
  climbTopY?: number;
  climbXMin?: number;
  climbXMax?: number;
  climbZ?: number;
  /** carry/battery: the mesh to attach or remove */
  mesh?: THREE.Object3D;
  consumed?: boolean;
}

export interface RoomBuild {
  group: THREE.Group;
  colliders: THREE.Box3[];
  interactables: Interactable[];
  bounds: { minX: number; maxX: number };
}

const WALL = 0x1b212c;
const FLOOR = 0x161b24;
const FURNITURE = 0x252b38;
const FURNITURE_DARK = 0x1e2430;

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

export function buildRoom(scene: THREE.Scene): RoomBuild {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const interactables: Interactable[] = [];

  const W = 36; // room width  (x: -18 .. 18)
  const H = 13; // room height — a ceiling a child can barely see
  const D = 9; // depth       (z: -4.5 .. 4.5)

  // Shell
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: FLOOR, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({ color: WALL, roughness: 1 })
  );
  back.position.set(0, H / 2, -D / 2);
  back.receiveShadow = true;
  group.add(back);

  // Side walls block movement
  colliders.push(trigger(-W / 2 - 0.5, H / 2, 0, 0.5, H / 2, D));
  colliders.push(trigger(W / 2 + 0.5, H / 2, 0, 0.5, H / 2, D));

  // Skirting board — the one human-scale detail, comically high
  solid(group, null, W, 0.9, 0.06, 0, 0.45, -D / 2 + 0.04, FURNITURE_DARK);

  // Window: tall, cold, sourceless. Pure emissive plane high on the wall.
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x0c1118,
    emissive: 0x2c3a52,
    emissiveIntensity: 1.4,
    roughness: 1,
  });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.5), winMat);
  win.position.set(-3.5, 7.6, -D / 2 + 0.02);
  group.add(win);
  const mullionV = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 6.5, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x10151d, roughness: 1 })
  );
  mullionV.position.set(-3.5, 7.6, -D / 2 + 0.05);
  group.add(mullionV);
  const mullionH = mullionV.clone();
  mullionH.scale.set(24, 0.02154, 1); // 3.4/0.14 wide, 0.14/6.5 tall
  group.add(mullionH);
  mullionH.position.set(-3.5, 7.6, -D / 2 + 0.05);

  // ── The giant bed (left): platform on legs, hideable gap beneath ──
  const bedX = -11;
  const legH = 0.62;
  solid(group, colliders, 6.4, 0.5, 4.2, bedX, legH + 0.25, -1.2, FURNITURE); // frame
  solid(group, colliders, 6.0, 0.45, 3.9, bedX, legH + 0.72, -1.2, 0x2b3140); // mattress
  for (const [lx, lz] of [
    [bedX - 2.9, -3.0],
    [bedX + 2.9, -3.0],
    [bedX - 2.9, 0.6],
    [bedX + 2.9, 0.6],
  ]) {
    solid(group, colliders, 0.35, legH, 0.35, lx, legH / 2, lz, FURNITURE_DARK);
  }
  // headboard
  solid(group, colliders, 0.4, 3.4, 4.2, bedX - 3.3, 1.7, -1.2, FURNITURE_DARK);
  interactables.push({
    type: "hide",
    trigger: trigger(bedX, 0.6, 1.2, 3.0, 0.6, 1.2),
    label: "hide under the bed",
    hidePoint: new THREE.Vector3(bedX, 0, -1.2),
    hidePose: "crawl",
  });

  // ── The wardrobe (far right): tall enough to be wrong ──
  const wardX = 14.5;
  solid(group, colliders, 4.0, 9.5, 2.6, wardX, 4.75, -2.6, FURNITURE);
  // door left ajar — a slab angled off the front face
  const door = solid(group, null, 1.8, 8.8, 0.12, wardX - 1.6, 4.4, -1.0, FURNITURE_DARK);
  door.rotation.y = 0.55;
  interactables.push({
    type: "hide",
    trigger: trigger(wardX - 0.5, 1, -0.6, 1.6, 1, 1.1),
    label: "hide in the wardrobe",
    hidePoint: new THREE.Vector3(wardX - 0.3, 0, -2.4),
    hidePose: "stand",
  });

  // ── Climbable stack (center-right): toybox → chest → dresser top ──
  solid(group, colliders, 2.2, 0.85, 2.4, 3.2, 0.425, -1.6, FURNITURE);
  interactables.push({
    type: "climb",
    trigger: trigger(2.0, 0.6, 0, 0.55, 0.6, 1.4),
    label: "climb up",
    climbTopY: 0.85,
    climbXMin: 2.2,
    climbXMax: 4.2,
    climbZ: -1.6,
  });
  solid(group, colliders, 2.2, 1.75, 2.4, 5.3, 0.875, -1.6, FURNITURE);
  interactables.push({
    type: "climb",
    trigger: trigger(4.15, 1.6, -1.6, 0.5, 0.75, 1.3),
    label: "climb up",
    climbTopY: 1.75,
    climbXMin: 4.3,
    climbXMax: 6.3,
    climbZ: -1.6,
  });
  solid(group, colliders, 2.6, 2.9, 2.4, 7.6, 1.45, -1.6, FURNITURE_DARK);
  interactables.push({
    type: "climb",
    trigger: trigger(6.35, 2.5, -1.6, 0.45, 0.8, 1.3),
    label: "climb up",
    climbTopY: 2.9,
    climbXMin: 6.4,
    climbXMax: 8.8,
    climbZ: -1.6,
  });

  // ── The pipe (back wall, left of center): crawl-in hiding ──
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 6, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x2a303c,
      roughness: 1,
      side: THREE.DoubleSide,
    })
  );
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(-3, 0.55, -3.6);
  pipe.castShadow = true;
  pipe.receiveShadow = true;
  group.add(pipe);
  interactables.push({
    type: "hide",
    trigger: trigger(-3, 0.7, -0.9, 2.6, 0.7, 1.5),
    label: "crawl into the pipe",
    hidePoint: new THREE.Vector3(-3, 0.1, -3.6),
    hidePose: "crawl",
  });

  // ── Carryables ──
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x4a4054, roughness: 1 })
  );
  block.position.set(0.4, 0.17, 0.6);
  block.castShadow = true;
  group.add(block);
  interactables.push({
    type: "carry",
    trigger: trigger(0.4, 0.5, 0.6, 0.8, 0.5, 0.8),
    label: "pick up the block",
    mesh: block,
  });

  const key = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.08, 0.16),
    new THREE.MeshStandardMaterial({
      color: 0x6a5c37,
      roughness: 0.8,
      metalness: 0.4,
    })
  );
  key.position.set(-6.2, 0.04, 0.8);
  key.castShadow = true;
  group.add(key);
  interactables.push({
    type: "carry",
    trigger: trigger(-6.2, 0.4, 0.8, 0.7, 0.4, 0.7),
    label: "pick up the key",
    mesh: key,
  });

  // ── Battery cell on the toybox top — climb to reach it ──
  const cell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10),
    new THREE.MeshStandardMaterial({
      color: 0x3a4a3e,
      emissive: 0x223a26,
      emissiveIntensity: 0.8,
      roughness: 0.9,
    })
  );
  cell.position.set(3.2, 1.0, -1.0);
  cell.castShadow = true;
  group.add(cell);
  interactables.push({
    type: "battery",
    trigger: trigger(3.2, 1.3, -1.0, 0.7, 0.5, 1.0),
    label: "take the battery",
    mesh: cell,
  });

  scene.add(group);
  return { group, colliders, interactables, bounds: { minX: -17.4, maxX: 17.4 } };
}
