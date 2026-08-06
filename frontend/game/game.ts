import * as THREE from "three";
import { Input } from "./input";
import { Theo } from "./theo";
import { NodCamera } from "./camera";
import { buildRoom, Interactable, RoomBuild } from "./room";
import { Entity } from "./entity";

// Orchestrator: scene, loop, lighting, interaction resolution, HUD DOM.

export class NodGame {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam: NodCamera;
  private input = new Input();
  private theo: Theo;
  private room: RoomBuild;
  private entity!: Entity;
  private clock = new THREE.Clock();
  /** Where a caught run restarts — the last safe threshold he crossed. */
  private checkpointX = 2.8;
  private deathT = 0;
  private dying = false;
  private raf = 0;
  private hud: {
    battery: HTMLDivElement;
    prompt: HTMLDivElement;
    hint: HTMLDivElement;
    vignette: HTMLDivElement;
    blackout: HTMLDivElement;
  };
  private disposed = false;
  seed = 0;

  /** Debug access (window.NOD.debug) — never used by game logic. */
  get debug() {
    return {
      theo: this.theo,
      room: this.room,
      camera: this.cam,
      entity: this.entity,
      scene: this.scene,
      THREE,
    };
  }

  constructor(private container: HTMLElement) {
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

    // Base light: dim cold ambience — dark but always readable
    this.scene.add(new THREE.HemisphereLight(0x39455e, 0x141821, 1.1));

    // Room lighting lives with the room itself (one source per space).
    // Seed: locally random until the Inco run seed replaces it (Section 7).
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.room = buildRoom(this.scene, this.seed);
    this.theo = new Theo(this.scene);
    this.theo.position.set(this.room.spawnX, 0, 0);
    this.checkpointX = this.room.spawnX;

    // It walks the cot room through the wardrobe room. The landing and the
    // stair antechamber are the two places on this floor it will not go.
    this.entity = new Entity(this.scene, {
      waypoints: [17, 30, 45, 56, 70],
      dwellSeconds: 2.4,
      startIndex: 2,
    });
    this.cam = new NodCamera(container.clientWidth / container.clientHeight);

    this.hud = this.buildHud(container);
    this.input.attach(window);
    window.addEventListener("resize", this.onResize);

    // Debug handle for the console: window.NOD
    (window as unknown as { NOD: NodGame }).NOD = this;

    this.loop();
  }

