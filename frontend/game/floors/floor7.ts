import * as THREE from "three";
import {
  bookPile, bottles, box, cloth, cobweb, crayonDrawing, D, debris, divider,
  fills, FloorBuild, H, journalPage, makeKey,
  keyTrigger, picture, shell, solid,
  stairwellDoor, usable, writing,
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

  // ══ THE ROOM HE WAKES IN (0–12) ══
  // Everything here is his size. It is the only room in the whole house that
  // fits him, which is exactly why the cot next door is so wrong. It is very
  // nearly his own bedroom. It is not his bedroom.

  const BEDX = 3.9;
  const BEDZ = -2.6;
  const linen = 0x6d6f7d;

  // Bed: frame on four short legs, mattress, covers thrown back where he got out
  solid(group, colliders, 2.5, 0.28, 1.5, BEDX, 0.42, BEDZ, 0x2f2a2e);
  for (const lx of [BEDX - 1.1, BEDX + 1.1])
    for (const lz of [BEDZ - 0.6, BEDZ + 0.6])
      solid(group, null, 0.14, 0.28, 0.14, lx, 0.14, lz, 0x241f23);
  solid(group, null, 2.35, 0.22, 1.36, BEDX, 0.67, BEDZ, linen);
  // headboard
  solid(group, colliders, 0.16, 0.95, 1.5, BEDX - 1.25, 0.9, BEDZ, 0x2f2a2e);
  // the covers, shoved down to the foot of the bed in a heap
  const covers = solid(group, null, 1.0, 0.3, 1.4, BEDX + 0.6, 0.9, BEDZ, 0x5c5e6b);
  covers.rotation.z = -0.08;
  const pillow = solid(group, null, 0.62, 0.17, 0.86, BEDX - 0.85, 0.86, BEDZ, 0x7e808c);
  pillow.rotation.z = 0.06;
  interactables.push({
    type: "climb", trigger: box(BEDX + 1.55, 0.6, BEDZ, 0.55, 0.7, 1.0),
    label: "climb onto the bed",
    climbTopY: 0.78, climbXMin: BEDX - 1.0, climbXMax: BEDX + 1.1, climbZ: BEDZ,
  });

  // The bear, waiting on the pillow where he left it when he woke
  const bear = new THREE.Group();
  {
    const fur = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 1 });
    const furDark = new THREE.MeshStandardMaterial({ color: 0x6b5943, roughness: 1 });
    const bod = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.06, 4, 8), fur);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.066, 10, 8), fur);
    hd.position.y = 0.108;
    const mz = new THREE.Mesh(new THREE.SphereGeometry(0.031, 8, 6), furDark);
    mz.position.set(0.05, 0.09, 0);
    bear.add(bod, hd, mz);
    for (const z of [0.042, -0.042]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), furDark);
      ear.position.set(-0.006, 0.153, z);
      bear.add(ear);
    }
    bear.traverse((m) => { m.castShadow = true; });
    bear.position.set(BEDX - 0.8, 1.03, BEDZ + 0.05);
    bear.rotation.z = 1.35; // lying on its side
    group.add(bear);
  }
  interactables.push({
    // Reachable from the walk lane as well as from up on the bed — a child
    // can reach a pillow, and this must not be missable.
    type: "carry", trigger: box(BEDX - 0.7, 1.0, -1.3, 1.5, 1.0, 1.7),
    label: "take the bear", mesh: bear, tag: "bear",
  });

  // Slippers, kicked off beside the bed. Both facing the wrong way.
  for (const [sx, sz, rot] of [[BEDX + 0.3, -1.55, 0.4], [BEDX + 0.62, -1.42, -0.9]] as const) {
    const sl = solid(group, null, 0.26, 0.1, 0.16, sx, 0.05, sz, 0x4a4048);
    sl.rotation.y = rot;
  }

  // Bedside table and the lamp that is the only warm light on this floor
  solid(group, colliders, 0.7, 0.62, 0.66, 6.0, 0.31, -3.0, FURNITURE);
  const lampBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.11, 0.16, 10),
    new THREE.MeshStandardMaterial({ color: 0x453b33, roughness: 1 })
  );
  lampBase.position.set(6.0, 0.7, -3.0);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.26, 0.26, 12, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xd8bb86, emissive: 0xc19a52, emissiveIntensity: 0.9,
      roughness: 1, side: THREE.DoubleSide,
    })
  );
  shade.position.set(6.0, 0.92, -3.0);
  group.add(lampBase, shade);
  // Tight and warm: it should pool on the bedside and let the rest of the
  // room stay dark, not flood the whole floor amber.
  const lamp = new THREE.PointLight(0xd8a355, 46, 8.5, 1.9);
  lamp.position.set(6.0, 0.95, -2.6);
  // Not a shadow caster: it is a small warm pool, and every shadow-casting
  // light costs a full depth pass over the whole floor every frame.
  group.add(lamp);

  // Things in the waking room answer when you touch them. Quietly — this is
  // the floor that teaches you the rules, not the one that punishes you.
  usable(interactables, 6.0, 1.0, -2.6, "switch the lamp off", 0.15, {
    tag: "lamp", hw: 0.9,
    onUse: () => { lamp.visible = !lamp.visible; shade.visible = lamp.visible; },
  });
  usable(interactables, BEDX + 1.35, 1.0, BEDZ, "pull the covers back", 0.2, { hw: 0.8 });
  usable(interactables, 7.0, 0.9, -2.6, "move the chair", 0.45, { hw: 0.8 });
  usable(interactables, 1.6, 1.6, -3.4, "touch the window", 0.1, { hw: 1.1, hh: 2.0 });

  // A glass of water nobody drank
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.038, 0.11, 8),
    new THREE.MeshStandardMaterial({
      color: 0x8fa3b0, roughness: 0.2, transparent: true, opacity: 0.55,
    })
  );
  glass.position.set(5.75, 0.68, -2.78);
  group.add(glass);

  // Rug, and a small chair with clothes over the back
  solid(group, null, 3.4, 0.04, 2.2, 6.2, 0.02, -0.7, 0x322b2f);
  solid(group, colliders, 0.62, 0.5, 0.62, 8.0, 0.25, -3.0, FURNITURE);
  const clothes = solid(group, null, 0.7, 0.55, 0.2, 8.0, 0.72, -3.2, 0x4e4753);
  clothes.rotation.z = 0.1;

  // A window that should show the garden and shows a flat grey nothing
  const voidPane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.9),
    new THREE.MeshStandardMaterial({
      color: 0x2b3038, emissive: 0x3a414c, emissiveIntensity: 0.7, roughness: 1,
    })
  );
  voidPane.position.set(1.6, 2.4, -D / 2 + 0.03);
  group.add(voidPane);
  solid(group, null, 1.72, 0.09, 0.1, 1.6, 3.4, -D / 2 + 0.07, DARK);
  solid(group, null, 1.72, 0.09, 0.1, 1.6, 1.42, -D / 2 + 0.07, DARK);
  solid(group, null, 0.09, 2.0, 0.1, 1.6, 2.4, -D / 2 + 0.07, DARK);

  // ── The sealed way up ──
  solid(group, null, 2.6, 5.2, 0.14, 9.8, 2.6, -D / 2 + 0.09, 0x11151d);
  solid(group, null, 3.0, 0.22, 0.2, 9.8, 5.3, -D / 2 + 0.12, DARK);
  solid(group, null, 0.22, 5.2, 0.2, 8.4, 2.6, -D / 2 + 0.12, DARK);
  solid(group, null, 0.22, 5.2, 0.2, 11.2, 2.6, -D / 2 + 0.12, DARK);
  const b1 = solid(group, null, 3.2, 0.3, 0.1, 9.8, 3.4, -D / 2 + 0.18, 0x2c3040);
  b1.rotation.z = 0.14;
  const b2 = solid(group, null, 3.2, 0.3, 0.1, 9.8, 1.9, -D / 2 + 0.18, 0x2c3040);
  b2.rotation.z = -0.1;
  // Boarded from THIS side. Somebody nailed it shut to keep something out,
  // or to keep the children in. The nails are on the inside.
  writing(group, "nod", 11.0, 1.4, 1.0, "#5d6579");
  // Height marks up the doorframe. Three names, and a fourth mark with none.
  for (let i = 0; i < 4; i++) {
    solid(group, null, 0.34, 0.025, 0.06, 8.62, 0.62 + i * 0.42, -D / 2 + 0.15, 0x6a7183);
  }
  interactables.push({
    type: "read", trigger: box(8.6, 1.2, -2.2, 1.1, 1.4, 2.2),
    label: "look at the marks on the doorframe", tag: "note:chart",
  });
  writing(group, "the stairs only go down", 9.6, 6.0, 3.6);
  const lamp2 = new THREE.PointLight(0x53607e, 55, 16, 1.6);
  lamp2.position.set(9.5, 5.5, 2.0);
  group.add(lamp2);

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

  // A mobile still turning over the cot, long after anyone stopped winding it
  const mobileHub = new THREE.Group();
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x39323c, roughness: 1 })
  );
  bar.rotation.z = Math.PI / 2;
  mobileHub.add(bar);
  for (let i = 0; i < 4; i++) {
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x4a4450, roughness: 1 })
    );
    cord.position.set(-1.1 + i * 0.74, -0.28, 0);
    const charm = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12),
      new THREE.MeshStandardMaterial({ color: [0x5b5470, 0x6b6250, 0x4e5a63, 0x6a5560][i], roughness: 1 })
    );
    charm.position.set(-1.1 + i * 0.74, -0.58, 0);
    charm.castShadow = true;
    mobileHub.add(cord, charm);
  }
  mobileHub.position.set(cotX, 7.6, -1.5);
  group.add(mobileHub);
  (group.userData as { mobile?: THREE.Group }).mobile = mobileHub;

  // A nightlight nearly out of life, and the toys nobody put away
  const nightlight = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xd8b98a, emissive: 0xc09048, emissiveIntensity: 1.1, roughness: 1,
    })
  );
  nightlight.position.set(28.4, 0.35, -3.6);
  group.add(nightlight);
  const nl = new THREE.PointLight(0xd0964c, 26, 7, 1.8);
  nl.position.set(28.4, 0.5, -3.2);
  group.add(nl);
  debris(group, 26, 7, 9, 0x3c3644, -1.4);
  cobweb(group, 33.4, 8.4, 1.5);
  picture(group, 17.5, 5.4, 1.0, 1.3);

  // A stool knocked onto its side, exactly where a running child would leave it
  const stool = solid(group, null, 0.5, 0.9, 0.5, 33, 0.26, -0.9, FURNITURE);
  stool.rotation.z = Math.PI / 2;
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
  // 1024 is indistinguishable at this camera distance and a quarter the texels
  moon.shadow.mapSize.set(1024, 1024);
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
  // The rocking horse is the first genuinely bad idea the house offers you:
  // it is loud, it keeps rocking, and it is right in the warden's territory.
  const rock = { t: 0 };
  usable(interactables, 55, 1.2, -1.0, "push the rocking horse", 0.8, {
    tag: "horse", sustain: 4.5, hw: 1.6,
    onUse: () => { rock.t = 3.6; },
  });

  // Toy chest lid, dresser drawers, blocks — all of them make a sound
  usable(interactables, 52.1, 1.0, -0.6, "lift the toy chest lid", 0.5, { hw: 0.9 });
  usable(interactables, 43.5, 0.9, 0.8, "kick the ball", 0.65, { hw: 0.9, sustain: 2.0 });

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

  // ── The dolls' house ──
  // Somebody built a model of this house. It has seven floors. The rooms are
  // the rooms you are standing in.
  {
    const dh = new THREE.Group();
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x3a3038, roughness: 1 });
    const roomMat = new THREE.MeshStandardMaterial({ color: 0x241f28, roughness: 1 });
    for (let i = 0; i < 7; i++) {
      const y = 0.18 + i * 0.3;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.7), shellMat);
      slab.position.set(0, y, 0);
      dh.add(slab);
      for (let r = 0; r < 3; r++) {
        const cell = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.55), roomMat);
        cell.position.set(-0.5 + r * 0.5, y + 0.15, -0.02);
        dh.add(cell);
      }
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.42, 4), shellMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 2.34;
    dh.add(roof);
    // One tiny warm window, on the floor you are standing on
    const litRoom = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xd8a355, transparent: true, opacity: 0.85 })
    );
    litRoom.position.set(-0.5, 2.03, 0.36);
    dh.add(litRoom);
    dh.traverse((m) => { m.castShadow = true; m.receiveShadow = true; });
    dh.position.set(53.4, 0, -3.0);
    group.add(dh);
    const dhl = new THREE.PointLight(0xc08a48, 14, 4.5, 2);
    dhl.position.set(52.9, 2.1, -2.5);
    group.add(dhl);
  }
  interactables.push({
    type: "read", trigger: box(53.4, 1.2, -1.4, 1.5, 1.4, 1.8),
    label: "look into the dolls' house", tag: "note:dollhouse",
  });

  // Chalk on the floorboards — a hopscotch grid that stops after seven
  for (let i = 0; i < 7; i++) {
    const sq = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshBasicMaterial({ color: 0x8f96a6, transparent: true, opacity: 0.13 })
    );
    sq.rotation.x = -Math.PI / 2;
    sq.position.set(40 + i * 0.95, 0.015, 1.4);
    group.add(sq);
  }
  debris(group, 47, 9, 8, 0x453d52, 0.4);

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

  // Coats far too big for anyone who lives here, still on their hooks
  solid(group, null, 6.0, 0.14, 0.18, 71.5, 6.9, -D / 2 + 0.2, DARK);
  for (let i = 0; i < 4; i++) {
    cloth(group, 69.2 + i * 1.5, 5.4, 1.05, 2.9,
      [0x3b3746, 0x453c3a, 0x35404a, 0x3f3a33][i], -D / 2 + 0.55, (i % 2 ? 1 : -1) * 0.05);
  }
  // A suitcase, packed and never taken anywhere
  solid(group, null, 1.15, 0.75, 0.5, 73.4, 0.37, -1.0, 0x453830);
  solid(group, null, 1.2, 0.09, 0.55, 73.4, 0.66, -1.0, 0x2f2620);
  bottles(group, 66.9, 2.9, -1.8, 3, [0x4a5460, 0x574a3e], 0.9);
  cobweb(group, 58.9, 8.6, 1.7);
  debris(group, 63, 6, 6, 0x3a3440, -0.6);

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
  // Where the children waited before they went down. Their coats are still here.
  solid(group, null, 4.4, 0.12, 0.16, 79.5, 4.4, -D / 2 + 0.2, DARK);
  for (let i = 0; i < 3; i++)
    cloth(group, 78.0 + i * 1.5, 3.4, 0.8, 1.9, [0x4a4038, 0x3a3d48, 0x453a44][i], -D / 2 + 0.5, 0.04);
  // An umbrella stand by a door that has never once been rained on
  solid(group, null, 0.42, 0.72, 0.42, 86.6, 0.36, -3.4, 0x35302c);
  for (const [ux, uz, tilt] of [[86.5, -3.4, 0.1], [86.7, -3.3, -0.14]] as const) {
    const um = solid(group, null, 0.07, 1.2, 0.07, ux, 0.95, uz, 0x2f3a3c);
    um.rotation.z = tilt;
  }
  bookPile(group, 81.5, 0, -3.4, 3);
  cobweb(group, 88.2, 7.2, 1.4);
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
    trigger: keyTrigger(spots[keySpot].x, spots[keySpot].y, spots[keySpot].z, 1.0),
    label: "take the old key", mesh: key, isKey: true,
  });

  fills(group, [[6, 22], [22, 40], [46, 48], [67, 26], [83, 40]], 0x2e3648);
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
    update(dt) {
      // Nobody has wound it in a long time and it has not stopped
      mobileHub.rotation.y += dt * 0.12;
      // A pushed rocking horse keeps rocking, and keeps being heard, and
      // slowly gives up — which is a window you can either use or waste.
      if (rock.t > 0) {
        rock.t = Math.max(0, rock.t - dt);
        const amp = rock.t / 3.6;
        horse.rotation.z = Math.sin(performance.now() * 0.006) * 0.16 * amp;
        this.noise = Math.max(this.noise ?? 0, 0.55 * amp);
      }
    },
  };
}
