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

const SUSPICION_RISE = 1.7;
// Slower than it rises — once it has an idea where you are, it keeps it.
const SUSPICION_FALL = 0.36;
const SEARCH_SECONDS = 6.0;

/**
 * How hard a floor's warden looks for a child who has hidden.
 *
 * Seven does not look at all, and that is deliberate: hiding has to be
 * reliably safe exactly once, or the player never learns to trust it. The
 * nursery is where you find out that stillness works. Every floor below is
 * where you find out it stops working — each one checks more places, over a
 * wider stretch of the floor, and lingers less over each before moving on.
 */
function searchProfile(floor: number): {
  places: number;
  radius: number;
  dwell: number;
} {
  if (floor >= 7) return { places: 0, radius: 0, dwell: 0 };
  const depth = 6 - floor; // 0 on the baths → 4 on the mirror floor
  return {
    places: Math.min(6, 2 + Math.round(depth * 0.9)),
    radius: 9 + depth * 2.6,
    dwell: Math.max(0.5, 1.5 - depth * 0.24),
  };
}
const LOST_GRACE = 1.0;

/**
 * The house gets worse as it gets deeper. Floor 7 is the tutorial; by the
 * corridors the wardens notice faster and run you down harder.
 */
/**
 * Which of them can leave the floor. The nursery thing is long-limbed enough
 * to go up a wall; the whisperer is a spider and prefers the ceiling. The
 * feeder is far too heavy, the listener is standing in water, and the thing
 * under the boards has nowhere to climb to — refusing them is as much
 * characterisation as letting the others.
 */
const CAN_CLIMB = new Set<SenseKind>(["sight", "echo", "reflection", "gaze"]);

function depthScale(floor: number): number {
  return 1 + (7 - floor) * 0.075; // 1.00 on seven → 1.30 on two
}

/** How each sense behaves. Tuned so every floor plays differently. */
const SENSE: Record<
  SenseKind,
  { range: number; huntSpeed: number; rise: number; showsCone: boolean }
