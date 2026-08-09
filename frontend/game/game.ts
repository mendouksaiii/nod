import * as THREE from "three";
import { Input } from "./input";
import { Theo } from "./theo";
import { NodCamera } from "./camera";
import { Entity } from "./entity";
import { FloorBuild, FloorContext, Interactable, writing } from "./build";
import { buildFloor, BOTTOM_FLOOR, FLOOR_TITLES, TOP_FLOOR } from "./floors";

/**
 * What the game needs from the house on Base. Kept as an interface so the
 * game itself never imports viem — and so it still runs with no wallet at
 * all, which is how the floors get built and tuned.
 */
export interface HouseBridge {
  floorSeed(floor: number): Promise<bigint | null>;
  enterHouse(): Promise<void>;
  descend(from: number): Promise<void>;
  fallToNod(phraseIndex: number, settled: boolean): Promise<void>;
  reachTheDoor(): Promise<string>;
  marksOn(floor: number): Promise<{ child: string; at: number; phrase: number | null }[]>;
  phrases(): Promise<string[]>;
}

/** The warning a child is most likely to have left on each floor. */
const FLOOR_PHRASE: Record<number, number> = {
  7: 1, // it sees you move
  6: 4, // she hears you cry
  5: 5, // it follows where you have been
  4: 6, // stand still
  3: 2, // do not run
  2: 3, // cover the mirrors
  1: 7, // i could not do it
};

export class NodGame {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam: NodCamera;
  private input = new Input();
  private theo: Theo;
  private floor!: FloorBuild;
  private entity: Entity | null = null;
  private clock = new THREE.Clock();
  private raf = 0;
  private hud!: ReturnType<NodGame["buildHud"]>;
  private disposed = false;

  seed = 0;
  floorNumber = TOP_FLOOR;
  private bridge: HouseBridge | null = null;
  private phraseList: string[] = [];
  private busyWithChain = false;

  private checkpointX = 2.8;
  private deathT = 0;
  private dying = false;
  /** On-chain, being kept ends the run — you wake again as a new child. */
  private runOver = false;
  private transition: "none" | "descending" | "settled" | "escaped" = "none";
  private transT = 0;
  private swapped = false;
  private hasKey = false;
  private decoy: { x: number; strength: number } | null = null;
  private decoyT = 0;
  private ctx: FloorContext = {
    theoX: 0, theoY: 0, theoZ: 0, theoTier: "still",
    theoHidden: false, flashOn: false, decoy: null,
  };

  get debug() {
    return {
      theo: this.theo, floor: this.floor, camera: this.cam,
      entity: this.entity, scene: this.scene, THREE,
      descend: () => this.beginDescent(),
      goTo: (n: number) => { void this.loadFloor(n); },
    };
  }

  constructor(private container: HTMLElement, bridge: HouseBridge | null = null) {
    this.bridge = bridge;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x07090d);
    this.scene.fog = new THREE.Fog(0x07090d, 14, 46);
    this.scene.add(new THREE.HemisphereLight(0x39455e, 0x141821, 1.1));

    // Offline fallback. With a wallet this is replaced per floor by the
    // encrypted seed the house minted for this run.
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.theo = new Theo(this.scene);
    this.cam = new NodCamera(container.clientWidth / container.clientHeight);
    this.hud = this.buildHud(container);

    void this.boot();

