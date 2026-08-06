import * as THREE from "three";
import { Theo } from "./theo";

// The Nursery — floor 7's warden. A child who stopped here and grew wrong.
// It hunts by SIGHT and MOTION: it sees you when you are lit, in its cone,
// unoccluded, and moving. Stillness, shadow and broken line-of-sight save you.
//
// The rule the whole floor teaches: STAY STILL. IT SEES YOU MOVE.

export type EntityState = "patrol" | "alert" | "hunt" | "search" | "seize";

const PATROL_SPEED = 1.05;
const HUNT_SPEED = 3.35;
const SEARCH_SPEED = 1.5;

const CONE_ANGLE = 0.62; // half-angle, radians
const CONE_RANGE = 15.5;
const CATCH_RANGE = 0.75;

/** How fast suspicion fills and drains, per second. */
const SUSPICION_RISE = 1.55;
const SUSPICION_FALL = 0.5;

export interface EntityConfig {
  /** Patrol waypoints along x, walked in order then reversed. */
  waypoints: number[];
  /** Where it pauses and turns its head, keyed by waypoint index. */
  dwellSeconds: number;
  startIndex: number;
}

export class Entity {
  root = new THREE.Group();
  state: EntityState = "patrol";
  /** 0 → oblivious, 1 → it has you. Drives the HUD vignette and audio. */
  suspicion = 0;

  private head = new THREE.Group();
  private neck = new THREE.Group();
  private torso!: THREE.Mesh;
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private gaze!: THREE.SpotLight;
  private gazeTarget = new THREE.Object3D();
  private coneMesh!: THREE.Mesh;

  private waypoints: number[];
  private wpIndex: number;
  private dir = 1;
  private dwell = 0;
  private dwellSeconds: number;
  private facing = 1;
  private vx = 0;
  private phase = 0;
  private headSweep = 0;
  private lastSeenX = 0;
  private searchT = 0;
  private seizeT = 0;
  private lostGraceT = 0;

  /** Set true the frame Theo is taken. The game reads and clears it. */
  caught = false;

