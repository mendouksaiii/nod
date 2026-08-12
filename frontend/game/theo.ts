import * as THREE from "three";
import { Input } from "./input";
import { Interactable } from "./build";

// Theo: an eight-year-old made of grey boxes. Everything here is about
// weight — slow ramps, sliding stops, a lean into acceleration, a mantle
// instead of a jump. He should feel breakable before he looks like anything.

const HALF_W = 0.22;
const HEIGHT = 1.05;

const SPEED_SNEAK = 0.85;
const SPEED_WALK = 2.0;
const SPEED_RUN = 4.1;
const ACCEL_WALK = 6.5;
const ACCEL_RUN = 4.2; // heavier ramp: running takes a moment to arrive
const DECEL = 5.5; // and stopping carries you a little too far
const GRAVITY = -16;
const HARD_LANDING = -7;

type State = "move" | "mantle" | "hidden" | "stagger";

export class Theo {
  root = new THREE.Group();
  private body = new THREE.Group();
  /** Pivot groups — limbs hinge at hip and shoulder, not their own centre. */
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  /** Ankles, so the feet roll through a step instead of staying flat planks. */
  private ankleL = new THREE.Group();
  private ankleR = new THREE.Group();
  /**
   * The spine. Everything above the waist hangs off this rather than off the
   * pelvis, so the torso can curve and counter-rotate against the hips. Without
   * it the head, both arms and the chest are welded to one bone and he walks
   * like a board on legs.
   */
  private chest = new THREE.Group();
  private shoulderL = new THREE.Group();
  private shoulderR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private torso!: THREE.Mesh;
  private hipRoot = new THREE.Group();
  private drawstrings: THREE.Mesh[] = [];
  /** The bear. He came in holding it and he has not let go. */
  private bear = new THREE.Group();
  /** 0..1 — how frightened he is. Tightens his grip on the bear. */
  fear = 0;
  /** He can leave without it. Some of them did. */
  hasBear = false;

  takeBear() {
    this.hasBear = true;
    this.bear.visible = true;
  }
  private neck = new THREE.Group();
  private handAnchor = new THREE.Group();
  private torchLens!: THREE.Mesh;
  private glow!: THREE.PointLight;

  flashlight!: THREE.SpotLight;
  private flashTarget = new THREE.Object3D();
  private lensWorld = new THREE.Vector3();
  flashOn = false;
  battery = 100;

  state: State = "move";
  private vx = 0;
  private vy = 0;
  private grounded = true;
  facing = 1;
  private walkPhase = 0;
  private squash = 0;
  private staggerT = 0;
  private breathT = Math.random() * 6;
  private idleT = 0;
  private lastFacing = 1;
  private turnT = 0;
  private lastStepSign = 0;
  /** Raised on each footfall; the game consumes it to play a step. */
  footfall = false;

  private mantleFrom = new THREE.Vector3();
  private mantleTo = new THREE.Vector3();
  private mantleT = 0;

  private hideRestore = new THREE.Vector3();
  private currentHide: Interactable | null = null;
  private hideT = 0;
  private hideDir = 1; // 1 = entering, -1 = leaving

  carried: Interactable | null = null;

