import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AUDIO, CAMERA } from '../config';
import { CameraRig } from './camera-rig';

const target = (yawRad = 0, tiltRad = 0) => ({
  position: new Vector3(100, 50, 100),
  yawRad,
  quaternion: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), tiltRad),
});

function settle(rig: CameraRig, t: ReturnType<typeof target>): void {
  rig.snap();
  rig.update(0.016, t);
}

describe('camera cycle', () => {
  it('goes goggles, chase, seat, goggles, and never lands on the broadcast camera', () => {
    const rig = new CameraRig();
    expect(rig.currentMode).toBe('goggles');
    expect(rig.toggleMode()).toBe('chase');
    expect(rig.toggleMode()).toBe('seat');
    expect(rig.toggleMode()).toBe('goggles');
  });
  it('leaves the broadcast camera alone', () => {
    const rig = new CameraRig();
    rig.enterBroadcast();
    expect(rig.toggleMode()).toBe('broadcast');
  });
});

describe('seat camera', () => {
  it('sits a third as far back and a third as high as the chase camera', () => {
    expect(CAMERA.seat.distanceM).toBeCloseTo(CAMERA.chase.distanceM / 3);
    expect(CAMERA.seat.heightM).toBeCloseTo(CAMERA.chase.heightM / 3);
    const chase = new CameraRig();
    chase.setMode('chase');
    settle(chase, target());
    const seat = new CameraRig();
    seat.setMode('seat');
    settle(seat, target());
    const distance = (rig: CameraRig): number => Math.hypot(rig.camera.position.x - 100, rig.camera.position.z - 100);
    expect(distance(seat)).toBeCloseTo(CAMERA.seat.distanceM, 3);
    expect(distance(chase) / distance(seat)).toBeCloseTo(3, 3);
    expect(seat.camera.position.y - 50).toBeCloseTo(CAMERA.seat.heightM, 3);
  });
  it('sits behind the heading and stays level when the drone tilts', () => {
    const level = new CameraRig();
    level.setMode('seat');
    settle(level, target(0, 0));
    const tilted = new CameraRig();
    tilted.setMode('seat');
    settle(tilted, target(0, 0.7));
    expect(tilted.camera.position.toArray()).toEqual(level.camera.position.toArray());
    expect(level.camera.position.z).toBeGreaterThan(100); // facing -z, so behind is +z
    const turned = new CameraRig();
    turned.setMode('seat');
    settle(turned, target(Math.PI / 2, 0)); // facing -x, so behind is +x
    expect(turned.camera.position.x).toBeGreaterThan(100);
  });
  it('has its own sound mix between goggles and chase', () => {
    const mix = AUDIO.cameraMix;
    expect(mix.seat.motor).toBeLessThan(mix.goggles.motor);
    expect(mix.seat.motor).toBeGreaterThan(mix.chase.motor);
  });
});
