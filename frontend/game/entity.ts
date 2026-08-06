import * as THREE from "three";
import { Theo } from "./theo";
import { EntitySpec, FloorBuild, FloorContext, SenseKind } from "./build";

// Every floor's warden is a child who stopped there and grew wrong in the
// direction of its own fear. They share a body plan and a state machine;
// what differs — and what the whole floor teaches — is the sense it hunts by.

export type EntityState = "patrol" | "alert" | "hunt" | "search" | "seize";

const PATROL_SPEED = 1.05;
const SEARCH_SPEED = 1.5;
const CATCH_RANGE = 0.8;

const CONE_ANGLE = 0.62;
const CONE_RANGE = 15.5;

const SUSPICION_RISE = 1.55;
const SUSPICION_FALL = 0.5;

/** How each sense behaves. Tuned so every floor plays differently. */
const SENSE: Record<
  SenseKind,
  { range: number; huntSpeed: number; rise: number; showsCone: boolean }
> = {
  sight: { range: CONE_RANGE, huntSpeed: 3.35, rise: 1.0, showsCone: true },
  sound: { range: 13, huntSpeed: 3.1, rise: 1.15, showsCone: false },
  smell: { range: 20, huntSpeed: 2.75, rise: 0.8, showsCone: false },
  echo: { range: 12.5, huntSpeed: 3.5, rise: 1.9, showsCone: false },
  vibration: { range: 17, huntSpeed: 4.1, rise: 1.35, showsCone: false },
  reflection: { range: 14, huntSpeed: 3.6, rise: 1.6, showsCone: false },
  none: { range: 0, huntSpeed: 0, rise: 0, showsCone: false },
};

export class Entity {
  root = new THREE.Group();
  state: EntityState = "patrol";
  suspicion = 0;
  readonly sense: SenseKind;

  private head = new THREE.Group();
  private neck = new THREE.Group();
  private torso!: THREE.Mesh;
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private gaze!: THREE.SpotLight;
  private gazeTarget = new THREE.Object3D();
  private coneMesh?: THREE.Mesh;
  /** The visible pulse an echolocator throws out. */
  private pingMesh?: THREE.Mesh;
  private pingT = 0;
  private pingRadius = 0;

  private spec: EntitySpec;
  private waypoints: number[];
  private wpIndex: number;
  private dir = 1;
  private dwell = 0;
  private facing = 1;
  private vx = 0;
  private phase = 0;
  private headSweep = 0;
  private lastSeenX = 0;
  private searchT = 0;
  private seizeT = 0;
  private lostGraceT = 0;

  /** Scent trail the feeder walks — oldest point first. */
  private trail: { x: number; age: number }[] = [];
  private trailTick = 0;

  caught = false;

  constructor(scene: THREE.Scene, spec: EntitySpec) {
    this.spec = spec;
    this.sense = spec.sense;
    this.waypoints = spec.waypoints;
    this.wpIndex = spec.startIndex;

    const pale = new THREE.MeshStandardMaterial({ color: 0x6d6a63, roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24242c, roughness: 1 });

    // Proportions per shape — each is the same child bent a different way
    const P = {
      nursery: { torsoR: 0.21, torsoL: 1.0, hipY: 1.34, legL: 1.06, armR: 0.052, skull: 0.3, headY: 2.62 },
      listener: { torsoR: 0.19, torsoL: 0.9, hipY: 1.2, legL: 0.95, armR: 0.046, skull: 0.26, headY: 2.36 },
      feeder: { torsoR: 0.42, torsoL: 0.75, hipY: 0.95, legL: 0.72, armR: 0.07, skull: 0.27, headY: 2.05 },
      whisperer: { torsoR: 0.17, torsoL: 1.25, hipY: 1.5, legL: 1.24, armR: 0.042, skull: 0.24, headY: 2.95 },
      constrictor: { torsoR: 0.24, torsoL: 1.5, hipY: 0.7, legL: 0.5, armR: 0.05, skull: 0.25, headY: 2.5 },
      mirror: { torsoR: 0.16, torsoL: 0.32, hipY: 0.46, legL: 0.32, armR: 0.042, skull: 0.2, headY: 0.88 },
    }[spec.shape];

    this.torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(P.torsoR, P.torsoL, 5, 12),
      dark
    );
    this.torso.position.y = P.hipY + P.torsoL * 0.62;
    this.torso.castShadow = true;
    this.root.add(this.torso);