> = {
  sight: { range: CONE_RANGE, huntSpeed: 3.35, rise: 1.0, showsCone: true },
  sound: { range: 13, huntSpeed: 3.1, rise: 1.15, showsCone: false },
  // Presence, not light or noise. Short range, but nothing denies it.
  proximity: { range: 7.5, huntSpeed: 3.2, rise: 1.5, showsCone: false },
  // The Weeper never hunts in the ordinary sense — it closes the distance
  // while you are not facing it, and takes you when it arrives.
  gaze: { range: 40, huntSpeed: 2.2, rise: 0.9, showsCone: false },
  // The Collector is not trying to kill you. It wants the key.
  theft: { range: 22, huntSpeed: 3.0, rise: 0.7, showsCone: false },
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

  /** Seconds since the last echolocation pulse — the game plays it. */
  get pingPhase() {
    return this.pingT;
  }

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
  private clawSets: THREE.Group[] = [];
  /** Hiding places it means to look inside, nearest first. */
  private toSearch: { x: number; checked: boolean }[] = [];
  private checkingT = 0;
  /** Where on a wall or ceiling it currently is: 0 = floor, 1 = ceiling. */
  private climb = 0;
  private climbTarget = 0;
  /** Reused so the walk test allocates nothing per frame. */
  private probe = new THREE.Box3();
  /** How long it has been unable to make progress. Guards against deadlock. */
  private stuckT = 0;
  /** The Crying Man's beat: crying stops, it looks, THEN it screams. */
  private noticeT = 0;
  /** Raised for one frame when the crying cuts out. The game plays it. */
  justNoticed = false;
  /** Raised for one frame when it screams and commits. */
  justScreamed = false;
  /** The Collector has taken the key and is carrying it somewhere. */
  holdingKey = false;
  /** Raised for one frame when it lifts the key off you. */
  justStole = false;
  /** Where the Collector dumped what it took. */
  stashX: number | null = null;
  /** The Listener talks itself out of an investigation now and then. */
  private doubtT = 0;
  private idleTic = 0;
  /** Debug: what the last hiding-place check actually saw. */
  lastCheck: { atX: number; theoX: number; hidden: boolean; dist: number } | null = null;
  /** Set the frame it drags someone out of a hiding place. */
  found = false;

  constructor(scene: THREE.Scene, spec: EntitySpec) {
    this.spec = spec;
    this.sense = spec.sense;
    this.waypoints = spec.waypoints;
    this.wpIndex = spec.startIndex;

    // Each warden is a different disease. Two shared greys made them all read
    // as the same silhouette in different sizes; they need their own colour of
    // wrong. `flesh` is the exposed skin, `cloth` the rotted layer over it,
    // `wet` the detail that catches the light and turns your stomach.
    const SKIN: Record<string, { flesh: number; cloth: number; wet: number; emis: number }> = {
      // waxy candle-white, grave-blue rags
      nursery: { flesh: 0xcfc4ae, cloth: 0x2b2f3c, wet: 0x8a94a6, emis: 0x2a3040 },
      // drowned: bloated, blue-white, permanently wet
      listener: { flesh: 0xa8bfc4, cloth: 0x27373b, wet: 0xd6ecef, emis: 0x1f4448 },
      // raw and fed: pink-red, split skin, grease
      feeder: { flesh: 0xb0705f, cloth: 0x3a2118, wet: 0xd9a08a, emis: 0x3a1410 },
      // mould: grey-green, dusty, dry as paper
      whisperer: { flesh: 0x9aa287, cloth: 0x2c3327, wet: 0xc8d0ae, emis: 0x24301e },
      // under the boards: dark meat and rust
      constrictor: { flesh: 0x7d4a3c, cloth: 0x2a1a16, wet: 0xa8624a, emis: 0x35120c },
      // mercury: it is not skin at all, it is surface
      mirror: { flesh: 0xb9c6d4, cloth: 0x3a4250, wet: 0xe8f0fa, emis: 0x46586e },
    };
    const S = SKIN[spec.shape];
    const pale = new THREE.MeshStandardMaterial({
      color: S.flesh, roughness: 0.85,
      emissive: S.emis, emissiveIntensity: 0.25,
    });
    const dark = new THREE.MeshStandardMaterial({ color: S.cloth, roughness: 1 });
    // Wet, slightly glossy — used for mouths, eyes, and things that ooze
    const wet = new THREE.MeshStandardMaterial({
      color: S.wet, roughness: 0.25, metalness: 0.15,
      emissive: S.emis, emissiveIntensity: 0.5,
    });

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

    // ── Grotesque anatomy ──
    // Ribs pushing through the skin. Every one of these was a child that
    // stopped eating, or stopped moving, or stopped being a shape at all.
    if (spec.shape !== "mirror") {
      const ribCount = spec.shape === "feeder" ? 3 : 5;
      for (let i = 0; i < ribCount; i++) {
        const rib = new THREE.Mesh(
          new THREE.TorusGeometry(P.torsoR * 1.02, 0.016, 5, 10, Math.PI * 1.15),
          pale
        );
        rib.rotation.y = Math.PI / 2;
        rib.rotation.z = Math.PI * 0.42;
        rib.position.y = P.hipY + P.torsoL * (0.35 + i * 0.19);
        rib.castShadow = true;
        this.root.add(rib);
      }
      // A spine that has come loose of the back
      for (let i = 0; i < 6; i++) {
        const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), pale);
        knuckle.position.set(-P.torsoR * 0.85, P.hipY + P.torsoL * (0.3 + i * 0.16), 0);
        knuckle.scale.set(0.8, 1, 1.4);
        this.root.add(knuckle);
      }
    }

    // Long grasping fingers on every hand — the thing that reaches for you
    this.clawSets = [];
    for (const grp of [this.armL, this.armR]) {
      const claws = new THREE.Group();
      for (let f = 0; f < 4; f++) {
        const finger = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.014, 0.16 + (f % 2) * 0.06, 3, 5),
          pale
        );
        finger.position.set(0, -0.11, (f - 1.5) * 0.035);
        finger.rotation.x = (f - 1.5) * 0.16;
        finger.rotation.z = 0.12;
        finger.castShadow = true;
        claws.add(finger);
      }
      claws.position.y = -((P.headY - P.hipY) * 0.9) * 1.12 - 0.1;
      grp.add(claws);
      this.clawSets.push(claws);
    }

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
      this.gaze.shadow.mapSize.set(512, 512);
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
    // Hiding denies most senses. It does NOT deny presence: the Blind Man
    // knows a body is near it whether or not that body is under a bed, which
    // is the entire lesson of its floor.
    if (theo.hidden && this.sense !== "smell" && this.sense !== "proximity") return 0;

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

      case "proximity": {
        // Rings, not a cone. Far is nothing, medium is unease, close is
        // certainty — and hiding only buys you anything if you are far enough
        // away that it was never sure to begin with.
        const near = theo.hidden ? dist * 1.35 : dist; // cover blurs it a little
        if (near > 7.5) return 0;
        if (near > 4.5) return 0.35; // it slows, and turns its head
        if (near > 2.2) return 0.8;
        return 1;
      }

      case "gaze": {
        // The Weeper moves only while you are NOT facing it. In a fixed side
        // camera "looking away" is which way the boy is turned — and turning
        // away is exactly what you must do to walk on, which is the trap.
        // dx runs FROM the warden TO the boy, so the way he must be turned to
        // be looking at it is the opposite sign. Getting this backwards made
        // the Weeper freeze whenever you turned your back and advance while
        // you stared straight at it — precisely inside out.
        const towardIt = Math.sign(this.root.position.x - theo.position.x);
        const facingIt = theo.facing === towardIt;
        // It never loses you and never needs to search. It only closes.
        return facingIt ? 0 : 1;
      }

      case "theft": {
        // It is interested in you only as far as you are carrying something.
        // With nothing to take it drifts, watching.
        if (dist > 22) return 0;
        return 0.6;
      }

      case "smell": {
        // Hiding does not help. Masking does, and it can be baited away.
        if (this.inZone("mask", theo.position.x, theo.position.y, floor)) return 0;
        if (theo.carriesReeking) return Math.min(1, 0.55 + near * 0.7);
        return near * 0.85;
      }

      case "echo": {
        // A loud clatter does not need a ping to be heard.
        if ((floor.noise ?? 0) > 0.45) return floor.noise!;
        // Otherwise only the ping sees. Stillness is no defence — cover is.
        if (this.pingT > 0.35) return 0;
        if (this.pingRadius < dist - 1.2 || this.pingRadius > dist + 3.5) return 0;
        if (this.inZone("soft", theo.position.x, theo.position.y, floor)) return 0;
        if (this.occluded(new THREE.Vector3(theo.position.x, theo.position.y + 0.5, 0), colliders))
          return 0;
        return 1;
      }

      case "vibration": {
        // Anything heavy hitting the boards travels straight to it, even if
        // you are up off the floor when it lands.
        if ((floor.noise ?? 0) > 0.6) return floor.noise!;
        // Otherwise it reads footfall alone. Get off the boards and you do
        // not exist to it.
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
        this.suspicion + dt * SUSPICION_RISE * s.rise * level * depthScale(floor.floor)
      );
      this.lastSeenX = theo.position.x;
      this.lostGraceT = LOST_GRACE;
    } else {
      this.lostGraceT = Math.max(0, this.lostGraceT - dt);
      this.suspicion = Math.max(0, this.suspicion - dt * SUSPICION_FALL);
    }

    // A standing lure — a tap left running, a record still turning — holds it
    // there while it lasts, provided it has not actually got hold of you.
    if (floor.lure !== undefined && this.state !== "hunt" && this.state !== "seize") {
      this.lastSeenX = floor.lure;
      if (this.state === "patrol") {
        this.state = "search";
        this.searchT = 1.5; // refreshed every frame the lure keeps running
      }
    }

    // A thrown object always wins its attention over you
    if (ctx.decoy && this.sense !== "vibration") {
      // ...unless the Listener has started to doubt. It will follow a noise,
      // but not forever, and not a second time in a row. Otherwise a bottle is
      // an off switch and the floor has no teeth.
      if (!(this.sense === "sound" && this.doubtT > 0)) {
        this.lastSeenX = ctx.decoy.x;
        if (this.state === "patrol" || this.state === "alert") {
          this.state = "search";
          this.searchT = 5;
          this.doubtT = 0;
        }
      }
    }

    // The Listener talks itself out of an investigation. Partway to a noise it
    // stops, and goes back to standing still and listening — which is when a
    // player who trusted the decoy is caught moving.
    if (this.sense === "sound") {
      if (this.state === "search") {
        this.doubtT += dt;
        if (this.doubtT > 3.2 && level <= 0) {
          this.state = "alert";
          this.suspicion = Math.max(this.suspicion, 0.4);
          this.doubtT = -4; // it will not be fooled again for a while
          this.vx = 0;
        }
      } else if (this.doubtT < 0) {
        this.doubtT += dt;
      } else {
        this.doubtT = 0;
      }
    }

    // ── The Weeper ──
    // It has no patrol, no alert and no hunt. It stands still while the boy
    // is facing it and closes while he is not, and it never loses him. Running
    // it through the ordinary state machine would give it a chase, which is
    // exactly the thing it must never do.
    if (this.sense === "gaze" && this.state !== "seize") {
      const dxw = theo.position.x - this.root.position.x;
      // Same sign trap as in perceive(): he faces it when he is turned toward
      // the warden, which is the opposite of the warden-to-boy vector.
      const facingIt = theo.facing === Math.sign(-dxw);
      this.faceToward(theo.position.x);
      if (facingIt || theo.hidden) {
        // Caught looking. It does not even breathe.
        this.vx = 0;
        this.state = "alert";
      } else {
        this.state = "hunt";
        // Never a sprint. It is always simply nearer than it was.
        this.vx = THREE.MathUtils.damp(
          this.vx, Math.sign(dxw) * s.huntSpeed * 0.55 * depthScale(floor.floor), 3, dt
        );
      }
      if (Math.abs(dxw) < CATCH_RANGE && !theo.hidden && !facingIt) {
        this.state = "seize";
        this.seizeT = 0;
        this.vx = 0;
      }
      this.finishMove(dt, colliders, bounds, theo);
      return;
    }

    // ── The Collector ──
    // It is not trying to kill the boy. It wants what he is carrying, and
    // once it has it, it loses interest in him entirely and goes to hide it.
    // Being caught by this one costs you the floor's progress, not your life.
    if (this.sense === "theft" && this.state !== "seize") {
      const dxc = theo.position.x - this.root.position.x;
      if (this.holdingKey) {
        // Off to stash it. It does not look back.
        const goal = this.stashX ?? bounds.maxX - 6;
        const gdx = goal - this.root.position.x;
        this.faceToward(goal);
        this.vx = Math.abs(gdx) < 0.6
          ? THREE.MathUtils.damp(this.vx, 0, 8, dt)
          : THREE.MathUtils.damp(this.vx, Math.sign(gdx) * 2.4, 4, dt);
        this.state = "search";
      } else if (theo.hasKeyInPocket && Math.abs(dxc) < 22) {
        // It has seen that he has something. It follows — never quite
        // hurrying, which is worse than being chased.
        this.faceToward(theo.position.x);
        this.state = Math.abs(dxc) < 9 ? "hunt" : "alert";
        this.vx = THREE.MathUtils.damp(
          this.vx, Math.sign(dxc) * s.huntSpeed * 0.8 * depthScale(floor.floor), 4, dt
        );
        if (Math.abs(dxc) < CATCH_RANGE + 0.3 && !theo.hidden) {
          this.holdingKey = true;
          this.justStole = true;
          // It takes it somewhere else on the floor, well away from him.
          this.stashX = dxc > 0
            ? Math.max(bounds.minX + 4, theo.position.x - 26)
            : Math.min(bounds.maxX - 4, theo.position.x + 26);
        }
      } else {
        this.state = "patrol";
        this.patrol(dt);
      }
      this.finishMove(dt, colliders, bounds, theo);
      return;
    }

    switch (this.state) {
      case "patrol":
        this.noticeT = 0;
        if (this.suspicion > 0.35) this.state = "alert";
        this.patrol(dt);
        break;

      case "alert":
        this.vx = THREE.MathUtils.damp(this.vx, 0, 8, dt);
        this.faceToward(this.lastSeenX);
        // The Crying Man does not lunge the instant he notices. The crying
        // stops FIRST — the silence is the tell — then he turns his head, and
        // only then does he scream. That gap is the whole horror of the floor:
        // you get about a second to understand what you have done.
        if (this.sense === "sight") {
          if (this.noticeT === 0) {
            this.noticeT = 0.0001;
            this.justNoticed = true; // crying cuts out
          }
          this.noticeT += dt;
          if (this.suspicion >= 1 && this.noticeT > 1.15) {
            this.justScreamed = true;
            this.state = "hunt";
          } else if (this.suspicion < 0.15) {
            this.noticeT = 0;
            this.state = "patrol";
          }
          break;
        }
        if (this.suspicion >= 1) this.state = "hunt";
        else if (this.suspicion < 0.15) this.state = "patrol";
        break;

      case "hunt": {
        const dx = theo.position.x - this.root.position.x;
        this.faceToward(theo.position.x);
        // Getting up on the furniture is not an escape from something that
        // can follow you up the wall. It hauls itself to your height.
        if (CAN_CLIMB.has(this.sense) && theo.position.y > 1.2) {
          this.climbTarget = Math.min(1, theo.position.y / 6);
        } else {
          this.climbTarget = 0;
        }
        this.vx = THREE.MathUtils.damp(
          this.vx, Math.sign(dx) * s.huntSpeed * depthScale(floor.floor), 5, dt
        );
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
          this.searchT = SEARCH_SECONDS;
        }
        break;
      }

      case "search": {
        this.searchT -= dt;

        // The first time it starts searching, it works out which hiding
        // places are near where it lost you — and it intends to check them.
        if (!this.toSearch.length) this.planSearch(floor);

        const next = this.toSearch.find((h) => !h.checked);
        const goal = next ? next.x : this.lastSeenX;
        const dx = goal - this.root.position.x;

        if (this.checkingT > 0) {
          // Standing over a hiding place, looking into it. This is the pause
          // that decides whether a hidden player lives.
          this.checkingT -= dt;
          this.vx = THREE.MathUtils.damp(this.vx, 0, 9, dt);
          this.headSweep += dt * 3.4;
          if (this.checkingT <= 0 && next) {
            next.checked = true;
            this.lastCheck = {
              atX: next.x, theoX: theo.position.x,
              hidden: theo.hidden, dist: Math.abs(theo.position.x - next.x),
            };
            // It looked in the exact place you are. Being still does not help.
            if (theo.hidden && Math.abs(theo.position.x - next.x) < 1.6) {
              // He is hauled out. Without this the hunt is a no-op: a hidden
              // player is invisible to perceive(), so the very next frame it
              // decides it has lost him again and goes back to searching.
              theo.leaveHide();
              this.suspicion = 1;
              this.state = "hunt";
              this.lastSeenX = theo.position.x;
              this.lostGraceT = 2.5;
              this.found = true;
            }
          }
        } else if (Math.abs(dx) > 0.7) {
          this.faceToward(goal);
          this.vx = THREE.MathUtils.damp(this.vx, Math.sign(dx) * SEARCH_SPEED, 5, dt);
        } else if (next) {
          // Arrived at a hiding place — stop and look in it. The deeper the
          // floor, the less time it wastes being sure.
          this.checkingT = searchProfile(floor.floor).dwell;
        } else {
          this.vx = THREE.MathUtils.damp(this.vx, 0, 7, dt);
          this.headSweep += dt * 2.2;
        }

        if (this.suspicion >= 1) this.state = "hunt";
        else if (this.searchT <= 0) {
          this.state = "patrol";
          this.suspicion = 0;
          this.toSearch = [];
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

    this.finishMove(dt, colliders, bounds, theo);
  }


  /**
   * Apply the frame's movement: bounds, collision, climbing, animation.
   *
   * Extracted because the Weeper returns early from update() -- it has no
   * patrol, alert or hunt to run through -- and it still has to collide and
   * animate like everything else.
   */
  private finishMove(
    dt: number,
    colliders: THREE.Box3[],
    bounds: { minX: number; maxX: number },
    theo: Theo
  ) {
    // It will not cross into the rooms it is afraid of
    const lo = Math.max(bounds.minX, this.spec.safeBelow);
    const hi = Math.min(bounds.maxX, this.spec.safeAbove);
    let nextX = THREE.MathUtils.clamp(this.root.position.x + this.vx * dt, lo, hi);

    // It used to integrate straight through furniture, dividers and walls,
    // which is most of why it read as a sprite sliding over the level rather
    // than a body in the room. Only tested while it is on the floor — once it
    // is up a wall it is meant to pass over everything.
    // Only blocks when it would walk INTO something from a clear spot. If it
    // is already overlapping geometry — several wardens spawn inside the bath
    // or under a shelf — it must be free to walk out, or it is frozen for the
    // whole floor. Tested only while on the ground; up a wall it passes over
    // everything, which is the point of climbing.
    const insideAlready = this.climb < 0.2 && this.blockedAt(this.root.position.x, colliders);
    if (this.climb < 0.2 && !insideAlready && this.blockedAt(nextX, colliders)) {
      nextX = this.root.position.x;
      this.stuckT += dt;
      if (this.state === "hunt" || this.state === "search") {
        // It does not stop because a dresser is in the way. It goes over.
        if (CAN_CLIMB.has(this.sense)) {
          this.climbTarget = Math.max(this.climbTarget, 0.45);
        }
      } else if (this.stuckT > 0.35) {
        // Patrolling into something it cannot pass: turn round rather than
        // grind against it forever.
        this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
        this.stuckT = 0;
      }
      this.vx = 0;
    } else {
      this.stuckT = 0;
    }
    this.root.position.x = nextX;
    if (Math.abs(this.vx) > 0.05) this.facing = Math.sign(this.vx);

    // Leaving the floor. It goes up the wall backwards, and it does not
    // hurry — the slowness is most of the horror.
    if (this.state !== "hunt" && this.state !== "seize") this.climbTarget = 0;
    this.climb = THREE.MathUtils.damp(this.climb, this.climbTarget, 1.6, dt);
    this.root.position.y = this.climb * 5.4;
    // Tips over as it goes, so on the ceiling it is fully inverted
    this.root.rotation.z = this.climb * Math.PI * 0.92 * -this.facing;
    // Pressed against the back wall while off the floor
    this.root.position.z = -1.4 - this.climb * 1.6;

    this.animate(dt, theo);
  }

  /**
   * Work out where somebody could be hiding near the spot it lost you, and
   * queue those places up nearest-first. This is the difference between a
   * thing that walks a route and a thing that is looking for you.
   */
  private planSearch(floor: FloorBuild) {
    const prof = searchProfile(floor.floor);
    // On seven this yields nothing, so it mills around where it lost you and
    // never opens anything. That is the floor teaching you that hiding works.
    if (prof.places === 0) {
      this.toSearch = [];
      return;
    }
    this.toSearch = floor.interactables
      .filter((i) => i.type === "hide")
      .map((i) => {
        const c = new THREE.Vector3();
        i.trigger.getCenter(c);
        return { x: c.x, checked: false };
      })
      .filter((h) => Math.abs(h.x - this.lastSeenX) < prof.radius)
      .sort(
        (a, b) =>
          Math.abs(a.x - this.lastSeenX) - Math.abs(b.x - this.lastSeenX)
      )
      .slice(0, prof.places);
  }

  /**
   * Can it stand here, or is there furniture in the way?
   *
   * Deliberately a narrow box around its shins rather than its whole body: the
   * dividers between rooms have a child-height doorway punched in them, and
   * testing the full height would wall the warden into a single room for the
   * entire floor.
   */
  private blockedAt(x: number, colliders: THREE.Box3[]): boolean {
    this.probe.min.set(x - 0.4, 0.3, -0.85);
    this.probe.max.set(x + 0.4, 1.25, 0.85);
    for (const b of colliders) {
      if (b.intersectsBox(this.probe)) return true;
    }
    return false;
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

    // ── Idle life ──
    // Something that only ever walks its route reads as a machine. Between
    // waypoints each of them does the thing its own sense would make it do.
    this.idleTic += dt;
    const idling = this.state === "patrol" && Math.abs(this.vx) < 0.2;
    if (idling) {
      const tic = Math.sin(this.idleTic * 0.7);
      switch (this.sense) {
        case "sound":
          // Cocks its head hard over, holding it there, listening
          this.head.rotation.z = THREE.MathUtils.damp(this.head.rotation.z, tic > 0.6 ? 0.5 : 0, 3, dt);
          break;
        case "smell":
          // Casts about low, nose down, working the air
          this.neck.rotation.x = THREE.MathUtils.damp(this.neck.rotation.x, 0.45 + tic * 0.25, 3, dt);
          break;
        case "vibration":
          // Puts a hand flat on the boards to feel through them
          this.armL.rotation.x = THREE.MathUtils.damp(this.armL.rotation.x, tic > 0.3 ? -1.5 : -0.2, 2.5, dt);
          break;
        case "sight":
          // Slow, deliberate scanning — and every so often, dead still
          this.neck.rotation.x = THREE.MathUtils.damp(this.neck.rotation.x, tic > 0.8 ? -0.3 : 0, 2, dt);
          break;
        default:
          break;
      }
    } else {
      this.head.rotation.z = THREE.MathUtils.damp(this.head.rotation.z, 0, 4, dt);
      this.neck.rotation.x = THREE.MathUtils.damp(this.neck.rotation.x, 0, 4, dt);
    }

    const hunting = this.state === "hunt" || this.state === "seize";
    this.torso.rotation.x = THREE.MathUtils.damp(
      this.torso.rotation.x,
      hunting ? 0.28 : 0.06 + Math.sin(this.phase * 0.5) * 0.02,
      4,
      dt
    );
    // The fingers spread when it means to take you
    for (const claws of this.clawSets) {
      claws.rotation.x = THREE.MathUtils.damp(
        claws.rotation.x, hunting ? -0.55 : 0.1, 5, dt
      );
      claws.scale.setScalar(THREE.MathUtils.damp(claws.scale.x, hunting ? 1.25 : 1, 5, dt));
    }
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
