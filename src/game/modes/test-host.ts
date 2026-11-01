import { Vector3 } from 'three';
import { TRACK } from '../../config';
import { Battery } from '../../drone/battery';
import { STOCK_STATS } from '../../drone/drone-stats';
import { FlightModel } from '../../drone/flight-model';
import { createGatePlane } from '../../world/gate-crossing';
import type { Gate } from '../../world/gates';
import { LapTracker } from '../lap-tracker';
import type { Pose } from '../respawn';
import type { ModeHost } from './mode';

/** Twelve gates in a straight line facing -Z, 50 m apart. For tests only. */
export const testGates: Gate[] = Array.from({ length: TRACK.gateCount }, (_, i) => ({
  index: i,
  ...createGatePlane(new Vector3(0, 6, -50 * i), new Vector3(0, 0, -1)),
}));

/** A fake game for testing modes: real flight, battery and lap tracker, no scene or DOM. */
export function makeHost() {
  const flight = new FlightModel();
  const battery = new Battery(STOCK_STATS);
  const tracker = new LapTracker(TRACK.gateCount);
  const pad: Pose = { position: new Vector3(14, 0, 30), yawRad: 0.3 };
  const placed: Pose[] = [];
  const banners: string[] = [];
  const host: ModeHost = {
    flight,
    battery,
    tracker,
    gates: testGates,
    padPose: pad,
    groundY: () => 0,
    placeDrone: (pose) => {
      placed.push({ position: pose.position.clone(), yawRad: pose.yawRad });
      flight.reset(pose.position, pose.yawRad);
    },
    flashBanner: (title) => void banners.push(title),
    hideBanner: () => undefined,
  };
  return { host, flight, battery, tracker, placed, banners };
}