  private buildHud(container: HTMLElement) {
    const mk = (style: Partial<CSSStyleDeclaration>) => {
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute",
        color: "#9aa2b5",
        fontFamily: "Georgia, serif",
        pointerEvents: "none",
        transition: "opacity 0.6s",
        ...style,
      } as CSSStyleDeclaration);
      container.appendChild(el);
      return el;
    };

    const batteryWrap = mk({
      left: "24px",
      bottom: "20px",
      width: "92px",
      height: "5px",
      background: "rgba(154,162,181,0.15)",
      borderRadius: "2px",
    });
    const battery = document.createElement("div");
    Object.assign(battery.style, {
      height: "100%",
      width: "100%",
      background: "rgba(200,214,190,0.5)",
      borderRadius: "2px",
      transition: "width 0.3s",
    });
    batteryWrap.appendChild(battery);

    const prompt = mk({
      left: "50%",
      bottom: "48px",
      transform: "translateX(-50%)",
      fontSize: "15px",
      fontStyle: "italic",
      opacity: "0",
      textShadow: "0 1px 8px #000",
    });

    // Suspicion vignette: the room darkens at its edges as it notices you.
    // No meter, no icon — the screen itself is the tell.
    const vignette = mk({
      inset: "0",
      background:
        "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 38%, rgba(24,6,8,0.92) 100%)",
      opacity: "0",
      transition: "opacity 0.25s",
    });

    // Full-black wipe for being taken
    const blackout = mk({
      inset: "0",
      background: "#000",
      opacity: "0",
      transition: "opacity 0.35s",
    });

    const hint = mk({
      left: "50%",
      top: "22px",
      transform: "translateX(-50%)",
      fontSize: "12.5px",
      letterSpacing: "0.08em",
      opacity: "0.55",
      textShadow: "0 1px 8px #000",
    });
    hint.textContent =
      "A / D  move      Shift  run      C  sneak      E  interact      Q  drop      F  flashlight";
    setTimeout(() => (hint.style.opacity = "0"), 9000);

    return { battery: battery as HTMLDivElement, prompt, hint, vignette, blackout };
  }

  /** The nearest interactable whose trigger contains Theo, honoring priority. */
  private findInteractable(): Interactable | null {
    const p = this.theo.position;
    const probe = new THREE.Vector3(p.x, p.y + 0.5, p.z);
    const priority: Record<string, number> = { hide: 0, climb: 1, battery: 2, carry: 3 };
    let best: Interactable | null = null;
    for (const it of this.room.interactables) {
      if (it.consumed) continue;
      if (it === this.theo.carried) continue;
      if (!it.trigger.containsPoint(probe)) continue;
      if (!best || priority[it.type] < priority[best.type]) best = it;
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
          it.climbXMin! + 0.25,
          it.climbXMax! - 0.25
        );
        this.theo.startMantle(new THREE.Vector3(x, it.climbTopY!, it.climbZ ?? 0));
        break;
      }
      case "carry":
        this.theo.pickUp(it);
        break;
      case "battery":
        this.theo.battery = 100;
        it.consumed = true;
        it.mesh?.parent?.remove(it.mesh);
        break;
    }
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    // Interaction (ignored while a cutscene owns him)
    if (this.input.frozen) {
      this.input.endFrame();
    } else if (this.input.consume("KeyE")) {
      if (this.theo.hidden) {
        this.theo.leaveHide();
      } else {
        const it = this.findInteractable();
        if (it) this.interact(it);
      }
    }
    if (this.input.consume("KeyQ")) this.theo.drop();
    if (this.input.consume("KeyF")) this.theo.toggleFlashlight();

    this.theo.update(dt, this.input, this.room.colliders, this.room.bounds);
    this.entity.update(dt, this.theo, this.room.colliders, this.room.bounds);
    this.cam.update(dt, this.theo.position, this.theo.facing, this.room.camClamp);

    // Safe thresholds: the landing he woke in, and the stairwell antechamber
    if (!this.dying) {
      if (this.theo.position.x < 11 && this.checkpointX < 11) this.checkpointX = this.room.spawnX;
      else if (this.theo.position.x > 77) this.checkpointX = 78.5;
    }

    if (this.entity.caught && !this.dying) this.beginDeath();
    if (this.dying) this.updateDeath(dt);

    // HUD
    this.hud.battery.style.width = `${this.theo.battery}%`;
    this.hud.vignette.style.opacity = `${Math.min(1, this.entity.suspicion * 0.95)}`;
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

    this.input.endFrame();
    this.renderer.render(this.scene, this.cam.camera);
  };

  /** It has him. Hold on the moment, wipe to black, put him back. */
  private beginDeath() {
    this.dying = true;
    this.deathT = 0;
    this.entity.caught = false;
    this.input.frozen = true;
    this.hud.prompt.style.opacity = "0";
  }

  private updateDeath(dt: number) {
    this.deathT += dt;
    if (this.deathT > 0.5) {
      this.hud.blackout.style.opacity = "1";
    }
    if (this.deathT > 1.5 && this.theo.position.x !== this.checkpointX) {
      // Respawn at the last threshold; the house resets around him
      this.theo.respawn(this.checkpointX);
      this.entity.reset(this.checkpointX < 40 ? 3 : 0);
    }
    if (this.deathT > 2.4) {
      this.hud.blackout.style.opacity = "0";
      this.hud.vignette.style.opacity = "0";
      this.dying = false;
      this.input.frozen = false;
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