    const hips = new THREE.Mesh(
      new THREE.CapsuleGeometry(P.torsoR * 0.9, 0.2, 4, 10),
      dark
    );
    hips.position.y = P.hipY;
    hips.castShadow = true;
    this.root.add(hips);

    // The head kept its child size. Nothing else did.
    this.neck.position.y = P.headY;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(P.skull, 16, 14), pale);
    skull.scale.set(0.86, 1.05, 0.9);
    skull.castShadow = true;
    this.head.add(skull);

    // One horrifying detail, chosen by what it hunts with
    if (spec.shape === "listener") {
      // Ears like a hare's, far too long, always turning
      for (const z of [0.14, -0.14]) {
        const ear = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.055, 0.85, 4, 8),
          pale
        );
        ear.position.set(-0.04, 0.62, z);
        ear.rotation.x = z > 0 ? 0.16 : -0.16;
        ear.rotation.z = 0.1;
        ear.castShadow = true;
        this.head.add(ear);
      }
    } else if (spec.shape === "feeder") {
      // A wet mouth that never closes
      const mouth = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x2a1418, roughness: 0.6 })
      );
      mouth.position.set(0.2, -0.06, 0);
      mouth.rotation.z = -Math.PI / 2;
      this.head.add(mouth);
    } else if (spec.shape === "whisperer") {
      // No face at all — a smooth dish that points at you
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.23, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({
          color: 0xd8d2c2,
          emissive: 0x4a4638,
          emissiveIntensity: 0.4,
          roughness: 1,
        })
      );
      dish.position.set(0.13, 0, 0);
      dish.rotation.z = -Math.PI / 2;
      this.head.add(dish);
    } else {
      // A blank pale face, no eyes
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(P.skull * 0.6, 18),
        new THREE.MeshStandardMaterial({
          color: 0xf0ece0,
          emissive: 0xb9b3a0,
          emissiveIntensity: 0.55,
          roughness: 1,
        })
      );
      face.position.set(P.skull * 0.72, 0.02, 0);
      face.rotation.y = Math.PI / 2;
      this.head.add(face);
    }
    this.neck.add(this.head);
    this.root.add(this.neck);

    // Arms long enough to be wrong
    const armLen = (P.headY - P.hipY) * 0.9;
    for (const [grp, z] of [
      [this.armL, P.torsoR + 0.05],
      [this.armR, -(P.torsoR + 0.05)],
    ] as const) {
      grp.position.set(0, P.headY - 0.22, z);
      const upper = new THREE.Mesh(
        new THREE.CapsuleGeometry(P.armR, armLen * 0.45, 4, 8),
        dark
      );
      upper.position.y = -armLen * 0.28;
      upper.castShadow = true;
      const fore = new THREE.Mesh(
        new THREE.CapsuleGeometry(P.armR * 0.86, armLen * 0.48, 4, 8),
        pale
      );
      fore.position.y = -armLen * 0.78;
      fore.castShadow = true;
      const hand = new THREE.Mesh(
        new THREE.BoxGeometry(P.armR * 1.5, 0.3, P.armR * 2.6),
        pale
      );
      hand.position.y = -armLen * 1.12;
      hand.castShadow = true;
      grp.add(upper, fore, hand);
      this.root.add(grp);
    }

    for (const [grp, z] of [
      [this.legL, 0.14],
      [this.legR, -0.14],
    ] as const) {
      grp.position.set(0, P.hipY, z);
      const leg = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.072, P.legL, 4, 8),
        dark
      );
      leg.position.y = -P.legL * 0.62;
      leg.castShadow = true;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.15), dark);
      foot.position.set(0.07, -P.legL - 0.22, 0);
      foot.castShadow = true;
      grp.add(leg, foot);
      this.root.add(grp);
    }

    this.eyeY = P.headY;

    // Its attention is a light. On sighted floors it's a cone you can watch;
    // on the others it's a close halo so you can still find it in the dark.
    const s = SENSE[spec.sense];
    this.gaze = new THREE.SpotLight(
      0xdad2b8,
      s.showsCone ? 45 : 16,
      (s.showsCone ? CONE_RANGE : 7) + 3,
      s.showsCone ? CONE_ANGLE : 1.15,
      0.5,
      1.1
    );
    this.gaze.castShadow = s.showsCone;
    if (s.showsCone) {
      this.gaze.shadow.mapSize.set(1024, 1024);
      this.gaze.shadow.bias = -0.002;
    }
    this.gaze.target = this.gazeTarget;
    scene.add(this.gaze, this.gazeTarget);

    if (s.showsCone) {
      const coneGeo = new THREE.ConeGeometry(
        Math.tan(CONE_ANGLE) * CONE_RANGE,
        CONE_RANGE,
        20,
        1,
        true
      );
      coneGeo.translate(0, -CONE_RANGE / 2, 0);
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
      this.coneMesh.position.y = P.headY;
      this.root.add(this.coneMesh);
    }

    if (spec.sense === "echo") {
      // The ping: a ring that rushes outward. You see it coming.
      this.pingMesh = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.05, 6, 32),
        new THREE.MeshBasicMaterial({
          color: 0xcfd6e4,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.pingMesh.rotation.x = Math.PI / 2;
      this.pingMesh.position.y = 0.3;
      this.root.add(this.pingMesh);
    }

    this.root.position.set(this.waypoints[this.wpIndex], 0, -1.4);
    scene.add(this.root);
  }

  private eyeY = 2.62;

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  private eye(): THREE.Vector3 {
    return new THREE.Vector3(
      this.root.position.x,
      this.root.position.y + this.eyeY,
      this.root.position.z
    );
  }

  private occluded(target: THREE.Vector3, colliders: THREE.Box3[]): boolean {
    const eye = this.eye();
    const to = target.clone().sub(eye);
    const dist = to.length();
    const ray = new THREE.Ray(eye, to.normalize());
    const hit = new THREE.Vector3();
    for (const b of colliders) {
      if (b.containsPoint(target)) continue;
      if (ray.intersectBox(b, hit) && eye.distanceTo(hit) < dist - 0.25) return true;
    }
    return false;
  }

  private inZone(kind: string, x: number, y: number, floor: FloorBuild): boolean {
    const p = new THREE.Vector3(x, y + 0.3, 0);
    return floor.zones.some(
      (z) => z.kind === kind && z.active !== false && z.box.containsPoint(p)
    );
  }

  /**
   * The heart of each floor. Returns 0..1 — how strongly it perceives him
   * right now. Every sense has a counter the player can discover and use.
   */
  private perceive(
    theo: Theo,
    colliders: THREE.Box3[],
    floor: FloorBuild,
    ctx: FloorContext
  ): number {
    if (theo.hidden && this.sense !== "smell") return 0;

    const s = SENSE[this.sense];
    const dx = theo.position.x - this.root.position.x;
    const dist = Math.abs(dx);
    if (dist > s.range) return 0;

    const tier = theo.speedTier;
    const near = 1 - dist / s.range;

    switch (this.sense) {
      case "sight": {
        const target = new THREE.Vector3(
          theo.position.x,
          theo.position.y + 0.55,
          theo.position.z
        );
        const look = new THREE.Vector3(this.facing, 0, 0);
        const flat = new THREE.Vector3(dx, 0, theo.position.z - this.root.position.z);
        if (flat.normalize().dot(look) < Math.cos(CONE_ANGLE + 0.12)) return 0;
        if (this.occluded(target, colliders)) return 0;
        if (theo.flashOn && theo.battery > 0) return 1;
        if (tier === "walk" || tier === "run") return 1;
        if (tier === "sneak" && dist < 7.5) return 0.75;
        return 0; // still, in shadow: it cannot find you
      }

      case "sound": {
        // Blind. It hears you — and water makes everything louder.
        const wet = this.inZone("water", theo.position.x, theo.position.y, floor);
        const quiet = this.inZone("quiet", theo.position.x, theo.position.y, floor);
        let loud =
          tier === "run" ? 1 : tier === "walk" ? 0.6 : tier === "sneak" ? 0.12 : 0;
        if (wet) loud = Math.min(1, loud * 2.1 + (tier === "still" ? 0 : 0.1));
        if (quiet) loud *= 0.25;
        loud = Math.max(loud, floor.noise ?? 0);
        if (theo.position.y > 0.6) loud *= 0.6; // up off the wet floor
        return loud * (0.45 + near * 0.55);
      }

      case "smell": {
        // Hiding does not help. Masking does, and it can be baited away.
        if (this.inZone("mask", theo.position.x, theo.position.y, floor)) return 0;
        if (theo.carriesReeking) return Math.min(1, 0.55 + near * 0.7);
        return near * 0.85;
      }

      case "echo": {
        // Only the ping sees. Standing still is no defence — soft cover is.
        if (this.pingT > 0.35) return 0;
        if (this.pingRadius < dist - 1.2 || this.pingRadius > dist + 3.5) return 0;
        if (this.inZone("soft", theo.position.x, theo.position.y, floor)) return 0;
        if (this.occluded(new THREE.Vector3(theo.position.x, theo.position.y + 0.5, 0), colliders))
          return 0;
        return 1;
      }

      case "vibration": {
        // It reads the floorboards. Get off them and you do not exist.
        if (theo.position.y > 0.35) return 0;
        if (this.inZone("quiet", theo.position.x, theo.position.y, floor)) return 0;
        const step =
          tier === "run" ? 1 : tier === "walk" ? 0.55 : tier === "sneak" ? 0.14 : 0;
        return step * (0.5 + near * 0.5);
      }

      case "reflection": {
        // It lives in the glass. Cover the glass.
        const seenInGlass = floor.zones.some(
          (z) =>
            z.kind === "mirror" &&
            z.active !== false &&
            Math.abs(theo.position.x - (z.box.min.x + z.box.max.x) / 2) < 3.2
        );
        if (!seenInGlass) return 0;
        if (tier === "still") return 0.45;
        return 1;
      }

      default:
        return 0;
    }
  }

  update(
    dt: number,
    theo: Theo,
    colliders: THREE.Box3[],
    bounds: { minX: number; maxX: number },
    floor: FloorBuild,
    ctx: FloorContext
  ) {
    const s = SENSE[this.sense];

    // Echolocation pulse — the clock the whole study floor runs on
    if (this.sense === "echo") {
      this.pingT += dt;
      if (this.pingT > 3.4) {
        this.pingT = 0;
        this.pingRadius = 0;
      }
      this.pingRadius += dt * 14;
      if (this.pingMesh) {
        const m = this.pingMesh.material as THREE.MeshBasicMaterial;
        m.opacity = Math.max(0, 0.5 - this.pingT * 0.6);
        const r = Math.max(0.4, this.pingRadius);
        this.pingMesh.scale.set(r, r, 1);
      }
    }

    // Scent memory — the feeder walks where you walked, late
    if (this.sense === "smell") {
      this.trailTick += dt;
      if (this.trailTick > 0.35 && !theo.hidden) {
        this.trailTick = 0;
        this.trail.push({ x: theo.position.x, age: 0 });
        if (this.trail.length > 40) this.trail.shift();
      }
      for (const p of this.trail) p.age += dt;
      this.trail = this.trail.filter((p) => p.age < 14);
    }

    const level = this.state === "seize" ? 1 : this.perceive(theo, colliders, floor, ctx);

    if (level > 0) {
      this.suspicion = Math.min(
        1,
        this.suspicion + dt * SUSPICION_RISE * s.rise * level
      );
      this.lastSeenX = theo.position.x;
      this.lostGraceT = 0.7;
    } else {
      this.lostGraceT = Math.max(0, this.lostGraceT - dt);
      this.suspicion = Math.max(0, this.suspicion - dt * SUSPICION_FALL);
    }

    // A thrown object always wins its attention over you
    if (ctx.decoy && this.sense !== "vibration") {
      this.lastSeenX = ctx.decoy.x;
      if (this.state === "patrol" || this.state === "alert") {
        this.state = "search";
        this.searchT = 5;
      }
    }

    switch (this.state) {
      case "patrol":
        if (this.suspicion > 0.35) this.state = "alert";
        this.patrol(dt);
        break;

      case "alert":
        this.vx = THREE.MathUtils.damp(this.vx, 0, 8, dt);
        this.faceToward(this.lastSeenX);
        if (this.suspicion >= 1) this.state = "hunt";
        else if (this.suspicion < 0.15) this.state = "patrol";
        break;

      case "hunt": {
        const dx = theo.position.x - this.root.position.x;
        this.faceToward(theo.position.x);
        this.vx = THREE.MathUtils.damp(this.vx, Math.sign(dx) * s.huntSpeed, 5, dt);
        if (
          Math.abs(dx) < CATCH_RANGE &&
          Math.abs(theo.position.y - this.root.position.y) < 1.8 &&
          !theo.hidden
        ) {
          this.state = "seize";
          this.seizeT = 0;
          this.vx = 0;
        } else if (level <= 0 && this.lostGraceT <= 0) {
          this.state = "search";
          this.searchT = 4.5;
        }
        break;
      }

      case "search": {
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

    // It will not cross into the rooms it is afraid of
    const lo = Math.max(bounds.minX, this.spec.safeBelow);
    const hi = Math.min(bounds.maxX, this.spec.safeAbove);
    this.root.position.x = THREE.MathUtils.clamp(
      this.root.position.x + this.vx * dt,
      lo,
      hi
    );
    if (Math.abs(this.vx) > 0.05) this.facing = Math.sign(this.vx);

    this.animate(dt, theo);
  }

  private patrol(dt: number) {
    if (this.dwell > 0) {
      this.dwell -= dt;
      this.vx = THREE.MathUtils.damp(this.vx, 0, 6, dt);
      this.headSweep += dt * 1.35;
      return;
    }
    const target = this.waypoints[this.wpIndex];
    const dx = target - this.root.position.x;
    if (Math.abs(dx) < 0.4) {
      this.dwell = this.spec.dwellSeconds;
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
    const stride = Math.min(1, speed / 3.4) * 0.85;
    const sw = Math.sin(this.phase);

    this.legL.rotation.x = -sw * stride;
    this.legR.rotation.x = sw * stride;
    this.armL.rotation.x = sw * stride * 0.55;
    this.armR.rotation.x = -sw * stride * 0.55;

    const hunting = this.state === "hunt" || this.state === "seize";
    this.torso.rotation.x = THREE.MathUtils.damp(
      this.torso.rotation.x,
      hunting ? 0.28 : 0.06 + Math.sin(this.phase * 0.5) * 0.02,
      4,
      dt
    );
    this.armL.rotation.z = THREE.MathUtils.damp(this.armL.rotation.z, hunting ? -0.4 : -0.1, 5, dt);
    this.armR.rotation.z = THREE.MathUtils.damp(this.armR.rotation.z, hunting ? 0.4 : 0.1, 5, dt);

    const bodyYaw = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.root.rotation.y = THREE.MathUtils.damp(this.root.rotation.y, bodyYaw, 6, dt);

    const headYaw =
      this.state === "alert" || hunting ? 0 : Math.sin(this.headSweep) * 0.7;
    this.head.rotation.y = THREE.MathUtils.damp(this.head.rotation.y, headYaw, 7, dt);

    const eye = this.eye();
    const yaw = this.root.rotation.y + this.head.rotation.y;
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    const s = SENSE[this.sense];
    const reach = s.showsCone ? CONE_RANGE : 6;
    this.gaze.position.set(eye.x + dirX * 0.5, eye.y, eye.z + dirZ * 0.5);
    this.gazeTarget.position.set(
      eye.x + dirX * reach,
      eye.y - 1.4,
      eye.z + dirZ * reach
    );

    const heat = this.state === "patrol" ? 0 : Math.max(this.suspicion, hunting ? 1 : 0);
    this.gaze.intensity = THREE.MathUtils.damp(
      this.gaze.intensity,
      (s.showsCone ? 42 : 14) + heat * (s.showsCone ? 55 : 26),
      5,
      dt
    );
    if (this.coneMesh) {
      this.coneMesh.rotation.y = this.head.rotation.y;
      this.coneMesh.rotation.z = -0.12;
      (this.coneMesh.material as THREE.MeshBasicMaterial).opacity = 0.04 + heat * 0.075;
    }
  }

  reset(atIndex = 0) {
    this.wpIndex = THREE.MathUtils.clamp(atIndex, 0, this.waypoints.length - 1);
    this.dir = 1;
    this.state = "patrol";
    this.suspicion = 0;
    this.vx = 0;
    this.dwell = 0;
    this.searchT = 0;
    this.seizeT = 0;
    this.caught = false;
    this.trail = [];
    this.root.position.x = this.waypoints[this.wpIndex];
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.root, this.gaze, this.gazeTarget);
  }
}
