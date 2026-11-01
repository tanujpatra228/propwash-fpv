import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA } from '../config';
import { damp } from '../core/math';
import { groundY } from '../world/terrain';

export type CameraMode = 'chase';

/** What the camera follows. Read-only. */
export interface CameraTarget {
  position: Vector3;
  yawRad: number;
}

const wanted = new Vector3();
const lookAt = new Vector3();

/** Owns the one scene camera. Goggles and broadcast modes arrive in later milestones. */
export class CameraRig {
  readonly camera = new PerspectiveCamera(CAMERA.chase.fovDeg, 1, CAMERA.nearM, CAMERA.farM);
  mode: CameraMode = 'chase';
  private hasPlacedCamera = false;

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
    lookAt.set(
      target.position.x + forwardX * lookAheadM,
      target.position.y,
      target.position.z + forwardZ * lookAheadM,
    );
    this.camera.lookAt(lookAt);
  }
}