    this.input.attach(window);
    window.addEventListener("resize", this.onResize);
    (window as unknown as { NOD: NodGame }).NOD = this;
    this.loop();
  }

  private async boot() {
    if (this.bridge) {
      try {
        this.phraseList = await this.bridge.phrases();
      } catch {
        /* the walls will just be quiet */
      }
    }
    await this.loadFloor(TOP_FLOOR);
  }

  /** Tear down the current floor and raise the next one in its place. */
  private async loadFloor(n: number) {
    if (this.floor) {
      this.scene.remove(this.floor.group);
      this.floor.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    }
    this.entity?.dispose(this.scene);
    this.entity = null;
    this.floorNumber = n;

    // The house decides how this floor is laid out — and only tells you
    // about floors you have actually reached.
    let seed = this.seed;
    if (this.bridge) {
      try {
        const s = await this.bridge.floorSeed(n);
        if (s !== null) seed = Number(s % 0xffffffffn);
      } catch {
        /* fall back to the local seed rather than stranding the player */
      }
    }

    this.floor = buildFloor(this.scene, n, seed);
    if (this.floor.entity) this.entity = new Entity(this.scene, this.floor.entity);

    this.hasKey = false;
    this.checkpointX = this.floor.spawnX;
    this.theo.respawn(this.floor.spawnX);
    this.showCard(`floor ${n} — ${FLOOR_TITLES[n]}`);

    if (this.bridge) void this.renderMarks(n);
  }

  /**
   * The House Remembers. Every mark here was left by a real player the house
   * kept on this floor — and the epitaph only decrypts because we are
   * standing on it.
   */
  private async renderMarks(n: number) {
    if (!this.bridge) return;
    let marks: Awaited<ReturnType<HouseBridge["marksOn"]>>;
    try {
      marks = await this.bridge.marksOn(n);
    } catch {
      return;
    }
    if (this.floorNumber !== n || !marks.length) return;

    const group = this.floor.group;
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3c, roughness: 1 });
    let shown = 0;
    marks.forEach((m, i) => {
      // A pair of small shoes against the skirting, one pair per child
      const x = this.floor.spawnX + 6 + i * 1.1;
      for (const dz of [-0.16, 0.16]) {
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.42), shoeMat);
        shoe.position.set(x, 0.065, -3.9 + dz);
        shoe.castShadow = true;
        group.add(shoe);
      }
      // What they left, if the house will let us read it
      if (m.phrase !== null && this.phraseList[m.phrase] && shown < 3) {
        writing(group, this.phraseList[m.phrase], x + 2.5, 2.4 + shown * 1.5, 4.2, "#8b93a8");
        shown++;
      }
    });
    this.showCard(
      marks.length === 1
        ? "one child stopped here"
        : `${marks.length} children stopped here`
    );
  }

  private buildHud(container: HTMLElement) {
    const mk = (style: Partial<CSSStyleDeclaration>) => {
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute", color: "#9aa2b5", fontFamily: "Georgia, serif",
        pointerEvents: "none", transition: "opacity 0.6s", ...style,
      } as CSSStyleDeclaration);
      container.appendChild(el);
      return el;
    };

    const batteryWrap = mk({
      left: "24px", bottom: "20px", width: "92px", height: "5px",
      background: "rgba(154,162,181,0.15)", borderRadius: "2px",
    });
    const battery = document.createElement("div");
    Object.assign(battery.style, {
      height: "100%", width: "100%", background: "rgba(200,214,190,0.5)",
      borderRadius: "2px", transition: "width 0.3s",
    });
    batteryWrap.appendChild(battery);

    const vignette = mk({
      inset: "0",
      background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 38%, rgba(24,6,8,0.92) 100%)",
      opacity: "0", transition: "opacity 0.25s",
    });
    const blackout = mk({ inset: "0", background: "#000", opacity: "0", transition: "opacity 0.35s" });

    const card = mk({
      left: "50%", top: "42%", transform: "translate(-50%,-50%)",
      fontSize: "20px", letterSpacing: "0.18em", opacity: "0",
      transition: "opacity 1.1s", textShadow: "0 2px 16px #000",
      textAlign: "center", width: "80%",
    });
    const sub = mk({
      left: "50%", top: "53%", transform: "translate(-50%,-50%)",
      fontSize: "14px", fontStyle: "italic", opacity: "0",
      transition: "opacity 1.1s", textShadow: "0 2px 16px #000",
      textAlign: "center", width: "70%", lineHeight: "1.7",
    });

    const prompt = mk({
      left: "50%", bottom: "48px", transform: "translateX(-50%)",
      fontSize: "15px", fontStyle: "italic", opacity: "0", textShadow: "0 1px 8px #000",
    });

    const hint = mk({
      left: "50%", top: "22px", transform: "translateX(-50%)",
      fontSize: "12.5px", letterSpacing: "0.08em", opacity: "0.55",
      textShadow: "0 1px 8px #000",
    });
    hint.textContent =
      "A / D  move      Shift  run      C  sneak      E  interact      Q  throw      F  flashlight";
    setTimeout(() => (hint.style.opacity = "0"), 9000);

    return { battery: battery as HTMLDivElement, prompt, hint, vignette, blackout, card, sub };
  }

  private showCard(text: string, subtext = "", hold = 2600) {
    this.hud.card.textContent = text;
    this.hud.card.style.opacity = "0.85";
    this.hud.sub.textContent = subtext;
    this.hud.sub.style.opacity = subtext ? "0.7" : "0";
    if (hold > 0) {
      setTimeout(() => {
        this.hud.card.style.opacity = "0";
        this.hud.sub.style.opacity = "0";
      }, hold);
    }
  }

  /**
   * Climb and hide triggers are deliberately large, so they will overlap the
   * small things lying inside them. Discrete objects therefore outrank
   * ambient ones — otherwise a key that lands near a climbable ledge can
   * never be picked up. Ties break on whichever trigger he is nearest to.
   */
  private rank(it: Interactable): number {
    if (it.type === "door") return 0;
    if (it.isKey) return 1;
    if (it.type === "hide") return 2;
    if (it.type === "lever" || it.type === "cover") return 3;
    if (it.type === "carry") return 4;
    if (it.type === "battery") return 5;
    return 6;
  }

  private findInteractable(): Interactable | null {
    const p = this.theo.position;
    const probe = new THREE.Vector3(p.x, p.y + 0.5, p.z);
    const centre = new THREE.Vector3();
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.floor.interactables) {
      if (it.consumed) continue;
      if (it === this.theo.carried) continue;
      if (it.type === "door" && it.tag !== "settle" && it.tag !== "exit" && !this.hasKey) continue;
      if (!it.trigger.containsPoint(probe)) continue;
      it.trigger.getCenter(centre);
      const score = this.rank(it) * 1000 + probe.distanceTo(centre);
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  private interact(it: Interactable) {
    switch (it.type) {
      case "hide":
        this.theo.startHide(it);
        break;
      case "climb": {
        const x = THREE.MathUtils.clamp(
          this.theo.position.x + this.theo.facing * 0.9,
          it.climbXMin! + 0.25, it.climbXMax! - 0.25
        );
        this.theo.startMantle(new THREE.Vector3(x, it.climbTopY!, it.climbZ ?? 0));
        break;
      }
      case "carry":
        this.theo.pickUp(it);
        if (it.isKey) this.hasKey = true;
        break;
      case "battery":
        this.theo.battery = 100;
        it.consumed = true;
        it.mesh?.parent?.remove(it.mesh);
        break;
      case "lever":
      case "cover":
        if (it.tag === "cradle" || it.tag === "sheet") {
          const held = this.theo.carried;
          if (held?.mesh) held.mesh.parent?.remove(held.mesh);
          if (held) held.consumed = true;
          this.theo.carried = null;
        }
        it.onUse?.(this.floor);
        if (it.type === "cover") {
          it.consumed = true;
          it.mesh?.parent?.remove(it.mesh);
        }
        break;
      case "door":
        if (it.tag === "settle") this.beginSettle();
        else if (it.tag === "exit") this.beginEscape();
        else this.beginDescent();
        break;
    }
  }

  private throwCarried() {
    const held = this.theo.carried;
    if (!held) return;
    const dir = this.theo.facing;
    const landX = THREE.MathUtils.clamp(
      this.theo.position.x + dir * 7.5,
      this.floor.bounds.minX, this.floor.bounds.maxX
    );
    this.theo.drop();
    if (held.mesh) {
      held.mesh.position.x = landX;
      const t = held.trigger;
      const size = new THREE.Vector3();
      t.getSize(size);
      t.setFromCenterAndSize(new THREE.Vector3(landX, size.y / 2, held.mesh.position.z), size);
    }
    if (held.isKey) this.hasKey = false;
    if (held.tag === "throwable") {
      this.decoy = { x: landX, strength: 1 };
      this.decoyT = 0.9;
    }
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.floor) {
      this.renderer.render(this.scene, this.cam.camera);
      return;
    }

    const busy = this.dying || this.transition !== "none";
    if (busy) {
      // Waking again after the house kept you
      if (this.runOver && !this.busyWithChain && this.input.consume("KeyE")) {
        void this.wakeAgain();
      }
      this.input.endFrame();
    } else {
      if (this.input.consume("KeyE")) {
        if (this.theo.hidden) this.theo.leaveHide();
        else {
          const it = this.findInteractable();
          if (it) this.interact(it);
        }
      }
      if (this.input.consume("KeyQ")) this.throwCarried();
      if (this.input.consume("KeyF")) this.theo.toggleFlashlight();
    }

    this.theo.update(dt, this.input, this.floor.colliders, this.floor.bounds);

    if (this.decoyT > 0) this.decoyT -= dt;
    else this.decoy = null;
    this.ctx.theoX = this.theo.position.x;
    this.ctx.theoY = this.theo.position.y;
    this.ctx.theoZ = this.theo.position.z;
    this.ctx.theoTier = this.theo.speedTier;
    this.ctx.theoHidden = this.theo.hidden;
    this.ctx.flashOn = this.theo.flashOn;
    this.ctx.decoy = this.decoy;

    this.floor.update?.call(this.floor, dt, this.ctx);
    this.entity?.update(dt, this.theo, this.floor.colliders, this.floor.bounds, this.floor, this.ctx);
    this.cam.update(dt, this.theo.position, this.theo.facing, this.floor.camClamp);

    if (!busy) {
      const e = this.floor.entity;
      if (e) {
        if (this.theo.position.x < e.safeBelow) this.checkpointX = this.floor.spawnX;
        else if (this.theo.position.x > e.safeAbove) this.checkpointX = e.safeAbove + 2;
      }
    }

    if (this.entity?.caught && !this.dying) this.beginDeath();
    if (this.dying) this.updateDeath(dt);
    if (this.transition !== "none") this.updateTransition(dt);

    this.hud.battery.style.width = `${this.theo.battery}%`;
    this.hud.vignette.style.opacity = `${Math.min(1, (this.entity?.suspicion ?? 0) * 0.95)}`;

    if (busy) {
      this.hud.prompt.style.opacity = "0";
    } else {
      const it = this.theo.hidden ? null : this.findInteractable();
      if (this.theo.hidden) {
        this.hud.prompt.textContent = "E — come out";
        this.hud.prompt.style.opacity = "0.8";
      } else if (it) {
        this.hud.prompt.textContent = `E — ${it.label}`;
        this.hud.prompt.style.opacity = "0.8";
      } else {
        this.hud.prompt.style.opacity = "0";
      }
    }

    this.input.endFrame();
    this.renderer.render(this.scene, this.cam.camera);
  };

  // ── The house takes you ─────────────────────────────────────────────

  private beginDeath() {
    this.dying = true;
    this.deathT = 0;
    if (this.entity) this.entity.caught = false;
    this.input.frozen = true;
    this.hud.prompt.style.opacity = "0";

    // Without a wallet this is just a retry. With one, the house keeps the
    // child you were, and the next player will walk past your shoes.
    if (this.bridge && !this.busyWithChain) {
      this.runOver = true;
      this.busyWithChain = true;
      const phrase = FLOOR_PHRASE[this.floorNumber] ?? 0;
      this.bridge
        .fallToNod(phrase, false)
        .catch(() => { /* keep the game playable if the write fails */ })
        .finally(() => { this.busyWithChain = false; });
    }
  }

  private updateDeath(dt: number) {
    this.deathT += dt;
    if (this.deathT > 0.5) this.hud.blackout.style.opacity = "1";

    if (this.runOver) {
      if (this.deathT > 1.2) {
        this.showCard(
          "the house kept you",
          this.busyWithChain
            ? "it is writing your name on the wall…"
            : "another child will find your shoes here.\n\nE — wake again",
          0
        );
      }
      return;
    }

    if (this.deathT > 1.5 && this.theo.position.x !== this.checkpointX) {
      this.theo.respawn(this.checkpointX);
      const e = this.floor.entity;
      this.entity?.reset(this.checkpointX < (e?.safeAbove ?? 99) / 2 ? 3 : 0);
    }
    if (this.deathT > 2.4) {
      this.hud.blackout.style.opacity = "0";
      this.hud.vignette.style.opacity = "0";
      this.dying = false;
      this.input.frozen = false;
    }
  }

  /** A new child wakes on the seventh floor. New seeds, new house. */
  private async wakeAgain() {
    if (!this.bridge) return;
    this.busyWithChain = true;
    this.showCard("waking", "the house learns your name…", 0);
    try {
      await this.bridge.enterHouse();
      await this.loadFloor(TOP_FLOOR);
      this.runOver = false;
      this.dying = false;
      this.transition = "none";
      this.hud.blackout.style.opacity = "0";
      this.hud.vignette.style.opacity = "0";
      this.input.frozen = false;
    } catch {
      this.showCard("the house would not take you", "E — try again", 0);
    } finally {
      this.busyWithChain = false;
    }
  }

  // ── Down, and out ───────────────────────────────────────────────────

  private beginDescent() {
    if (this.floorNumber <= BOTTOM_FLOOR) return;
    this.transition = "descending";
    this.transT = 0;
    this.swapped = false;
    this.input.frozen = true;
  }

  private beginSettle() {
    this.transition = "settled";
    this.transT = 0;
    this.input.frozen = true;
    if (this.bridge && !this.busyWithChain) {
      this.busyWithChain = true;
      this.bridge
        .fallToNod(FLOOR_PHRASE[1] ?? 7, true)
        .catch(() => {})
        .finally(() => { this.busyWithChain = false; });
    }
  }

  private beginEscape() {
    this.transition = "escaped";
    this.transT = 0;
    this.input.frozen = true;
    if (this.bridge && !this.busyWithChain) {
      this.busyWithChain = true;
      this.bridge
        .reachTheDoor()
        .then((text) => this.showCard("you woke up", text, 0))
        .catch(() => this.showCard("you woke up", "", 0))
        .finally(() => { this.busyWithChain = false; });
    }
  }

  private updateTransition(dt: number) {
    this.transT += dt;
    if (this.transT > 0.3) this.hud.blackout.style.opacity = "1";

    if (this.transition === "descending") {
      if (this.transT > 1.0 && !this.swapped) {
        this.swapped = true;
        void this.doDescend();
      }
      // Hold on black until the house has actually minted the floor below
      if (this.transT > 2.2 && !this.busyWithChain) {
        this.hud.blackout.style.opacity = "0";
        this.transition = "none";
        this.input.frozen = false;
      }
      return;
    }

    if (this.transT > 1.2 && this.transition === "settled") {
      this.showCard("you stayed", "the stairs are still there.\n\nE — wake again", 0);
      this.runOver = true;
    }
    if (this.transT > 1.2 && this.transition === "escaped" && !this.bridge) {
      this.showCard("you woke up", "", 0);
    }
  }

  private async doDescend() {
    const from = this.floorNumber;
    if (this.bridge) {
      this.busyWithChain = true;
      try {
        await this.bridge.descend(from);
      } catch {
        /* let them through rather than trapping them on a fade */
      }
    }
    await this.loadFloor(from - 1);
    this.busyWithChain = false;
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.cam.resize(w / h);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
    this.container.innerHTML = "";
  }
}