  constructor(scene: THREE.Scene) {
    // Warm enough to survive the house's cold ambient — under a blue-grey
    // hemisphere a neutral beige reads as dead grey skin.
    const skin = new THREE.MeshStandardMaterial({ color: 0xecd3b4, roughness: 1 });
    // The one warm thing in the whole house. A faded clay hoodie reads at any
    // distance and against every floor's palette — the house is cold, he isn't.
    // Deep enough that his own warm light does not push it to orange
    const pajama = new THREE.MeshStandardMaterial({ color: 0x8a3327, roughness: 1 });
    const hoodDark = new THREE.MeshStandardMaterial({ color: 0x61221a, roughness: 1 });
    // Dark shorts, so the red stops at his waist and his legs read as bare
    const shorts = new THREE.MeshStandardMaterial({ color: 0x2e282b, roughness: 1 });

    // Torso tapers up — narrow shoulders, soft belly. Pivots at the hips.
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.165, 0.28, 4, 10), pajama);
    this.torso.position.y = 0.17;
    this.torso.castShadow = true;

    // Kangaroo pocket — the small detail that makes it a hoodie and not a shirt
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.09), hoodDark);
    pocket.position.set(0, 0.06, 0.1);
    pocket.castShadow = true;

    const collar = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), pajama);
    collar.position.y = 0.35;
    collar.scale.set(1, 0.62, 1);
    collar.castShadow = true;

    // The hood itself, bunched down behind his neck. Two drawstrings hang
    // from it and swing when he runs.
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 12), hoodDark);
    hood.scale.set(0.82, 0.9, 1.0);
    hood.position.set(0, 0.36, -0.09);
    hood.castShadow = true;
    for (const sz of [0.05, -0.05]) {
      const string = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.011, 0.12, 3, 6),
        new THREE.MeshStandardMaterial({ color: 0xbdb0a0, roughness: 1 })
      );
      string.position.set(sz, 0.27, 0.1);
      this.drawstrings.push(string);
    }

    // Hip root: everything above the legs hangs off this, so a crouch or a
    // lean moves the whole upper body without detaching the feet.
    const hipRoot = this.hipRoot;
    hipRoot.position.y = 0.44;
    // The hem of the hoodie, sitting over the top of the shorts
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.166, 0.09, 12), hoodDark);
    hem.position.y = 0.015;
    hem.castShadow = true;
    // The hem belongs to the pelvis; everything above it rides the spine. The
    // chest sits at the hip origin, so it bends from the waist and every child
    // keeps the local position it was authored with.
    hipRoot.add(hem, this.chest);
    this.chest.add(this.torso, pocket, collar, hood, ...this.drawstrings);

    // ── Head ──
    // He has a face. It is the thing you are trying to keep, so you have to
    // be able to see it: big dark eyes, and hair swept off them rather than
    // hanging over them. Local +Z is his forward, so features sit on +Z.
    this.neck.position.y = 0.4;
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.17;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.215, 18, 16), skin);
    head.scale.set(0.95, 1.02, 0.97);
    head.castShadow = true;
    headGroup.add(head);

    const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b2320, roughness: 1 });
    // Cap of hair over the crown, pushed back off the forehead
    // A mop, not a skullcap — it comes down the sides of the head and sits
    // over the ears, which is most of what makes the silhouette read as a
    // small child rather than a doll with a painted-on scalp.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.229, 16, 12), hairMat);
    cap.scale.set(1.0, 0.9, 1.0);
    cap.position.set(0, 0.035, -0.02);
    cap.castShadow = true;
    headGroup.add(cap);
    // A heavy fringe across the brow, stopping just above the eyes
    const sweep = new THREE.Mesh(new THREE.SphereGeometry(0.205, 14, 10), hairMat);
    sweep.scale.set(0.97, 0.46, 0.8);
    sweep.position.set(0.02, 0.095, 0.07);
    sweep.rotation.z = -0.2;
    sweep.castShadow = true;
    headGroup.add(sweep);
    // Locks hanging in front of each ear, so the hair has an outline instead
    // of ending in a clean line at the temple
    for (const sx of [0.152, -0.152]) {
      const lock = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), hairMat);
      lock.scale.set(0.62, 1.05, 0.9);
      lock.position.set(sx, -0.01, 0.045);
      lock.castShadow = true;
      headGroup.add(lock);
    }
    // Untidy tufts — nobody has brushed this child's hair in a while
    for (const [tx, ty, tz, ts] of [
      [-0.075, 0.155, -0.115, 0.8], [0.06, 0.165, -0.10, 0.65], [-0.015, 0.185, -0.03, 0.55],
    ] as const) {
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.05 * ts, 8, 6), hairMat);
      tuft.scale.set(1.35, 0.8, 1.05);
      tuft.position.set(tx, ty, tz);
      tuft.rotation.z = tx * 2;
      tuft.castShadow = true;
      headGroup.add(tuft);
    }

    // Eyes, set on his forward face and large the way a small child's are
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x241d1b, roughness: 0.55 });
    for (const ex of [0.072, -0.072]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), eyeMat);
      eye.scale.set(1, 1.15, 0.6);
      eye.position.set(ex, 0.0, 0.187);
      headGroup.add(eye);
      // A single catchlight so the eyes are not two dead holes in the dark
      const glint = new THREE.Mesh(
        new THREE.SphereGeometry(0.009, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xf2ece0 })
      );
      glint.position.set(ex + 0.011, 0.011, 0.207);
      headGroup.add(glint);
    }
    // The suggestion of a nose, no mouth — he does not talk
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skin);
    nose.scale.set(0.9, 0.75, 0.8);
    nose.position.set(0, -0.052, 0.203);
    headGroup.add(nose);

    // Ears
    for (const ex of [0.196, -0.196]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), skin);
      ear.scale.set(0.42, 1, 0.75);
      ear.position.set(ex, -0.012, -0.012);
      ear.castShadow = true;
      headGroup.add(ear);
    }

    this.neck.add(headGroup);
    this.chest.add(this.neck);

    // ── Legs: hip → knee → shin, each hinging at its top ──
    const thighGeo = new THREE.CapsuleGeometry(0.058, 0.13, 3, 8);
    const shinGeo = new THREE.CapsuleGeometry(0.05, 0.13, 3, 8);
    const footGeo = new THREE.BoxGeometry(0.15, 0.055, 0.1);
    for (const [hip, knee, ankle, z] of [
      [this.hipL, this.kneeL, this.ankleL, 0.075],
      [this.hipR, this.kneeR, this.ankleR, -0.075],
    ] as const) {
      hip.position.set(z, 0.44, 0);
      const thigh = new THREE.Mesh(thighGeo, shorts);
      thigh.position.y = -0.11;
      thigh.castShadow = true;
      hip.add(thigh);

      knee.position.y = -0.22;
      const shin = new THREE.Mesh(shinGeo, skin);
      shin.position.y = -0.1;
      shin.castShadow = true;
      // The ankle pivots at the back of the foot, so plantarflexing rolls him
      // up onto the toes rather than spinning the shoe about its middle.
      ankle.position.y = -0.2;
      const foot = new THREE.Mesh(footGeo, skin);
      foot.position.set(0, -0.01, 0.045);
      foot.castShadow = true;
      ankle.add(foot);
      knee.add(shin, ankle);
      hip.add(knee);
      this.body.add(hip);
    }

    // ── Arms: shoulder → elbow → forearm ──
    const upperGeo = new THREE.CapsuleGeometry(0.042, 0.11, 3, 8);
    const foreGeo = new THREE.CapsuleGeometry(0.038, 0.1, 3, 8);
    for (const [sh, el, z] of [
      [this.shoulderL, this.elbowL, 0.15],
      [this.shoulderR, this.elbowR, -0.15],
    ] as const) {
      sh.position.set(z, 0.31, 0);
      const upper = new THREE.Mesh(upperGeo, pajama);
      upper.position.y = -0.095;
      upper.castShadow = true;
      sh.add(upper);

      el.position.y = -0.19;
      // Sleeved to the wrist. A bare skin forearm was the palest thing on him
      // and it sticks straight out toward the camera while he holds the torch,
      // so it read as a length of pipe rather than an arm.
      const fore = new THREE.Mesh(foreGeo, pajama);
      fore.position.y = -0.085;
      fore.castShadow = true;
      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.041, 0.039, 0.026, 10), hoodDark
      );
      cuff.position.y = -0.158;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 7), skin);
      hand.scale.set(0.85, 1, 0.9);
      hand.position.y = -0.185;
      hand.castShadow = true;
      el.add(fore, cuff, hand);
      sh.add(el);
      this.chest.add(sh);
    }

    this.body.add(hipRoot);

    // ── The bear ──
    // Held in the crook of his left arm, always. It is the reason he only
    // ever has one hand free, and the first thing the house will try to take.
    {
      const fur = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 1 });
      const furDark = new THREE.MeshStandardMaterial({ color: 0x6b5943, roughness: 1 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.05, 4, 8), fur);
      body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), fur);
      head.position.y = 0.09;
      head.castShadow = true;
      const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), furDark);
      muzzle.position.set(0.042, 0.075, 0);
      const ears = [0.035, -0.035].map((z) => {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), furDark);
        ear.position.set(-0.005, 0.128, z);
        return ear;
      });
      // One arm hangs loose — it has been carried by that arm for a long time
      const limbGeo = new THREE.CapsuleGeometry(0.018, 0.035, 3, 6);
      const armA = new THREE.Mesh(limbGeo, fur);
      armA.position.set(0.01, 0.03, 0.062);
      armA.rotation.x = -0.5;
      const armB = new THREE.Mesh(limbGeo, fur);
      armB.position.set(0.01, 0.03, -0.062);
      armB.rotation.x = 0.9;
      const legA = new THREE.Mesh(limbGeo, fur);
      legA.position.set(0.02, -0.06, 0.032);
      legA.rotation.z = 0.6;
      const legB = new THREE.Mesh(limbGeo, fur);
      legB.position.set(0.02, -0.06, -0.032);
      legB.rotation.z = 0.9;
      this.bear.add(body, head, muzzle, ...ears, armA, armB, legA, legB);
      this.bear.traverse((m) => { m.castShadow = true; });
      // Tucked against his chest on the left, tilted like a held thing
      // Clear of the torso capsule (radius 0.165 about the body axis) and out
      // in the crook of the forward arm — sunk any closer and he reads as
      // holding nothing at all.
      // Parented to the FOREARM, not the pelvis.
      //
      // It used to hang off hipRoot, which is why it appeared to float
      // alongside him: it was pinned to his hips and could not follow the arm
      // that was supposedly holding it, so the arm moved and the bear did not.
      // Attached to the elbow it is carried — the clutch comes from the arm
      // pose, and the bear simply goes where the arm goes.
      this.bear.position.set(0.075, -0.145, 0.055);
      this.bear.rotation.set(0.1, 0.2, 1.15);
      this.bear.scale.setScalar(1.3);
      this.bear.visible = false; // until he picks it up off the pillow
      this.elbowL.add(this.bear);
    }

    // A flashlight, parented to the right forearm.
    //
    // This used to be 0.38 long — nearly a third of his height — and pale
    // blue-grey, so from the side camera it read as a white pipe laid across
    // his chest rather than a torch in his hand. It is still a bit big for
    // him, because it is not his, but it is now a torch first.
    const torchBody = new THREE.MeshStandardMaterial({
      color: 0x1e2128, roughness: 0.55, metalness: 0.35,
    });
    const torch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.046, 0.185, 12),
      torchBody
    );
    // The bezel: a brass ring that catches his own glow and reads as the
    // business end even when the torch is off.
    const bezel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.044, 0.038, 12),
      new THREE.MeshStandardMaterial({ color: 0x6d5a34, roughness: 0.45, metalness: 0.6 })
    );
    bezel.position.set(0, -0.222, 0.01);
    bezel.castShadow = true;
    this.handAnchor.add(bezel);
    // Gripped so the barrel points along his forward axis — at rest it hangs
    // at his side, and when he raises it the beam goes where he is looking.
    // Along the forearm's own axis: hanging at his side it points at the
    // floor, and raising the arm swings the beam forward. (Aligning it to
    // the limb's +Z instead makes it rotate up across his chest.)
    torch.position.set(0, -0.135, 0.01);
    torch.castShadow = true;
    // A lit lens on the front so the torch reads as a torch, not a pipe.
    // A sphere, not a disc — a disc goes edge-on and reads as a white bar
    // across his chest from the side camera.
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9b8 })
    );
    lens.position.set(0, -0.238, 0.01);
    this.handAnchor.add(lens);
    this.torchLens = lens;
    this.handAnchor.position.y = -0.15;
    this.handAnchor.add(torch);
    this.elbowR.add(this.handAnchor);

    this.root.add(this.body);
    this.root.position.set(-2, 0, 0);
    scene.add(this.root);

    // A soft warm light travelling with him. The house is lit cold from
    // above, so without this he renders as a grey child in a grey room — he
    // has to stay the one warm thing in frame even when he is in shadow.
    this.glow = new THREE.PointLight(0xffc9a4, 2.2, 2.4, 1.6);
    this.glow.position.set(0, 0.75, 0.45);
    this.root.add(this.glow);

    this.flashlight = new THREE.SpotLight(0xffe9c2, 0, 15, 0.42, 0.55, 1.1);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(512, 512);
    this.flashlight.shadow.bias = -0.002;
    scene.add(this.flashlight);
    scene.add(this.flashTarget);
    this.flashlight.target = this.flashTarget;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  get hidden(): boolean {
    return this.state === "hidden";
  }

  /** Carrying something that stinks — the pantry key gives you away. */
  get carriesReeking(): boolean {
    return this.carried?.tag === "reeking";
  }

  get speedTier(): "still" | "sneak" | "walk" | "run" {
    const s = Math.abs(this.vx);
    if (s < 0.05) return "still";
    if (s <= SPEED_SNEAK + 0.1) return "sneak";
    if (s <= SPEED_WALK + 0.2) return "walk";
    return "run";
  }

  private aabbAt(x: number, y: number, z: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(x - HALF_W, y, z - HALF_W),
      new THREE.Vector3(x + HALF_W, y + HEIGHT, z + HALF_W)
    );
  }

  startMantle(target: THREE.Vector3) {
    if (this.state !== "move") return;
    this.state = "mantle";
    this.mantleFrom.copy(this.root.position);
    this.mantleTo.copy(target);
    this.mantleT = 0;
    this.vx = 0;
    this.vy = 0;
  }

  startHide(spot: Interactable) {
    if (this.state !== "move") return;
    this.state = "hidden";
    this.currentHide = spot;
    this.hideRestore.copy(this.root.position);
    this.hideT = 0;
    this.hideDir = 1;
    this.vx = 0;
  }

  leaveHide() {
    if (this.state !== "hidden" || this.hideDir === -1) return;
    this.hideDir = -1;
    this.hideT = 0;
  }

  update(dt: number, input: Input, colliders: THREE.Box3[], bounds: { minX: number; maxX: number }) {
    switch (this.state) {
      case "mantle": {
        this.mantleT = Math.min(1, this.mantleT + dt / 0.55);
        const t = this.mantleT;
        const ease = t * t * (3 - 2 * t);
        // Rise first, then slide over the lip
        const x = THREE.MathUtils.lerp(this.mantleFrom.x, this.mantleTo.x, ease);
        const z = THREE.MathUtils.lerp(this.mantleFrom.z, this.mantleTo.z, ease);
        const yArc =
          THREE.MathUtils.lerp(this.mantleFrom.y, this.mantleTo.y, Math.min(1, t * 1.5)) +
          Math.sin(t * Math.PI) * 0.12;
        this.root.position.set(x, yArc, z);

        // Reach up, plant, haul: arms lead, knees tuck, torso folds over the lip
        const reach = Math.sin(Math.min(1, t * 1.6) * Math.PI);
        const haul = t * t;
        this.shoulderL.rotation.x = -2.5 * Math.min(1, t * 2.2) + haul * 1.3;
        this.shoulderR.rotation.x = -2.5 * Math.min(1, t * 2.2) + haul * 1.3;
        this.elbowL.rotation.x = 0.2 + reach * 1.2;
        this.elbowR.rotation.x = 0.2 + reach * 1.2;
        this.hipL.rotation.x = -reach * 1.1;
        this.hipR.rotation.x = -reach * 0.75;
        this.kneeL.rotation.x = reach * 1.5;
        this.kneeR.rotation.x = reach * 1.1;
        this.hipRoot.rotation.x = reach * 0.5;
        this.neck.rotation.x = -reach * 0.3;
        this.settleSpine(dt, reach * 0.35, 10);

        if (this.mantleT >= 1) {
          this.root.position.copy(this.mantleTo);
          this.hipRoot.rotation.x = 0;
          this.chest.rotation.set(0, 0, 0);
          this.neck.rotation.x = 0;
          this.state = "move";
          this.grounded = true;
          this.squash = 0.35;
        }
        break;
      }

      case "hidden": {
        const spot = this.currentHide!;
        this.hideT = Math.min(1, this.hideT + dt / 0.45);
        const t = this.hideT * this.hideT * (3 - 2 * this.hideT);
        const from = this.hideDir === 1 ? this.hideRestore : spot.hidePoint!;
        const to = this.hideDir === 1 ? spot.hidePoint! : this.hideRestore;
        this.root.position.lerpVectors(from, to, t);
        const crawl = spot.hidePose === "crawl";
        const a = this.hideDir === 1 ? t : 1 - t;

        if (crawl) {
          // Down onto hands and knees, head low
          this.hipRoot.rotation.x = a * 1.15;
          this.body.position.y = a * -0.3;
          this.hipL.rotation.x = a * 1.5;
          this.hipR.rotation.x = a * 1.3;
          this.kneeL.rotation.x = a * 1.7;
          this.kneeR.rotation.x = a * 1.5;
          this.shoulderL.rotation.x = a * 1.15;
          this.shoulderR.rotation.x = a * 1.0;
          this.elbowL.rotation.x = 0.3 + a * 0.35;
          this.elbowR.rotation.x = 0.3 + a * 0.35;
          this.neck.rotation.x = a * -0.55; // head stays level, looking out
          this.settleSpine(dt, a * 0.45, 9);
        } else {
          // Pressed back and small, arms pinned to his sides
          this.body.position.y = a * -0.1;
          this.hipRoot.rotation.x = a * 0.12;
          this.kneeL.rotation.x = 0.06 + a * 0.5;
          this.kneeR.rotation.x = 0.06 + a * 0.5;
          this.shoulderL.rotation.x = a * 0.25;
          this.shoulderR.rotation.x = a * 0.25;
          this.shoulderL.rotation.z = -0.05 - a * 0.02;
          this.shoulderR.rotation.z = 0.05 + a * 0.02;
          this.elbowL.rotation.x = 0.3 + a * 0.9;
          this.elbowR.rotation.x = 0.3 + a * 0.9;
          this.neck.rotation.x = a * -0.15;
          this.settleSpine(dt, a * 0.1, 9);
        }

        // Held breath: shallower, faster the deeper he's tucked in
        this.breathT += dt * (1.4 + a * 1.6);
        const hb = Math.sin(this.breathT) * 0.016 * (1 - a * 0.5);
        this.torso.scale.set(1 + hb * 0.5, 1 + hb, 1 + hb * 0.5);

        if (this.hideT >= 1 && this.hideDir === -1) {
          this.state = "move";
          this.currentHide = null;
          this.hipRoot.rotation.x = 0;
          this.chest.rotation.set(0, 0, 0);
          this.body.position.y = 0;
          this.neck.rotation.x = 0;
        }
        break;
      }

      case "stagger": {
        this.staggerT -= dt;
        this.vx = THREE.MathUtils.damp(this.vx, 0, 10, dt);
        this.root.position.x += this.vx * dt;

        // Buckled: knees collapse, hands go out, then he gathers himself
        const fall = Math.max(0, Math.min(1, this.staggerT / 0.55));
        this.hipRoot.rotation.x = THREE.MathUtils.damp(this.hipRoot.rotation.x, fall * 0.75, 7, dt);
        this.kneeL.rotation.x = THREE.MathUtils.damp(this.kneeL.rotation.x, 0.06 + fall * 1.25, 8, dt);
        this.kneeR.rotation.x = THREE.MathUtils.damp(this.kneeR.rotation.x, 0.06 + fall * 0.95, 8, dt);
        this.hipL.rotation.x = THREE.MathUtils.damp(this.hipL.rotation.x, fall * -0.5, 8, dt);
        this.hipR.rotation.x = THREE.MathUtils.damp(this.hipR.rotation.x, fall * -0.3, 8, dt);
        this.shoulderL.rotation.x = THREE.MathUtils.damp(this.shoulderL.rotation.x, fall * -1.4, 9, dt);
        this.shoulderR.rotation.x = THREE.MathUtils.damp(this.shoulderR.rotation.x, fall * -1.25, 9, dt);
        this.elbowL.rotation.x = THREE.MathUtils.damp(this.elbowL.rotation.x, 0.3 + fall * 0.5, 9, dt);
        this.elbowR.rotation.x = THREE.MathUtils.damp(this.elbowR.rotation.x, 0.3 + fall * 0.5, 9, dt);
        this.body.position.y = THREE.MathUtils.damp(this.body.position.y, fall * -0.2, 10, dt);
        this.neck.rotation.x = THREE.MathUtils.damp(this.neck.rotation.x, fall * 0.5, 7, dt);
        this.settleSpine(dt, fall * 0.3, 7);
        this.body.rotation.z = THREE.MathUtils.damp(this.body.rotation.z, 0, 6, dt);

        if (this.staggerT <= 0) this.state = "move";
        break;
      }

      case "move": {
        const dir = input.moveX;
        const target =
          dir === 0
            ? 0
            : dir * (input.sneak ? SPEED_SNEAK : input.run ? SPEED_RUN : SPEED_WALK);
        const accel =
          dir === 0 ? DECEL : input.run ? ACCEL_RUN : ACCEL_WALK;
        this.vx = THREE.MathUtils.damp(this.vx, target, accel, dt);
        if (dir !== 0) this.facing = dir;

        // X move + resolve
        let nx = this.root.position.x + this.vx * dt;
        nx = THREE.MathUtils.clamp(nx, bounds.minX, bounds.maxX);
        const y = this.root.position.y;
        const zLane = this.root.position.z;
        const boxX = this.aabbAt(nx, y + 0.02, zLane);
        for (const c of colliders) {
          if (boxX.intersectsBox(c)) {
            // step-up allowance for lips under 0.3
            if (c.max.y - y < 0.3 && c.max.y - y > 0) {
              continue;
            }
            nx =
              this.vx > 0 ? c.min.x - HALF_W - 0.001 : c.max.x + HALF_W + 0.001;
            this.vx = 0;
          }
        }
        this.root.position.x = nx;

        // Y: gravity + resolve
        this.vy += GRAVITY * dt;
        let ny = this.root.position.y + this.vy * dt;
        const boxY = this.aabbAt(this.root.position.x, ny, zLane);
        let landed = false;
        for (const c of colliders) {
          if (boxY.intersectsBox(c) && this.vy <= 0 && this.root.position.y >= c.max.y - 0.15) {
            ny = c.max.y;
            landed = true;
          }
        }
        if (ny <= 0) {
          ny = 0;
          landed = true;
        }
        if (landed && !this.grounded) {
          this.squash = 0.5;
          if (this.vy < HARD_LANDING) {
            this.state = "stagger";
            this.staggerT = 0.55;
          }
        }
        if (landed) {
          this.vy = 0;
          this.grounded = true;
        } else {
          // small coyote treatment: only leave grounded when actually falling
          this.grounded = false;
        }
        this.root.position.y = ny;

        // Back on the floor: drift home to the walk lane (z = 0)
        if (this.grounded && ny === 0 && Math.abs(zLane) > 0.001) {
          this.root.position.z = THREE.MathUtils.damp(zLane, 0, 6, dt);
        }

        this.animate(dt, input, dir);
        break;
      }
    }

    // Landing squash recovery (all states)
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 3);
      const s = 1 - Math.sin(this.squash * Math.PI) * 0.12;
      this.body.scale.set(1 / s, s, 1 / s);
      if (this.squash === 0) this.body.scale.set(1, 1, 1);
    }

    // ── Flashlight ──
    if (this.flashOn && this.battery > 0) {
      // ~95 seconds of light on a full cell. Short enough to ration, long
      // enough that it reads as a dying battery rather than a broken torch.
      this.battery = Math.max(0, this.battery - dt * 1.05);
      let intensity = 26;
      if (this.battery < 20) {
        // dying flicker
        intensity *= 0.55 + Math.random() * 0.45;
        if (Math.random() < dt * 2) intensity *= 0.15;
      }
      this.flashlight.intensity = THREE.MathUtils.damp(
        this.flashlight.intensity,
        this.battery > 0 ? intensity : 0,
        20,
        dt
      );
    } else {
      this.flashlight.intensity = THREE.MathUtils.damp(this.flashlight.intensity, 0, 14, dt);
    }
    const p = this.root.position;
    // The beam leaves the torch he is actually holding, and goes where he is
    // facing — so the prop, the light and his body all agree.
    this.torchLens.getWorldPosition(this.lensWorld);
    this.flashlight.position.copy(this.lensWorld);
    this.flashTarget.position.set(
      this.lensWorld.x + this.facing * 7,
      this.lensWorld.y - 0.9,
      this.lensWorld.z
    );

    // Carried item rides the hands
    if (this.carried?.mesh) {
      const m = this.carried.mesh;
      m.position.set(p.x + this.facing * 0.34, p.y + 0.5, p.z + 0.12);
      m.rotation.y = this.root.rotation.y;
    }
  }

  /**
   * Walk cycle and posture. Limbs hinge from hip/shoulder, knees flex on the
   * trailing swing, the torso counter-rotates against the arms, and the head
   * leads turns — the difference between "boxes sliding" and "a child walking".
   */
  /**
   * Ease the joints that only the walk cycle drives back to a resting pose.
   *
   * Mantling, hiding and falling author themselves on the pelvis alone. Without
   * this, the spine twist, pelvic list and ankle roll left over from the last
   * walking frame would stay frozen on him for the whole hide — one foot stuck
   * up on its toes while he lies flat under a bed.
   */
  private settleSpine(dt: number, chestPitch: number, rate = 8) {
    const d = THREE.MathUtils.damp;
    this.chest.rotation.x = d(this.chest.rotation.x, chestPitch, rate, dt);
    this.chest.rotation.y = d(this.chest.rotation.y, 0, rate, dt);
    this.chest.rotation.z = d(this.chest.rotation.z, 0, rate, dt);
    this.hipRoot.rotation.y = d(this.hipRoot.rotation.y, 0, rate, dt);
    this.hipRoot.rotation.z = d(this.hipRoot.rotation.z, 0, rate, dt);
    this.ankleL.rotation.x = d(this.ankleL.rotation.x, 0, rate, dt);
    this.ankleR.rotation.x = d(this.ankleR.rotation.x, 0, rate, dt);
  }

  private animate(dt: number, input: Input, dir: number) {
    const speed = Math.abs(this.vx);
    const sneaking = input.sneak;
    const running = speed > SPEED_WALK + 0.25;
    const moving = speed > 0.08;

    // Cadence: short quick steps sneaking, long reaching strides running
    const cadence = sneaking ? 3.4 : running ? 2.35 : 3.0;
    this.walkPhase += dt * (1.1 + speed * cadence);
    const p = this.walkPhase;

    // Stride scales with speed but tops out — he never sprints like an adult
    const gait = Math.min(1, speed / SPEED_WALK);
    const stride = gait * (sneaking ? 0.34 : running ? 0.82 : 0.62);
    const sw = Math.sin(p);

    // A foot lands each time the swing crosses centre
    if (moving && this.grounded) {
      const sign = sw >= 0 ? 1 : -1;
      if (sign !== this.lastStepSign) {
        this.lastStepSign = sign;
        this.footfall = true;
      }
    }

    // ── Legs: thigh swings, trailing knee flexes to clear the floor ──
    const thigh = -sw * stride;
    const crouchBend = sneaking ? 0.42 : 0;
    this.hipL.rotation.x = thigh;
    this.hipR.rotation.x = -thigh;
    this.kneeL.rotation.x =
      crouchBend + Math.max(0, -sw) * (1.15 * stride) + 0.06;
    this.kneeR.rotation.x =
      crouchBend + Math.max(0, sw) * (1.15 * stride) + 0.06;
    // Straighten the hips a touch when crouched so he squats, not kneels
    if (sneaking) {
      this.hipL.rotation.x -= 0.2;
      this.hipR.rotation.x -= 0.2;
    }

    // ── Ankles: the foot rolls through the step ──
    // A leg behind him is pushing off, so the heel lifts and he goes up onto
    // the toes; a leg reaching in front lands heel-first with the toes up.
    // Flat rigid feet that stay parallel to the floor are the single loudest
    // stiffness cue in a side-on walk, because you see the whole sole.
    const ankleFor = (s: number) =>
      (Math.max(0, -s) * 0.85 - Math.max(0, s) * 0.4) * stride;
    this.ankleL.rotation.x = THREE.MathUtils.damp(
      this.ankleL.rotation.x, ankleFor(sw) + (sneaking ? 0.2 : 0), 13, dt
    );
    this.ankleR.rotation.x = THREE.MathUtils.damp(
      this.ankleR.rotation.x, ankleFor(-sw) + (sneaking ? 0.2 : 0), 13, dt
    );

    // ── Arms ──
    // The left arm is not available. It is holding the bear, and it holds it
    // tighter the more frightened he is. Everything else — the torch, the
    // key, whatever he picks up — has to happen with the right hand alone.
    const carrying = !!this.carried;
    const holdingUp = this.flashOn && this.battery > 0;
    const armSwing = stride * 0.72;

    // Arms trail the legs by a fraction of a step. Real limbs never arrive at
    // their pose on the same frame as the hips — that overlap is most of what
    // separates a walk cycle from a metronome.
    const swArm = Math.sin(p - 0.42);

    const clutch = THREE.MathUtils.clamp(this.fear, 0, 1);
    // Named for what the hand holds, not for which side it is on — the two
    // have been swapped once already and side-named variables made that a
    // rename in six places instead of one.
    // Cradling, not presenting. The upper arm hangs close to his ribs and the
    // forearm comes across his belly, so the bear rests in the crook against
    // his chest. Held further out with the elbow half-open it read as an arm
    // sticking out sideways with a toy balanced on it.
    const shBear = -0.34 - clutch * 0.2 + swArm * armSwing * 0.07;
    const elBear = 1.5 + clutch * 0.25;

    // He is holding a torch, so the right arm never simply hangs — it is out
    // in front of him at all times, lit or not. Letting it swing at his side
    // pointed the torch at the floor, which is what he does with it least.
    // The torch hangs along the forearm, so the FOREARM is what has to be
    // horizontal — not just the upper arm. Shoulder near -1.25rad with the
    // elbow almost straight puts the barrel out in front of him; anything
    // shallower and it quietly goes back to pointing at the floor.
    // He carries it the way a child actually carries a torch — arm mostly
    // down, elbow soft, the light out around waist height. Holding it level
    // with the shoulder made him aim it like a pistol, and it is the wrist,
    // not the shoulder, that keeps the barrel pointed where he is walking.
    let shTorch = -0.82 - swArm * armSwing * 0.14;
    let elTorch = 0.3 + Math.max(0, -swArm) * 0.08;
    if (carrying) {
      shTorch = -0.9 - swArm * 0.05;
      elTorch = 1.0;
    } else if (holdingUp) {
      // Lit: he brings it up a little and pushes the beam ahead
      shTorch = -1.0 - swArm * 0.04;
      elTorch = 0.22;
    } else if (sneaking) {
      // Crouched, tucked in close to his body
      shTorch = -0.72 - swArm * armSwing * 0.12;
      elTorch = 0.36;
    }

    // Torch in the RIGHT hand, bear in the LEFT.
    const armDamp = 9;
    this.shoulderL.rotation.x = THREE.MathUtils.damp(this.shoulderL.rotation.x, shBear, armDamp, dt);
    this.shoulderR.rotation.x = THREE.MathUtils.damp(this.shoulderR.rotation.x, shTorch, armDamp, dt);
    this.elbowL.rotation.x = THREE.MathUtils.damp(this.elbowL.rotation.x, elBear, armDamp, dt);
    this.elbowR.rotation.x = THREE.MathUtils.damp(this.elbowR.rotation.x, elTorch, armDamp, dt);
    // The wrist takes up whatever the arm does not, so the barrel stays level
    // and aimed where he walks no matter how the arm is posed. The beam itself
    // is aimed independently, so without this the mesh and the light disagree
    // and the torch visibly points at the floor while lighting the corridor.
    this.handAnchor.rotation.x = THREE.MathUtils.clamp(
      -Math.PI / 2 - (this.shoulderR.rotation.x + this.elbowR.rotation.x),
      -1.15, // a wrist, not a hinge
      0.3
    );

    // The bear-arm stays tucked in; the free arm hangs away from the body
    // Bear elbow tucked IN against his side rather than winged out
    this.shoulderL.rotation.z = THREE.MathUtils.damp(this.shoulderL.rotation.z, -0.14 - clutch * 0.06, 8, dt);
    this.shoulderR.rotation.z = THREE.MathUtils.damp(this.shoulderR.rotation.z, sneaking ? 0.3 : 0.16, 8, dt);

    // Bear: the arm carries it now, so almost nothing is driven here. What
    // remains is the squeeze — as the dread rises he pulls it a little tighter
    // into himself. The old code moved it across his whole body every frame,
    // which is what made it look like it was drifting around him rather than
    // being held.
    this.bear.position.z = THREE.MathUtils.damp(this.bear.position.z, 0.055 - clutch * 0.02, 6, dt);
    this.bear.position.y = THREE.MathUtils.damp(this.bear.position.y, -0.145 + clutch * 0.015, 6, dt);
    this.bear.rotation.z = THREE.MathUtils.damp(
      this.bear.rotation.z, 1.15 + clutch * 0.1, 7, dt
    );

    // The lens is only lit when the torch is, and the torch throws a little
    // back onto him when it is
    this.torchLens.visible = holdingUp;
    this.glow.intensity = THREE.MathUtils.damp(
      this.glow.intensity, holdingUp ? 4.2 : 2.2, 6, dt
    );

    // Drawstrings swing with the stride
    for (let i = 0; i < this.drawstrings.length; i++) {
      this.drawstrings[i].rotation.z = Math.sin(p + i * 0.6) * stride * 0.35 - 0.08;
    }

    // ── Torso: forward lean into travel, hunch when sneaking, breathing ──
    this.breathT += dt * (moving ? 2.6 : 1.15);
    const breath = Math.sin(this.breathT) * (moving ? 0.012 : 0.02);
    // +rotation.x pitches him along his own forward axis, whichever way he faces
    const leanFromSpeed = (this.vx * this.facing) / SPEED_RUN;
    const targetPitch = leanFromSpeed * 0.26 + (sneaking ? 0.34 : 0);

    // The lean is split across two joints instead of pitching him as one
    // rigid plank: the pelvis takes a little, the spine takes the rest, and
    // the total is what it always was — just curved.
    this.hipRoot.rotation.x = THREE.MathUtils.damp(this.hipRoot.rotation.x, targetPitch * 0.45, 7, dt);
    this.chest.rotation.x = THREE.MathUtils.damp(this.chest.rotation.x, targetPitch * 0.6, 6, dt);

    // Real counter-rotation: the pelvis twists WITH the leading leg and the
    // shoulders swing against it. Previously both lived on one bone, so the
    // whole upper body twisted as a unit and nothing actually opposed anything.
    this.hipRoot.rotation.y = THREE.MathUtils.damp(this.hipRoot.rotation.y, sw * stride * 0.1, 10, dt);
    this.chest.rotation.y = THREE.MathUtils.damp(this.chest.rotation.y, -sw * stride * 0.34, 9, dt);

    // Pelvic list — the hip drops toward the swinging leg as weight transfers
    // onto the stance foot. This is the cue that reads as *weight*, and its
    // absence is why an otherwise correct walk cycle still looks weightless.
    // Standing still he shifts his balance slowly from foot to foot rather
    // than freezing solid.
    const idleSway = moving ? 0 : Math.sin(this.idleT * 0.65) * 0.035;
    this.hipRoot.rotation.z = THREE.MathUtils.damp(
      this.hipRoot.rotation.z, sw * stride * 0.14 + idleSway, 9, dt
    );
    // The spine lags the pelvis and bends back the other way, so his outline
    // is an S while he walks instead of a straight line.
    this.chest.rotation.z = THREE.MathUtils.damp(
      this.chest.rotation.z, Math.sin(p - 0.7) * stride * -0.1 - idleSway * 0.6, 7, dt
    );
    this.torso.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.5);

    // ── Vertical: footfall bob, crouch drop, weight settling ──
    const footBob = moving ? Math.abs(Math.sin(p)) * 0.022 * gait : 0;
    const crouchDrop = sneaking ? -0.14 : 0;
    this.body.position.y = THREE.MathUtils.damp(
      this.body.position.y,
      crouchDrop + footBob,
      14,
      dt
    );

    // ── Head: leads the turn, counter-bobs, glances down when sneaking ──
    this.idleT += dt;
    const idleGlance = moving ? 0 : Math.sin(this.idleT * 0.5) * 0.12;
    // He keeps his eyes up as the spine curves under him, so the head has to
    // undo the sum of both joints rather than just the pelvis.
    const spinePitch = this.hipRoot.rotation.x + this.chest.rotation.x;
    this.neck.rotation.x = THREE.MathUtils.damp(
      this.neck.rotation.x,
      -spinePitch * 0.62 + (sneaking ? 0.12 : 0) + Math.sin(p * 2) * 0.02 * gait,
      // Slower than the body, so the head settles a beat late instead of
      // locking to the shoulders
      6.5,
      dt
    );
    this.neck.rotation.y = THREE.MathUtils.damp(
      this.neck.rotation.y,
      idleGlance - this.chest.rotation.y * 0.7,
      5,
      dt
    );
    // A small permanent tilt. Perfect symmetry is what makes a rig read as a
    // mannequin, and a child listening to a house holds their head slightly off.
    this.neck.rotation.z = THREE.MathUtils.damp(
      this.neck.rotation.z,
      -0.05 - clutch * 0.08 - this.chest.rotation.z * 0.5,
      5,
      dt
    );

    // ── Turning: a brief plant-and-scuff when he reverses at speed ──
    if (dir !== 0 && dir !== this.lastFacing) {
      this.turnT = Math.min(1, speed / SPEED_WALK) * 0.35;
      this.lastFacing = dir;
    }
    if (this.turnT > 0) this.turnT = Math.max(0, this.turnT - dt * 1.8);

    // Always face the way he is going, angled slightly toward camera so his
    // face still reads in 2.5D. He must NOT swing round to face the camera
    // when he stops — he keeps looking where he was headed, and so does the
    // torch, because the beam follows the same facing.
    const targetYaw =
      this.facing > 0 ? Math.PI / 2 - 0.35 : -Math.PI / 2 + 0.35;
    this.root.rotation.y = THREE.MathUtils.damp(
      this.root.rotation.y,
      targetYaw,
      running ? 7 : 5.5,
      dt
    );
    // Sideways wobble as the turn resolves
    this.body.rotation.z = THREE.MathUtils.damp(
      this.body.rotation.z,
      this.turnT * 0.35 * -this.facing,
      9,
      dt
    );
  }

  /**
   * Being taken. It lifts him off the floor by the back of the hoodie and his
   * legs keep going, because he does not understand yet that it is over.
   *
   * There is no gore in this and there should never be. The thing that hurts
   * is that the bear comes out of his arm on the way up and lands on the
   * boards, and the camera stays on it after he is gone.
   */
  seize(dt: number, t: number) {
    this.state = "stagger";
    this.staggerT = 1;
    this.vx = 0;
    this.vy = 0;

    // Hauled upward, feet leaving the ground
    const lift = Math.min(1, t / 0.55);
    this.root.position.y = lift * 0.95;
    // Wrenched round to face whatever has him
    this.root.rotation.y = THREE.MathUtils.damp(this.root.rotation.y, this.facing > 0 ? 1.9 : -1.9, 6, dt);

    // Legs still running in the air. This is the part people flinch at.
    const kick = Math.max(0, 1 - t * 0.8);
    this.hipL.rotation.x = Math.sin(t * 22) * 0.9 * kick;
    this.hipR.rotation.x = -Math.sin(t * 22) * 0.9 * kick;
    this.kneeL.rotation.x = 0.5 + Math.max(0, Math.sin(t * 22)) * 0.8 * kick;
    this.kneeR.rotation.x = 0.5 + Math.max(0, -Math.sin(t * 22)) * 0.8 * kick;

    // The free arm reaches back for the floor
    this.shoulderR.rotation.x = THREE.MathUtils.damp(this.shoulderR.rotation.x, 1.5, 7, dt);
    this.elbowR.rotation.x = THREE.MathUtils.damp(this.elbowR.rotation.x, 0.2, 7, dt);
    // The other arm loses its grip
    this.shoulderL.rotation.x = THREE.MathUtils.damp(this.shoulderL.rotation.x, 0.9, 4, dt);
    this.elbowL.rotation.x = THREE.MathUtils.damp(this.elbowL.rotation.x, 0.3, 4, dt);
    this.hipRoot.rotation.x = THREE.MathUtils.damp(this.hipRoot.rotation.x, -0.5, 5, dt);
    this.neck.rotation.x = THREE.MathUtils.damp(this.neck.rotation.x, -0.35, 5, dt);
  }

  /** The bear falls. Returns where it landed so the floor can keep it. */
  dropBear(): THREE.Vector3 | null {
    if (!this.hasBear) return null;
    const world = new THREE.Vector3();
    this.bear.getWorldPosition(world);
    this.hasBear = false;
    this.bear.visible = false;
    return world;
  }

  /** Put him back on his feet at a threshold, mid-run state cleared. */
  respawn(x: number) {
    this.root.position.set(x, 0, 0);
    this.state = "move";
    this.currentHide = null;
    this.vx = 0;
    this.vy = 0;
    this.grounded = true;
    this.squash = 0;
    this.staggerT = 0;
    this.body.position.y = 0;
    this.body.rotation.set(0, 0, 0);
    this.hipRoot.rotation.set(0, 0, 0);
    this.chest.rotation.set(0, 0, 0);
    this.ankleL.rotation.set(0, 0, 0);
    this.ankleR.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    if (this.carried) this.drop();
  }

  toggleFlashlight() {
    this.flashOn = !this.flashOn;
  }

  pickUp(item: Interactable) {
    if (this.carried) return;
    this.carried = item;
  }

  drop() {
    if (!this.carried?.mesh) {
      this.carried = null;
      return;
    }
    const m = this.carried.mesh;
    const p = this.root.position;
    m.rotation.set(0, 0, 0);
    // Rest it on whatever surface he's standing on, not buried in it
    m.position.set(p.x + this.facing * 0.55, p.y, 0.4);
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    m.position.y += p.y - box.min.y;
    // move its trigger to where it fell so it can be picked up again
    const t = this.carried.trigger;
    const size = new THREE.Vector3();
    t.getSize(size);
    t.setFromCenterAndSize(
      new THREE.Vector3(m.position.x, size.y / 2, m.position.z),
      size
    );
    this.carried = null;
  }
}
