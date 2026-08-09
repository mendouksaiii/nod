import * as THREE from "three";

// Little Nightmares camera: fixed cinematic distance, lagging follow,
// a drift ahead of the player's facing, and a slow breathing sway so a
// still frame never feels dead.

export class NodCamera {
  camera: THREE.PerspectiveCamera;
  private lookX = 0;
  private lookY = 1.4;
  private swayT = 0;
  private shakeAmt = 0;

  /** Knock the camera. Used when the house notices, and when it takes you. */
  shake(amount: number) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 80);
    this.camera.position.set(-2, 2.4, 9.2);
  }

  update(dt: number, target: THREE.Vector3, facing: number, clampX: [number, number]) {
    this.swayT += dt;

    const aheadX = target.x + facing * 1.35;
    this.lookX = THREE.MathUtils.damp(this.lookX, aheadX, 1.8, dt);
    this.lookY = THREE.MathUtils.damp(this.lookY, target.y + 1.1, 2.4, dt);

    const camX = THREE.MathUtils.clamp(this.lookX, clampX[0], clampX[1]);
    const sway = Math.sin(this.swayT * 0.45) * 0.05;
    const bob = Math.sin(this.swayT * 0.31) * 0.03;

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camX + sway, 2.2, dt);
    this.camera.position.y = THREE.MathUtils.damp(
      this.camera.position.y,
      target.y + 2.1 + bob,
      2.0,
      dt
    );

    if (this.shakeAmt > 0.0005) {
      this.shakeAmt = THREE.MathUtils.damp(this.shakeAmt, 0, 4.5, dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
    }

    this.camera.lookAt(this.lookX, this.lookY, 0);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