  constructor(scene: THREE.Scene, cfg: EntityConfig) {
    this.waypoints = cfg.waypoints;
    this.wpIndex = cfg.startIndex;
    this.dwellSeconds = cfg.dwellSeconds;

    const pale = new THREE.MeshStandardMaterial({ color: 0x6d6a63, roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24242c, roughness: 1 });

    // Too tall, too thin — a child stretched by however long it has been here.
    // Narrow torso, spindly limbs, and a head that stayed the size it was.
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 1.0, 5, 12), dark);
    this.torso.position.y = 1.98;
    this.torso.castShadow = true;
    this.root.add(this.torso);

    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.2, 4, 10), dark);
    hips.position.y = 1.36;
    hips.castShadow = true;
    this.root.add(hips);

    // Head: still a child's head, too big for what it is now. No eyes — just
    // a pale blank face that swings toward whatever it wants to look at.
    this.neck.position.y = 2.62;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 14), pale);
    skull.scale.set(0.86, 1.05, 0.9);
    skull.castShadow = true;
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 18),
      new THREE.MeshStandardMaterial({
        color: 0xf0ece0,
        emissive: 0xb9b3a0,
        emissiveIntensity: 0.55,
        roughness: 1,
      })
    );
    face.position.set(0.2, 0.02, 0);
    face.rotation.y = Math.PI / 2;
    this.head.add(skull, face);
    this.neck.add(this.head);
    this.root.add(this.neck);

    // Spindly arms hanging past the knees — the wrongest thing about it
    for (const [grp, z] of [
      [this.armL, 0.26],
      [this.armR, -0.26],
    ] as const) {
      grp.position.set(0, 2.4, z);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.55, 4, 8), dark);
      upper.position.y = -0.33;
      upper.castShadow = true;
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.6, 4, 8), pale);
      fore.position.y = -0.95;
      fore.castShadow = true;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.34, 0.13), pale);
      hand.position.y = -1.4;
      hand.castShadow = true;
      grp.add(upper, fore, hand);
      this.root.add(grp);
    }

    // Long legs — most of its height is stilt
    for (const [grp, z] of [
      [this.legL, 0.14],
      [this.legR, -0.14],
    ] as const) {
      grp.position.set(0, 1.34, z);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 1.06, 4, 8), dark);
      leg.position.y = -0.66;
      leg.castShadow = true;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.15), dark);
      foot.position.set(0.07, -1.28, 0);
      foot.castShadow = true;
      grp.add(leg, foot);
      this.root.add(grp);
    }

    // Its gaze is a literal light — you can watch it sweep the room
    this.gaze = new THREE.SpotLight(0xdad2b8, 45, CONE_RANGE + 3, CONE_ANGLE, 0.5, 1.1);
    this.gaze.castShadow = true;
    this.gaze.shadow.mapSize.set(1024, 1024);
    this.gaze.shadow.bias = -0.002;
    this.gaze.target = this.gazeTarget;
    scene.add(this.gaze, this.gazeTarget);

    // Faint visible cone so the player can always reason about the threat
    const coneGeo = new THREE.ConeGeometry(
      Math.tan(CONE_ANGLE) * CONE_RANGE,
      CONE_RANGE,
      20,
      1,
      true
    );
    coneGeo.translate(0, -CONE_RANGE / 2, 0);
    // Point along local +Z — the root's yaw maps that to its world facing
    coneGeo.rotateX(-Math.PI / 2);
    this.coneMesh = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        color: 0xe4dcc0,
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.coneMesh.position.y = 2.62;
    this.root.add(this.coneMesh);

    this.root.position.set(this.waypoints[this.wpIndex], 0, -1.4);
    scene.add(this.root);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** Eye point, in world space. */
  private eye(): THREE.Vector3 {
    return new THREE.Vector3(
      this.root.position.x,
      this.root.position.y + 2.62,
      this.root.position.z
    );
  }

  /**
   * Can it see Theo right now? Four gates, all of which the player can act on:
   * range, cone, occlusion, and — the floor's whole lesson — motion or light.
   */
  private canSee(theo: Theo, colliders: THREE.Box3[]): boolean {
    if (theo.hidden) return false;

    const eye = this.eye();
    const target = new THREE.Vector3(
      theo.position.x,
      theo.position.y + 0.55,
      theo.position.z
    );
    const toTarget = target.clone().sub(eye);
    const dist = toTarget.length();
    if (dist > CONE_RANGE) return false;

    // Cone: is he within the arc the head is turned toward?
    const look = new THREE.Vector3(this.facing, 0, 0);
    const flat = new THREE.Vector3(toTarget.x, 0, toTarget.z).normalize();
    if (flat.dot(look) < Math.cos(CONE_ANGLE + 0.12)) return false;

    // Occlusion: furniture between us breaks the line
    const ray = new THREE.Ray(eye, toTarget.clone().normalize());
    const hit = new THREE.Vector3();
    for (const box of colliders) {
      if (box.containsPoint(target)) continue;
      if (ray.intersectBox(box, hit) && eye.distanceTo(hit) < dist - 0.25) {
        return false;
      }
    }

    // Visibility: it sees MOTION, and it sees anything lit.
    const tier = theo.speedTier;
    const litByTorch = theo.flashOn && theo.battery > 0;
    const inItsGaze = dist < CONE_RANGE * 0.75;
    const moving = tier === "walk" || tier === "run";
    const creeping = tier === "sneak";

    if (litByTorch) return true;
    if (moving) return true;
    // A sneak is only caught close in, under its own light
    if (creeping && inItsGaze && dist < 7.5) return true;
    // Perfectly still in shadow: invisible, however close it comes
    return false;
  }

  update(
    dt: number,
    theo: Theo,
    colliders: THREE.Box3[],
    bounds: { minX: number; maxX: number }
  ) {
    const seen = this.state === "seize" ? true : this.canSee(theo, colliders);

    // ── Suspicion: the tell that gives the player a beat to react ──
    if (seen) {
      const dist = Math.abs(theo.position.x - this.root.position.x);
      const closeness = THREE.MathUtils.clamp(1 - dist / CONE_RANGE, 0.25, 1);
      this.suspicion = Math.min(1, this.suspicion + dt * SUSPICION_RISE * closeness);
      this.lastSeenX = theo.position.x;
      this.lostGraceT = 0.7;
    } else {
      this.lostGraceT = Math.max(0, this.lostGraceT - dt);
      this.suspicion = Math.max(0, this.suspicion - dt * SUSPICION_FALL);
    }

    // ── State machine ──
    switch (this.state) {
      case "patrol":
        if (this.suspicion > 0.35) this.state = "alert";
        this.patrol(dt, bounds);
        break;

      case "alert":
        // It has stopped. It is looking. This is the window to freeze or hide.
        this.vx = THREE.MathUtils.damp(this.vx, 0, 8, dt);
        this.faceToward(this.lastSeenX);
        if (this.suspicion >= 1) {
          this.state = "hunt";
        } else if (this.suspicion < 0.15) {
          this.state = "patrol";
        }
        break;

      case "hunt": {
        const dx = theo.position.x - this.root.position.x;
        this.faceToward(theo.position.x);
        this.vx = THREE.MathUtils.damp(this.vx, Math.sign(dx) * HUNT_SPEED, 5, dt);
        if (
          Math.abs(dx) < CATCH_RANGE &&
          Math.abs(theo.position.y - this.root.position.y) < 1.6 &&
          !theo.hidden
        ) {
          this.state = "seize";
          this.seizeT = 0;
          this.vx = 0;
        } else if (!seen && this.lostGraceT <= 0) {
          this.state = "search";
          this.searchT = 4.5;
        }
        break;
      }

      case "search": {
        // Prowls the spot it lost him, then gives up — the reprieve that
        // makes hiding feel earned rather than automatic.
        this.searchT -= dt;
        const dx = this.lastSeenX - this.root.position.x;
        if (Math.abs(dx) > 0.6) {
          this.faceToward(this.lastSeenX);
          this.vx = THREE.MathUtils.damp(this.vx, Math.sign(dx) * SEARCH_SPEED, 5, dt);
        } else {
          this.vx = THREE.MathUtils.damp(this.vx, 0, 7, dt);
          this.headSweep += dt * 2.2;
        }
        if (this.suspicion >= 1) this.state = "hunt";
        else if (this.searchT <= 0) {
          this.state = "patrol";
          this.suspicion = 0;
        }
        break;
      }

      case "seize":
        this.seizeT += dt;
        this.vx = 0;
        this.faceToward(theo.position.x);
        if (this.seizeT > 0.45 && !this.caught) this.caught = true;
        break;
    }

    // ── Integrate ──
    this.root.position.x = THREE.MathUtils.clamp(
      this.root.position.x + this.vx * dt,
      bounds.minX,
      bounds.maxX
    );
    if (Math.abs(this.vx) > 0.05) this.facing = Math.sign(this.vx);

    this.animate(dt, theo);
  }

  private patrol(dt: number, bounds: { minX: number; maxX: number }) {
    if (this.dwell > 0) {
      this.dwell -= dt;
      this.vx = THREE.MathUtils.damp(this.vx, 0, 6, dt);
      // Sweeps its head while it stands — a moment of real danger
      this.headSweep += dt * 1.35;
      return;
    }

    const target = this.waypoints[this.wpIndex];
    const dx = target - this.root.position.x;
    if (Math.abs(dx) < 0.4) {
      this.dwell = this.dwellSeconds;
      this.wpIndex += this.dir;
      if (this.wpIndex >= this.waypoints.length) {
        this.wpIndex = this.waypoints.length - 2;
        this.dir = -1;
      } else if (this.wpIndex < 0) {
        this.wpIndex = 1;
        this.dir = 1;
      }
      return;
    }
    this.vx = THREE.MathUtils.damp(this.vx, Math.sign(dx) * PATROL_SPEED, 3, dt);
    this.headSweep = THREE.MathUtils.damp(this.headSweep, 0, 3, dt);
  }

  private faceToward(x: number) {
    const d = x - this.root.position.x;
    if (Math.abs(d) > 0.35) this.facing = Math.sign(d);
  }

  private animate(dt: number, theo: Theo) {
    const speed = Math.abs(this.vx);
    this.phase += dt * (1 + speed * 2.6);
    const stride = Math.min(1, speed / HUNT_SPEED) * 0.85;
    const sw = Math.sin(this.phase);

    // Long slow strides walking; a lurching sprint when it hunts
    this.legL.rotation.x = -sw * stride;
    this.legR.rotation.x = sw * stride;
    this.armL.rotation.x = sw * stride * 0.55;
    this.armR.rotation.x = -sw * stride * 0.55;

    const hunting = this.state === "hunt" || this.state === "seize";
    // It stoops when it comes for you — the silhouette changes shape
    this.torso.rotation.x = THREE.MathUtils.damp(
      this.torso.rotation.x,
      hunting ? 0.28 : 0.06 + Math.sin(this.phase * 0.5) * 0.02,
      4,
      dt
    );
    this.armL.rotation.z = THREE.MathUtils.damp(this.armL.rotation.z, hunting ? -0.4 : -0.1, 5, dt);
    this.armR.rotation.z = THREE.MathUtils.damp(this.armR.rotation.z, hunting ? 0.4 : 0.1, 5, dt);

    // Body faces travel; the head can look elsewhere, which is worse
    const bodyYaw = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.root.rotation.y = THREE.MathUtils.damp(this.root.rotation.y, bodyYaw, 6, dt);

    let headYaw = Math.sin(this.headSweep) * 0.7;
    if (this.state === "alert" || hunting) {
      // Locks on: the sweep stops dead and the face snaps to him
      const toTheo = theo.position.x - this.root.position.x;
      const rel = Math.atan2(toTheo * this.facing, 4.5);
      headYaw = THREE.MathUtils.clamp(rel, -0.9, 0.9) * 0;
    }
    this.head.rotation.y = THREE.MathUtils.damp(this.head.rotation.y, headYaw, 7, dt);

    // The gaze light and its cone follow the head, not the body
    const eye = this.eye();
    const yaw = this.root.rotation.y + this.head.rotation.y;
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    // Sit the light just ahead of the skull, or it shadows its own face
    this.gaze.position.set(eye.x + dirX * 0.5, eye.y, eye.z + dirZ * 0.5);
    this.gazeTarget.position.set(
      eye.x + dirX * CONE_RANGE,
      eye.y - 1.4,
      eye.z + dirZ * CONE_RANGE
    );
    this.coneMesh.rotation.y = this.head.rotation.y;
    this.coneMesh.rotation.z = -0.12;

    // Brighter and colder the more certain it is
    const heat = this.state === "patrol" ? 0 : Math.max(this.suspicion, hunting ? 1 : 0);
    this.gaze.intensity = THREE.MathUtils.damp(this.gaze.intensity, 42 + heat * 55, 5, dt);
    (this.coneMesh.material as THREE.MeshBasicMaterial).opacity =
      0.04 + heat * 0.075;
  }

  /** Put it back on patrol far from Theo — used when a run restarts. */
  reset(atIndex = 0) {
    this.wpIndex = atIndex;
    this.dir = 1;
    this.state = "patrol";
    this.suspicion = 0;
    this.vx = 0;
    this.dwell = 0;
    this.searchT = 0;
    this.seizeT = 0;
    this.caught = false;
    this.root.position.x = this.waypoints[atIndex];
  }
}
