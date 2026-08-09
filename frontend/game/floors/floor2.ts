import * as THREE from "three";
import {
  box, crayonDrawing, D, divider, fills, FloorBuild, journalPage,
  makeKey, shell, solid, stairwellDoor, writing, Zone,
} from "../build";

// FLOOR 2 — THE MIRROR FLOOR. Cold silvers over rot. The thing here wears
// faces; it was a child who forgot their own. It cannot cross a floor with
// no glass in it — it only reaches through mirrors that are still uncovered.
//
// So the floor is a chore under pressure: find sheets, drape every mirror,
// and take the key from behind the last one you dare to uncover.
//
// This is where Wren's last page is, and where you stop being sure she made it.

const WALL = 0x232630;
const FLOOR = 0x171a21;
const FRAME = 0x2c2b33;
const DARK = 0x1b1e26;
const W = 92;

interface MirrorRef {
  zone: Zone;
  glass: THREE.Mesh;
  sheet: THREE.Mesh;
}

export function buildFloor2(scene: THREE.Scene, seed: number): FloorBuild {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const interactables: FloorBuild["interactables"] = [];
  const zones: Zone[] = [];
  const mirrors: MirrorRef[] = [];

  shell(group, colliders, W, FLOOR, WALL);
  for (const dx of [11, 27, 43, 58, 74]) divider(group, colliders, dx, DARK);

  /** A tall mirror: live glass until you drape it. */
  function mirror(x: number, h = 6.5, w = 2.8) {
    solid(group, null, w + 0.5, h + 0.5, 0.3, x, h / 2 + 0.4, -D / 2 + 0.16, FRAME);
    // No env map to reflect, so the glass has to carry its own cold light —
    // otherwise a mirror is just a dark rectangle with a specular dot.
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        color: 0x8fa0b8, roughness: 0.12, metalness: 0.75,
        emissive: 0x4a5c76, emissiveIntensity: 1.15,
      })
    );
    glass.position.set(x, h / 2 + 0.4, -D / 2 + 0.32);
    group.add(glass);

    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 0.6, h + 0.8),
      new THREE.MeshStandardMaterial({ color: 0x585c62, roughness: 1, side: THREE.DoubleSide })
    );
    sheet.position.set(x, h / 2 + 0.5, -D / 2 + 0.42);
    sheet.visible = false;
    group.add(sheet);

    const zone: Zone = {
      box: box(x, h / 2, -1.5, w / 2 + 0.6, h / 2 + 1, 3),
      kind: "mirror", active: true, tag: `m${x}`,
    };
    zones.push(zone);
    const ref = { zone, glass, sheet };
    mirrors.push(ref);

    interactables.push({
      type: "cover",
      trigger: box(x, 1.0, -1.0, 1.8, 1.2, 1.8),
      label: "cover the mirror",
      tag: `m${x}`,
      onUse: () => {
        zone.active = false;
        sheet.visible = true;
        glass.visible = false;
      },
    });
    return ref;
  }

  // ── Landing (0–11): no glass. The last safe air on this floor ──
  writing(group, "cover the mirrors", 6, 4.8, 4.2, "#9aa4b4");
  journalPage(group, 8.5, 0.5, interactables, 2);
  const ll = new THREE.PointLight(0x6a7488, 75, 16, 1.6);
  ll.position.set(5, 6, 2);
  group.add(ll);

  // A pile of dust sheets — carry one at a time, like everything else
  const sheetPile = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x5c6067, roughness: 1 })
  );
  sheetPile.position.set(9.2, 0.25, -0.4);
  sheetPile.castShadow = true;
  group.add(sheetPile);
  writing(group, "there are sheets by the stairs", 9, 2.4, 4.2, "#8b95a6");

  // ── Hall of mirrors (11–27): four of them, facing each other ──
  mirror(14.5);
  mirror(19.5);
  mirror(24.5);
  solid(group, colliders, 2.4, 1.2, 2.0, 21.8, 0.6, -1.6, FRAME);
  interactables.push({
    type: "hide", trigger: box(21.8, 0.6, -0.4, 1.3, 0.6, 1.0),
    label: "hide under the console", hidePoint: new THREE.Vector3(21.8, 0, -1.8), hidePose: "crawl",
  });
  const hl = new THREE.PointLight(0x54607a, 100, 22, 1.5);
  hl.position.set(19, 8, 3);
  group.add(hl);

  // ── Dressing room (27–43): a wardrobe to hide in, two more mirrors ──
  mirror(30, 5.5, 2.4);
  solid(group, colliders, 3.4, 8.0, 2.4, 35.5, 4.0, -2.2, FRAME);
  const wdoor = solid(group, null, 1.5, 7.4, 0.12, 34.3, 3.7, -0.7, DARK);
  wdoor.rotation.y = 0.5;
  interactables.push({
    type: "hide", trigger: box(35.5, 1, -0.3, 1.4, 1, 1.2), label: "hide in the wardrobe",
    hidePoint: new THREE.Vector3(35.5, 0, -2.0), hidePose: "stand",
  });
  mirror(40, 5.5, 2.4);
  const dl = new THREE.PointLight(0x4c5670, 90, 20, 1.6);
  dl.position.set(37, 7, 2.6);
  group.add(dl);

  // ── Gallery (43–58): portraits whose faces are scratched out ──
  for (let i = 0; i < 5; i++) {
    const px = 45.5 + i * 2.6;
    solid(group, null, 1.8, 2.4, 0.16, px, 4.2, -D / 2 + 0.14, FRAME);
    const canvasM = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 2.1),
      new THREE.MeshStandardMaterial({ color: 0x2f3038, roughness: 1 })
    );
    canvasM.position.set(px, 4.2, -D / 2 + 0.24);
    group.add(canvasM);
  }
  writing(group, "she took their faces first", 51, 7.4, 4.6, "#8b95a6");
  mirror(55, 6.0, 2.6);
  const cell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10),
    new THREE.MeshStandardMaterial({
      color: 0x3a4a3e, emissive: 0x223a26, emissiveIntensity: 0.8, roughness: 0.9,
    })
  );
  cell.position.set(48, 0.15, 0.6);
  cell.castShadow = true;
  group.add(cell);
  interactables.push({
    type: "battery", trigger: box(48, 0.5, 0.6, 0.9, 0.7, 0.9),
    label: "take the battery", mesh: cell,
  });
  const gl = new THREE.PointLight(0x505a72, 85, 20, 1.6);
  gl.position.set(51, 7, 2.6);
  group.add(gl);

  // ── The vanity (58–74): the key sits behind the largest glass ──
  const vanity = solid(group, colliders, 6.0, 1.5, 2.6, 65, 0.75, -2.4, FRAME);
  vanity.name = "vanity";
  interactables.push({
    type: "climb", trigger: box(61.7, 0.9, -1.4, 0.7, 1.0, 1.3), label: "climb the vanity",
    climbTopY: 1.5, climbXMin: 62.4, climbXMax: 67.6, climbZ: -2.4,
  });
  const bigMirror = mirror(65, 7.5, 3.6);
  writing(group, "my name is wren. i am going home.", 69, 6.4, 5.8, "#9aa4b4");
  journalPage(group, 71.2, 0.5);
  const vl = new THREE.PointLight(0x5a6480, 95, 22, 1.5);
  vl.position.set(66, 8, 3);
  group.add(vl);

  // ── Antechamber (74–92) ──
  stairwellDoor(group, interactables, 91.8, 0xd8dce4);
  crayonDrawing(group, 78.5, 2.1, (ctx) => {
    // just a door, and light under it
    ctx.strokeRect(78, 40, 100, 170);
    ctx.beginPath(); ctx.arc(164, 128, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(80 + i * 8, 214); ctx.lineTo(74 + i * 8, 232); ctx.stroke();
    }
  }, "the door is real");
  writing(group, "down is out", 86, 4.9, 2.8, "#aeb6c4");
  const anl = new THREE.PointLight(0x69738a, 90, 22, 1.5);
  anl.position.set(84, 7, 2);
  group.add(anl);

  // ── The key — behind the vanity glass, or two lesser mirrors ──
  const keySpot = seed % 3;
  const anchors = [
    { x: 65, y: 1.7, z: -2.4, m: bigMirror },
    { x: 30, y: 0.25, z: -3.2, m: mirrors[3] },
    { x: 55, y: 0.25, z: -3.2, m: mirrors[6] },
  ][keySpot];
  const key = makeKey();
  key.position.set(anchors.x, anchors.y, anchors.z);
  group.add(key);
  interactables.push({
    type: "carry",
    trigger: box(anchors.x, anchors.y + 0.3, anchors.z, 1.4, 1.0, 1.4),
    label: "take the old key", mesh: key, isKey: true,
  });

  fills(group, [[5, 42], [19, 45], [36, 42], [51, 42], [66, 45], [84, 48]], 0x353b48);
  scene.add(group);

  return {
    floor: 2, name: "the mirror floor",
    group, colliders, interactables, zones,
    bounds: { minX: 0.7, maxX: 91.3 },
    camClamp: [5, 88],
    spawnX: 2.8, stairX: 91.3, unlocked: false, keySpot,
    entity: {
      sense: "reflection", shape: "mirror",
      waypoints: [16, 31, 47, 62, 70], dwellSeconds: 1.2, startIndex: 2,
      safeBelow: 12.5, safeAbove: 73,
    },
    update(dt) {
      // Live glass breathes; draped glass is dead and stays dead
      for (const m of mirrors) {
        if (m.zone.active === false) continue;
        const mat = m.glass.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity =
          1.05 + Math.sin(performance.now() * 0.0012 + m.glass.position.x) * 0.28;
      }
    },
  };
}
