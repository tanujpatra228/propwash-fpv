import { PerspectiveCamera, Quaternion, Vector3, MathUtils } from 'three';
import { CAMERA } from '../config';
import { damp } from '../core/math';
import { groundY } from '../world/terrain';

export type CameraMode = 'goggles' | 'chase';

/** What the camera follows. Read-only. */
export interface CameraTarget {
  position: Vector3;
  yawRad: number;
  quaternion: Quaternion;
}

const wanted = new Vector3();
const lookAt = new Vector3();
const offset = new Vector3();
const uptilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), MathUtils.degToRad(CAMERA.goggles.uptiltDeg));

/** Owns the one scene camera: goggles (fixed to the drone, tilted up) or chase (smoothed, behind it). */
export class CameraRig {
  readonly camera = new PerspectiveCamera(CAMERA.goggles.fovDeg, 1, CAMERA.goggles.nearM, CAMERA.farM);
  private mode: CameraMode = 'goggles';
  private hasPlacedCamera = false;

  get currentMode(): CameraMode {
    return this.mode;
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    const lens = mode === 'goggles' ? CAMERA.goggles : CAMERA.chase;
    this.camera.fov = lens.fovDeg;
    this.camera.near = lens.nearM;
    this.camera.updateProjectionMatrix();
    this.hasPlacedCamera = false;
  }

  toggleMode(): CameraMode {
    this.setMode(this.mode === 'goggles' ? 'chase' : 'goggles');
    return this.mode;
  }

  setAspect(aspect: number): void {
    if (this.camera.aspect === aspect) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Jump straight to the follow position next update (after a respawn). */
  snap(): void {
    this.hasPlacedCamera = false;
  }

  update(dtS: number, target: CameraTarget): void {
    if (this.mode === 'goggles') this.updateGoggles(target);
    else this.updateChase(dtS, target);
  }

  private updateGoggles(target: CameraTarget): void {
    offset.set(0, CAMERA.goggles.upM, -CAMERA.goggles.forwardM).applyQuaternion(target.quaternion);
    this.camera.position.copy(target.position).add(offset);
    this.camera.quaternion.copy(target.quaternion).multiply(uptilt);
  }

  private updateChase(dtS: number, target: CameraTarget): void {
    const { distanceM, heightM, lookAheadM, smoothingPerS, minAboveGroundM } = CAMERA.chase;
    const forwardX = -Math.sin(target.yawRad);
    const forwardZ = -Math.cos(target.yawRad);
    wanted.set(
      target.position.x - forwardX * distanceM,
      target.position.y + heightM,
      target.position.z - forwardZ * distanceM,
    );
    if (this.hasPlacedCamera) {
      const position = this.camera.position;
      position.set(
        damp(position.x, wanted.x, smoothingPerS, dtS),
        damp(position.y, wanted.y, smoothingPerS, dtS),
        damp(position.z, wanted.z, smoothingPerS, dtS),
      );
    } else {
      this.camera.position.copy(wanted);
      this.hasPlacedCamera = true;
    }
    const minY = groundY(this.camera.position.x, this.camera.position.z) + minAboveGroundM;
    if (this.camera.position.y < minY) this.camera.position.y = minY;
    lookAt.set(target.position.x + forwardX * lookAheadM, target.position.y, target.position.z + forwardZ * lookAheadM);
    this.camera.lookAt(lookAt);
  }
}
