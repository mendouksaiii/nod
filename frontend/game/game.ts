import * as THREE from "three";
import { Input } from "./input";
import { Theo } from "./theo";
import { NodCamera } from "./camera";
import { Entity } from "./entity";
import { FloorBuild, FloorContext, Interactable } from "./build";
import { buildFloor, BOTTOM_FLOOR, FLOOR_TITLES, TOP_FLOOR } from "./floors";

// Orchestrator: scene, loop, lighting, interaction, descent between floors.

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
  private hud!: {
    battery: HTMLDivElement;
    prompt: HTMLDivElement;
    hint: HTMLDivElement;
    vignette: HTMLDivElement;
    blackout: HTMLDivElement;
    card: HTMLDivElement;
  };
  private disposed = false;

  seed = 0;
  floorNumber = TOP_FLOOR;
  private checkpointX = 2.8;
  private deathT = 0;
  private dying = false;
  private transition: "none" | "descending" | "settled" | "escaped" = "none";
  private transT = 0;
  /** One-shot: a descent must swap the floor exactly once, not every frame. */
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
      goTo: (n: number) => this.loadFloor(n),
    };
  }

  constructor(private container: HTMLElement, startFloor = TOP_FLOOR) {
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

    // Locally random until the Inco run seed replaces it (Section 7).
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.theo = new Theo(this.scene);
    this.cam = new NodCamera(container.clientWidth / container.clientHeight);
    this.hud = this.buildHud(container);

    this.floorNumber = startFloor;
    this.loadFloor(startFloor);

    this.input.attach(window);
    window.addEventListener("resize", this.onResize);
    (window as unknown as { NOD: NodGame }).NOD = this;
    this.loop();
  }

  /** Tear down the current floor and raise the next one in its place. */
  private loadFloor(n: number) {
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
    this.floor = buildFloor(this.scene, n, this.seed);
    if (this.floor.entity) this.entity = new Entity(this.scene, this.floor.entity);

    this.hasKey = false;
    this.checkpointX = this.floor.spawnX;
    this.theo.respawn(this.floor.spawnX);
    this.showCard(`floor ${n} — ${FLOOR_TITLES[n]}`);
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
      left: "50%", top: "44%", transform: "translate(-50%,-50%)",
      fontSize: "20px", letterSpacing: "0.18em", opacity: "0",
      transition: "opacity 1.1s", textShadow: "0 2px 16px #000",
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

    return { battery: battery as HTMLDivElement, prompt, hint, vignette, blackout, card };
  }

  private showCard(text: string) {
    this.hud.card.textContent = text;
    this.hud.card.style.opacity = "0.85";
    setTimeout(() => (this.hud.card.style.opacity = "0"), 2600);
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
    return 6; // climb
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
      // The stairwell only offers itself once you are holding its key
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
        // Some levers eat the thing you are carrying (the brass pieces)
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

  /** Q throws whatever he is holding — the decoy verb the lower floors need. */
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

    const busy = this.dying || this.transition !== "none";
    if (busy) {
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

    // Context the floors and senses read
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

    // Safe thresholds — the landing, and the stairwell antechamber
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

  private beginDeath() {
    this.dying = true;
    this.deathT = 0;
    if (this.entity) this.entity.caught = false;
    this.input.frozen = true;
    this.hud.prompt.style.opacity = "0";
  }

  private updateDeath(dt: number) {
    this.deathT += dt;
    if (this.deathT > 0.5) this.hud.blackout.style.opacity = "1";
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

  /** Down the stairs. Section 7 hangs the chain call on this fade. */
  private beginDescent() {
    if (this.floorNumber <= BOTTOM_FLOOR) return;
    this.transition = "descending";
    this.transT = 0;
    this.swapped = false;
    this.input.frozen = true;
  }

  /** He stops. He stays. The house keeps him. */
  private beginSettle() {
    this.transition = "settled";
    this.transT = 0;
    this.input.frozen = true;
  }

  /** The door opens. */
  private beginEscape() {
    this.transition = "escaped";
    this.transT = 0;
    this.input.frozen = true;
  }

  private updateTransition(dt: number) {
    this.transT += dt;
    if (this.transT > 0.3) this.hud.blackout.style.opacity = "1";

    if (this.transition === "descending") {
      if (this.transT > 1.4 && !this.swapped) {
        this.swapped = true;
        this.loadFloor(this.floorNumber - 1);
      }
      if (this.transT > 2.6) {
        this.hud.blackout.style.opacity = "0";
        this.transition = "none";
        this.input.frozen = false;
      }
      return;
    }

    // Both endings hold on black; Section 5 gives them their real screens.
    if (this.transT > 1.2) {
      this.hud.card.textContent =
        this.transition === "settled"
          ? "you stayed"
          : "you woke up";
      this.hud.card.style.opacity = "0.9";
    }
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
