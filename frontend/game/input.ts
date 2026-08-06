// Keyboard state, polled by the game loop. Edge-triggered keys (interact,
// drop, flashlight) latch until consumed so a tap between frames never drops.

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private target: Window | null = null;

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.down.add(e.code);
    this.pressed.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private onBlur = () => {
    this.down.clear();
  };

  attach(target: Window) {
    this.target = target;
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  detach() {
    if (!this.target) return;
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("blur", this.onBlur);
    this.target = null;
  }

  /** Set while a cutscene owns him — being taken, descending. */
  frozen = false;

  /** -1 left, +1 right, 0 idle */
  get moveX(): number {
    if (this.frozen) return 0;
    const left = this.down.has("KeyA") || this.down.has("ArrowLeft");
    const right = this.down.has("KeyD") || this.down.has("ArrowRight");
    if (left === right) return 0;
    return left ? -1 : 1;
  }

  get run(): boolean {
    return this.down.has("ShiftLeft") || this.down.has("ShiftRight");
  }

  get sneak(): boolean {
    return (
      this.down.has("KeyC") ||
      this.down.has("KeyS") ||
      this.down.has("ArrowDown") ||
      this.down.has("ControlLeft")
    );
  }

  /** True once per physical key press, then consumed. */
  consume(code: string): boolean {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  /** Call at the end of each frame to drop unconsumed edge presses. */
  endFrame() {
    this.pressed.clear();
  }
}
