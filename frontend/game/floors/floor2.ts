import * as THREE from "three";
import {
  bottles, box, cloth, cobweb, crayonDrawing, D, debris, divider, fills,
  FloorBuild, journalPage, makeKey,
  keyClue,
  keyTrigger, shell, solid, stairwellDoor, usable, writing, Zone,
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
  // Furniture already under dust sheets — somebody was closing this floor up
  // and stopped halfway through. A chandelier hangs low, unlit and dulled.
  for (const [sx, sw] of [[16.8, 1.7], [22.6, 2.1]] as const) {
    solid(group, colliders, sw, 0.9, 1.6, sx, 0.45, -1.9, 0x3d4048);
    cloth(group, sx, 0.72, sw + 0.5, 1.5, 0x5f636a, -1.1, 0.03);
  }
  const chand = new THREE.Group();
  chand.add(solid(chand, null, 0.09, 1.5, 0.09, 0, 0.75, 0, 0x3a3b42));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const arm = solid(chand, null, 0.6, 0.05, 0.05, Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35, 0x3a3b42);
    arm.rotation.y = -a;
    const drop = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.07),
      new THREE.MeshStandardMaterial({
        color: 0x8a93a6, emissive: 0x2a3140, emissiveIntensity: 0.6,
        roughness: 0.2, metalness: 0.5,
      })
    );
    drop.position.set(Math.cos(a) * 0.6, -0.14, Math.sin(a) * 0.6);
    chand.add(drop);
  }
  chand.position.set(19.5, 8.4, -1.6);
  chand.traverse((m) => { m.castShadow = true; });
  group.add(chand);
  cobweb(group, 12.4, 8.6, 1.7);
  debris(group, 25, 5, 6, 0x2f3138, -0.7);

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
  // A dressing table with the drawers pulled out and emptied, hairbrushes,
  // scent bottles, and a stool pushed back as if somebody stood up quickly.
  solid(group, colliders, 2.4, 1.4, 1.0, 32.6, 0.7, -3.2, FRAME);
  solid(group, null, 1.9, 0.16, 0.6, 32.6, 1.0, -2.5, 0x353840);
  bottles(group, 31.9, 1.42, -3.2, 5, [0x6e7a8c, 0x7a6e80, 0x5f6b78], 1.05);
  const brush = solid(group, null, 0.28, 0.06, 0.12, 33.4, 1.44, -2.9, 0x4a4038);
  brush.rotation.y = 0.5;
  const dstool = solid(group, colliders, 0.6, 0.5, 0.6, 33.9, 0.25, -1.9, FRAME);
  dstool.rotation.y = 0.35;
  // Coat hangers, empty, still swinging distance apart
  solid(group, null, 2.4, 0.06, 0.06, 38.4, 5.2, -2.4, 0x3a3d45);
  for (let i = 0; i < 5; i++) {
    const hg = solid(group, null, 0.34, 0.03, 0.03, 37.4 + i * 0.5, 5.02, -2.4, 0x53565e);
    hg.rotation.z = 0.05 * (i % 2 ? 1 : -1);
    solid(group, null, 0.02, 0.18, 0.02, 37.4 + i * 0.5, 5.12, -2.4, 0x53565e);
  }
  cloth(group, 41.8, 3.4, 1.1, 2.6, 0x4a4c56, -2.2, 0.05);

  // Noise means nothing to the thing in the glass. What matters here is
  // whether you are visible in it — so handling the room is nearly free,
  // and the game quietly teaches you that by letting you get away with it.
  usable(interactables, 32.6, 1.4, -2.2, "open the dressing table drawers", 0.3, { hw: 1.4 });
  usable(interactables, 33.4, 1.6, -2.4, "pick up the hairbrush", 0.2, { hw: 0.8 });
  usable(interactables, 37.2, 1.6, -1.8, "push the coat hangers along the rail", 0.35, {
    tag: "hangers", sustain: 2.2, hw: 1.6,
  });
  usable(interactables, 21.4, 1.6, -1.0, "set the chandelier swinging", 0.4, {
    tag: "chandelier", sustain: 3.5, hw: 1.4,
  });
  usable(interactables, 51, 1.6, -2.6, "straighten a portrait", 0.25, { hw: 2.0 });
  usable(interactables, 10.3, 1.0, -0.4, "take a dust sheet", 0.15, { hw: 0.9 });

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
  // The floor that takes faces and names is the floor where you finally read
  // the name tape stitched into the bear's ear.
  // Stand just off to the side of the vanity glass — clear of the trigger
  // for draping it, so covering the mirror never steals this moment.
  interactables.push({
    type: "read", trigger: box(68.4, 1.2, -0.6, 1.3, 1.5, 2.0),
    label: "hold the bear up to the glass", tag: "note:bear",
  });
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
    trigger: keyTrigger(anchors.x, anchors.y, anchors.z, 1.4),
    label: "take the old key", mesh: key, isKey: true,
  });

  // Somebody who got this far wrote down where it was. The deeper the
  // floor, the less they managed to say. The note goes near the start,
  // where you will actually walk past it before you need it.
  const boundsFor = { minX: 0.7, maxX: 91.3 };
  const clueX = 9.5;
  keyClue(group, 2, clueX, anchors.x, anchors.y, boundsFor);

  fills(group, [[5, 42], [19, 45], [36, 42], [51, 42], [66, 45], [84, 48]], 0x353b48);
  // ── Decoy chairs ──
  // The Mimic wears a covered chair. If it were the only one on the floor the
  // trick would last exactly one run, so the room is furnished with the same
  // chair over and over — identical geometry, identical material — and one of
  // them is standing up.
  {
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x2a2d38, roughness: 1 });
    for (const cx of [21, 29.5, 38, 44.5, 53, 58.5, 66]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.15, 0.85), chairMat);
      seat.position.set(cx, 0.58, -1.4);
      seat.castShadow = true;
      seat.receiveShadow = true;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.16), chairMat);
      back.position.set(cx, 1.53, -1.76);
      back.castShadow = true;
      group.add(seat, back);
      colliders.push(
        new THREE.Box3(
          new THREE.Vector3(cx - 0.48, 0, -1.83),
          new THREE.Vector3(cx + 0.48, 1.16, -0.97)
        )
      );
    }
  }

  scene.add(group);

  return {
    floor: 2, name: "the mirror floor",
    group, colliders, interactables, zones,
    bounds: { minX: 0.7, maxX: 91.3 },
    camClamp: [5, 88],
    spawnX: 2.8, stairX: 91.3, unlocked: false, keySpot,
    entity: {
      sense: "mimic", shape: "mirror",
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
