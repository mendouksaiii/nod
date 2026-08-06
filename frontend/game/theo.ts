import * as THREE from "three";
import { Input } from "./input";
import { Interactable } from "./room";

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
  private shoulderL = new THREE.Group();
  private shoulderR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private torso!: THREE.Mesh;
  private hipRoot = new THREE.Group();
  private neck = new THREE.Group();
  private handAnchor = new THREE.Group();

  flashlight!: THREE.SpotLight;
  private flashTarget = new THREE.Object3D();
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
  private footfallPhase = 0;

  private mantleFrom = new THREE.Vector3();
  private mantleTo = new THREE.Vector3();
  private mantleT = 0;

  private hideRestore = new THREE.Vector3();
  private currentHide: Interactable | null = null;
  private hideT = 0;
  private hideDir = 1; // 1 = entering, -1 = leaving

  carried: Interactable | null = null;

  constructor(scene: THREE.Scene) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 1 });
    const pajama = new THREE.MeshStandardMaterial({ color: 0x8f8aa3, roughness: 1 });

    // Torso tapers up — narrow shoulders, soft belly. Pivots at the hips.
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.28, 4, 10), pajama);
    this.torso.position.y = 0.17;
    this.torso.castShadow = true;

    const collar = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), pajama);
    collar.position.y = 0.35;
    collar.scale.set(1, 0.62, 1);
    collar.castShadow = true;

    // Hip root: everything above the legs hangs off this, so a crouch or a
    // lean moves the whole upper body without detaching the feet.
    const hipRoot = this.hipRoot;
    hipRoot.position.y = 0.44;
    hipRoot.add(this.torso, collar);

    // Neck pivot so the head can lead turns and counter-bob
    this.neck.position.y = 0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.195, 16, 14), skin);
    head.scale.set(0.94, 1, 0.96);
    head.position.y = 0.15;
    head.castShadow = true;
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: 0x3b3540, roughness: 1 }));
    fringe.scale.set(0.97, 0.6, 0.99);
    fringe.position.set(-0.016, 0.235, 0);
    fringe.castShadow = true;
    this.neck.add(head, fringe);
    hipRoot.add(this.neck);

    // ── Legs: hip → knee → shin, each hinging at its top ──
    const thighGeo = new THREE.CapsuleGeometry(0.058, 0.13, 3, 8);
    const shinGeo = new THREE.CapsuleGeometry(0.05, 0.13, 3, 8);
    const footGeo = new THREE.BoxGeometry(0.15, 0.055, 0.1);
    for (const [hip, knee, z] of [
      [this.hipL, this.kneeL, 0.075],
      [this.hipR, this.kneeR, -0.075],
    ] as const) {
      hip.position.set(0, 0.44, z);
      const thigh = new THREE.Mesh(thighGeo, pajama);
      thigh.position.y = -0.11;
      thigh.castShadow = true;
      hip.add(thigh);

      knee.position.y = -0.22;
      const shin = new THREE.Mesh(shinGeo, skin);
      shin.position.y = -0.1;
      shin.castShadow = true;
      const foot = new THREE.Mesh(footGeo, skin);
      foot.position.set(0.03, -0.2, 0);
      foot.castShadow = true;
      knee.add(shin, foot);
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
      sh.position.set(0, 0.31, z);
      const upper = new THREE.Mesh(upperGeo, pajama);
      upper.position.y = -0.095;
      upper.castShadow = true;
      sh.add(upper);

      el.position.y = -0.19;
      const fore = new THREE.Mesh(foreGeo, skin);
      fore.position.y = -0.085;
      fore.castShadow = true;
      el.add(fore);
      sh.add(el);
      hipRoot.add(sh);
    }

    this.body.add(hipRoot);

    // Two-handed too-big flashlight, parented to the right forearm
    const torch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.075, 0.38, 10),
      new THREE.MeshStandardMaterial({ color: 0x3c414f, roughness: 0.9 })
    );
    // Held along the forearm: hangs down at rest, points ahead when raised
    torch.rotation.z = 0.3;
    torch.position.set(0.03, -0.13, 0);
    torch.castShadow = true;
    this.handAnchor.position.y = -0.15;
    this.handAnchor.add(torch);
    this.elbowR.add(this.handAnchor);

    this.root.add(this.body);
    this.root.position.set(-2, 0, 0);
    scene.add(this.root);

    this.flashlight = new THREE.SpotLight(0xffe9c2, 0, 15, 0.42, 0.55, 1.1);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
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

        if (this.mantleT >= 1) {
          this.root.position.copy(this.mantleTo);
          this.hipRoot.rotation.x = 0;
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
        }

        // Held breath: shallower, faster the deeper he's tucked in
        this.breathT += dt * (1.4 + a * 1.6);
        const hb = Math.sin(this.breathT) * 0.016 * (1 - a * 0.5);
        this.torso.scale.set(1 + hb * 0.5, 1 + hb, 1 + hb * 0.5);

        if (this.hideT >= 1 && this.hideDir === -1) {
          this.state = "move";
          this.currentHide = null;
          this.hipRoot.rotation.x = 0;
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
      this.battery = Math.max(0, this.battery - dt * 1.7);
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
    this.flashlight.position.set(p.x + this.facing * 0.3, p.y + 0.62, p.z + 0.1);
    this.flashTarget.position.set(p.x + this.facing * 7, p.y + 0.2, p.z);

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

    // ── Arms: opposite the legs, elbows carrying a soft child's bend ──
    const carrying = !!this.carried;
    const holdingUp = this.flashOn && this.battery > 0;
    const armSwing = stride * 0.72;
    let shL = sw * armSwing;
    let shR = -sw * armSwing;
    let elL = 0.3 + Math.max(0, sw) * 0.35;
    let elR = 0.3 + Math.max(0, -sw) * 0.35;

    if (carrying) {
      // Both arms come up and forward, clutching it to the chest
      shL = -0.85 + sw * 0.06;
      shR = -0.85 - sw * 0.06;
      elL = elR = 1.05;
    } else if (holdingUp) {
      // Right arm out with the torch, left steadying it — two-handed grip
      shR = -1.02 - sw * 0.04;
      elR = 0.5;
      shL = -0.78 + sw * 0.05;
      elL = 0.95;
    } else if (sneaking) {
      // Tucked in, elbows close — bracing himself
      shL = 0.12 + sw * armSwing * 0.5;
      shR = 0.12 - sw * armSwing * 0.5;
      elL = elR = 0.75;
    }

    const armDamp = 9;
    this.shoulderL.rotation.x = THREE.MathUtils.damp(this.shoulderL.rotation.x, shL, armDamp, dt);
    this.shoulderR.rotation.x = THREE.MathUtils.damp(this.shoulderR.rotation.x, shR, armDamp, dt);
    this.elbowL.rotation.x = THREE.MathUtils.damp(this.elbowL.rotation.x, elL, armDamp, dt);
    this.elbowR.rotation.x = THREE.MathUtils.damp(this.elbowR.rotation.x, elR, armDamp, dt);
    // Arms hang slightly away from the body, more so when tense
    this.shoulderL.rotation.z = THREE.MathUtils.damp(this.shoulderL.rotation.z, sneaking ? -0.3 : -0.16, 8, dt);
    this.shoulderR.rotation.z = THREE.MathUtils.damp(this.shoulderR.rotation.z, sneaking ? 0.3 : 0.16, 8, dt);

    // ── Torso: forward lean into travel, hunch when sneaking, breathing ──
    this.breathT += dt * (moving ? 2.6 : 1.15);
    const breath = Math.sin(this.breathT) * (moving ? 0.012 : 0.02);
    // +rotation.x pitches him along his own forward axis, whichever way he faces
    const leanFromSpeed = (this.vx * this.facing) / SPEED_RUN;
    const targetPitch = leanFromSpeed * 0.26 + (sneaking ? 0.34 : 0);
    this.hipRoot.rotation.x = THREE.MathUtils.damp(this.hipRoot.rotation.x, targetPitch, 7, dt);
    // Shoulders counter-rotate against the hips as he walks
    this.hipRoot.rotation.y = THREE.MathUtils.damp(this.hipRoot.rotation.y, -sw * stride * 0.22, 10, dt);
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
    this.neck.rotation.x = THREE.MathUtils.damp(
      this.neck.rotation.x,
      -this.hipRoot.rotation.x * 0.55 + (sneaking ? 0.12 : 0) + Math.sin(p * 2) * 0.02 * gait,
      8,
      dt
    );
    this.neck.rotation.y = THREE.MathUtils.damp(
      this.neck.rotation.y,
      idleGlance - this.hipRoot.rotation.y * 0.6,
      6,
      dt
    );

    // ── Turning: a brief plant-and-scuff when he reverses at speed ──
    if (dir !== 0 && dir !== this.lastFacing) {
      this.turnT = Math.min(1, speed / SPEED_WALK) * 0.35;
      this.lastFacing = dir;
    }
    if (this.turnT > 0) this.turnT = Math.max(0, this.turnT - dt * 1.8);

    // Face travel direction, angled slightly toward camera so he reads in 2.5D
    const targetYaw =
      dir === 0 && speed < 0.3
        ? 0
        : this.facing > 0
          ? Math.PI / 2 - 0.35
          : -Math.PI / 2 + 0.35;
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
