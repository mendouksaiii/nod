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
  private legL!: THREE.Mesh;
  private legR!: THREE.Mesh;
  private armL!: THREE.Mesh;
  private armR!: THREE.Mesh;
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

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 4, 10), pajama);
    torso.position.y = 0.62;
    torso.castShadow = true;
    this.body.add(torso);

    // A head a size too big — the child ratio
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), skin);
    head.position.y = 1.02;
    head.castShadow = true;
    this.body.add(head);

    const legGeo = new THREE.CapsuleGeometry(0.06, 0.24, 3, 8);
    this.legL = new THREE.Mesh(legGeo, pajama);
    this.legR = new THREE.Mesh(legGeo, pajama);
    this.legL.position.set(0, 0.24, 0.09);
    this.legR.position.set(0, 0.24, -0.09);
    this.legL.castShadow = this.legR.castShadow = true;
    this.body.add(this.legL, this.legR);

    const armGeo = new THREE.CapsuleGeometry(0.05, 0.2, 3, 8);
    this.armL = new THREE.Mesh(armGeo, pajama);
    this.armR = new THREE.Mesh(armGeo, skin);
    this.armL.position.set(0, 0.62, 0.24);
    this.armR.position.set(0, 0.62, -0.24);
    this.armL.castShadow = this.armR.castShadow = true;
    this.body.add(this.armL, this.armR);

    // Two-handed too-big flashlight
    const torch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.42, 10),
      new THREE.MeshStandardMaterial({ color: 0x3c414f, roughness: 0.9 })
    );
    torch.rotation.z = Math.PI / 2;
    this.handAnchor.position.set(0.26, 0.58, 0);
    this.handAnchor.add(torch);
    this.body.add(this.handAnchor);

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
        this.body.rotation.x = Math.sin(t * Math.PI) * -0.35;
        if (this.mantleT >= 1) {
          this.root.position.copy(this.mantleTo);
          this.body.rotation.x = 0;
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
        const poseAmt = this.hideDir === 1 ? t : 1 - t;
        this.body.rotation.x = crawl ? poseAmt * -1.35 : 0;
        this.body.position.y = crawl ? poseAmt * -0.28 : 0;
        this.body.scale.y = crawl ? 1 : 1 - poseAmt * 0.12;
        if (this.hideT >= 1 && this.hideDir === -1) {
          this.state = "move";
          this.currentHide = null;
          this.body.rotation.x = 0;
          this.body.position.y = 0;
          this.body.scale.y = 1;
        }
        break;
      }

      case "stagger": {
        this.staggerT -= dt;
        this.vx = THREE.MathUtils.damp(this.vx, 0, 10, dt);
        this.root.position.x += this.vx * dt;
        this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, 0, 6, dt);
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
            this.body.rotation.x = -0.5;
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

        // ── Animation: lean, scissor legs, bob ──
        const speed = Math.abs(this.vx);
        this.walkPhase += dt * (4 + speed * 5.2);
        const stride = Math.min(1, speed / SPEED_WALK) * (input.sneak ? 0.35 : 0.7);
        const swing = Math.sin(this.walkPhase) * stride;
        this.legL.rotation.x = swing;
        this.legR.rotation.x = -swing;
        this.armL.rotation.x = -swing * 0.7;
        this.armR.rotation.x = swing * 0.7;
        this.body.rotation.z = THREE.MathUtils.damp(
          this.body.rotation.z,
          -this.vx * 0.055,
          8,
          dt
        );
        this.body.position.y = input.sneak ? -0.16 : Math.abs(Math.sin(this.walkPhase)) * 0.03 * stride;

        // Face travel direction, angled slightly to camera
        const targetYaw =
          dir === 0 && speed < 0.3
            ? 0
            : this.facing > 0
              ? Math.PI / 2 - 0.35
              : -Math.PI / 2 + 0.35;
        this.root.rotation.y = THREE.MathUtils.damp(this.root.rotation.y, targetYaw, 6, dt);
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
    m.position.set(p.x + this.facing * 0.55, m.geometry ? 0.17 : 0, 0.4);
    m.rotation.set(0, 0, 0);
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
