import { PerspectiveCamera, Quaternion, Vector3, MathUtils } from 'three';
import { CAMERA, type CameraId } from '../config';
import { damp } from '../core/math';
import { groundY } from '../world/terrain';

export type CameraMode = CameraId;

/** The pilot's camera cycle (the broadcast camera is only for the menu). */
const PILOT_CYCLE: readonly CameraMode[] = ['goggles', 'chase', 'seat'];

/** What the camera follows. Read-only. */
export interface CameraTarget {
  position: Vector3;
  yawRad: number;
  quaternion: Quaternion;
}

const wanted = new Vector3();
const lookAt = new Vector3();
const offset = new Vector3();
const X_AXIS = new Vector3(1, 0, 0);

/** Owns the one scene camera: goggles (fixed to the drone, tilted up), or a smoothed, level follow camera behind it (chase, or seat, which is close). */
export class CameraRig {
  readonly camera = new PerspectiveCamera(CAMERA.goggles.fovDeg, 1, CAMERA.goggles.nearM, CAMERA.farM);
  private mode: CameraMode = 'goggles';
  private hasPlacedCamera = false;
  private gogglesFovDeg: number = CAMERA.goggles.fovDeg;
  private readonly uptilt = new Quaternion().setFromAxisAngle(X_AXIS, MathUtils.degToRad(CAMERA.goggles.uptiltDeg));
  private readonly broadcastPosition = new Vector3();
  private readonly broadcastLookAt = new Vector3();
  private modeBeforeBroadcast: CameraMode = 'goggles';

  get currentMode(): CameraMode {
    return this.mode;
  }

  /** Pilot settings: the goggles view's field of view and upward tilt. Applies at once if the goggles are in use. */
  setGogglesView(fovDeg: number, uptiltDeg: number): void {
    this.gogglesFovDeg = fovDeg;
    this.uptilt.setFromAxisAngle(X_AXIS, MathUtils.degToRad(uptiltDeg));
    if (this.mode === 'goggles' && this.camera.fov !== fovDeg) {
      this.camera.fov = fovDeg;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Switches to the menu's TV-style camera and remembers the pilot's camera to come back to. */
  enterBroadcast(): void {
    if (this.mode !== 'broadcast') this.modeBeforeBroadcast = this.mode;
    this.setMode('broadcast');
  }

  leaveBroadcast(): void {
    if (this.mode === 'broadcast') this.setMode(this.modeBeforeBroadcast);
  }

  /** Place the broadcast camera (hard cuts, no smoothing). */
  setBroadcastShot(position: Vector3, lookAt: Vector3): void {
    this.broadcastPosition.copy(position);
    this.broadcastLookAt.copy(lookAt);
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    const lens = mode === 'goggles' ? CAMERA.goggles : mode === 'seat' ? CAMERA.seat : CAMERA.chase;
    this.camera.fov = mode === 'goggles' ? this.gogglesFovDeg : lens.fovDeg;
    this.camera.near = lens.nearM;
    this.camera.updateProjectionMatrix();
    this.hasPlacedCamera = false;
  }

  /** The next camera in the pilot's cycle: goggles, chase, seat, goggles... (the broadcast camera is not part of it). */
  toggleMode(): CameraMode {
    if (this.mode === 'broadcast') return this.mode;
    const next = PILOT_CYCLE[(PILOT_CYCLE.indexOf(this.mode) + 1) % PILOT_CYCLE.length];
    this.setMode(next ?? 'goggles');
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
    else if (this.mode === 'chase' || this.mode === 'seat') this.updateFollow(dtS, target, CAMERA[this.mode]);
    else {
      this.camera.position.copy(this.broadcastPosition);
      this.camera.lookAt(this.broadcastLookAt);
    }
  }

  private updateGoggles(target: CameraTarget): void {
    offset.set(0, CAMERA.goggles.upM, -CAMERA.goggles.forwardM).applyQuaternion(target.quaternion);
    this.camera.position.copy(target.position).add(offset);
    this.camera.quaternion.copy(target.quaternion).multiply(this.uptilt);
  }

  /** A level camera behind the drone's heading (it ignores tilt), smoothed. Chase and seat differ only in distance. */
  private updateFollow(dtS: number, target: CameraTarget, view: { distanceM: number; heightM: number; lookAheadM: number; smoothingPerS: number; minAboveGroundM: number }): void {
    const { distanceM, heightM, lookAheadM, smoothingPerS, minAboveGroundM } = view;
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
