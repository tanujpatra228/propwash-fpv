import { Quaternion, Vector3 } from 'three';
import type { PilotSettings } from '../core/pilot-settings';
import type { SoundSystem } from '../audio/sound-system';
import type { GameRenderer } from '../core/renderer';
import type { Battery } from '../drone/battery';
import type { DroneModel } from '../drone/drone-model';
import type { FlightModel } from '../drone/flight-model';
import type { Boundary } from '../world/boundary';
import type { Gate } from '../world/gates';
import type { Scenery } from '../world/scenery';
import type { SkyRig } from '../world/sky';
import type { CameraRig } from './camera-rig';
import { AudioDirector } from './audio-director';
import { frameLens, lensFor } from './fpv-static';
import type { HudBridge } from './hud-bridge';
import type { LapTracker } from './lap-tracker';
import type { MenuDirector } from './menu-director';
import type { GameMode } from './modes/mode';

/** What changed this frame, from the game's point of view. */
export interface PresentFrame {
  dtS: number;
  timeS: number;
  flight: FlightModel;
  battery: Battery;
  tracker: LapTracker;
  gates: readonly Gate[];
  mode: GameMode;
  pilot: PilotSettings;
  isAnalogOn: boolean;
  /** Seconds left of the crash freeze, 0 when flying. */
  crashRemainingS: number;
  flightTimeS: number;
}

/** Everything that only shows the current state: drone models, camera, lens, sound and HUD. It never changes game rules. */
export class Presenter {
  private readonly ghostPosition = new Vector3();
  private readonly ghostQuaternion = new Quaternion();
  private readonly director = new AudioDirector();

  constructor(
    private readonly parts: {
      renderer: GameRenderer;
      rig: CameraRig;
      sky: SkyRig;
      scenery: Scenery;
      boundary: Boundary;
      drone: DroneModel;
      ghostDrone: DroneModel;
      hud: HudBridge;
      sound: SoundSystem;
    },
  ) {}

  present(f: PresentFrame): void {
    const { renderer, rig, sky, scenery, boundary, drone, ghostDrone, hud, sound } = this.parts;
    const { flight } = f;
    const isGoggles = rig.currentMode === 'goggles';
    const isCrashed = f.crashRemainingS > 0;

    drone.group.visible = !isGoggles;
    drone.group.position.copy(flight.position);
    drone.group.quaternion.copy(flight.quaternion);
    drone.spinProps(isCrashed ? 0 : flight.throttle01, f.dtS);

    const isGhostShown = f.mode.ghostPose(this.ghostPosition, this.ghostQuaternion);
    ghostDrone.group.visible = isGhostShown;
    if (isGhostShown) {
      ghostDrone.group.position.copy(this.ghostPosition);
      ghostDrone.group.quaternion.copy(this.ghostQuaternion);
      ghostDrone.spinProps(0.5, f.dtS);
    }

    scenery.update(f.timeS);
    boundary.update(flight.position);
    sky.followFocus(flight.position);
    rig.setAspect(renderer.aspect);
    rig.update(f.dtS, { position: flight.position, yawRad: flight.yawRad, quaternion: flight.quaternion });
    renderer.setLens(frameLens({ isGoggles, isAnalogOn: f.isAnalogOn, position: flight.position, crashRemainingS: f.crashRemainingS }));
    sound.update({
      camera: rig.currentMode, dtS: f.dtS, isActive: !isCrashed, areMotorsCut: f.battery.isEmpty, throttle01: flight.throttle01, speedMps: flight.velocity.length(),
      sinkRateMps: -flight.velocity.y, pitchRad: flight.pitchRad, rollRad: flight.rollRad, yawRateRadps: flight.yawRateRadps,
    });
    for (const event of this.director.update({
      dtS: f.dtS, countdownText: f.mode.hud.countdown, lastPassedGate: f.tracker.lastPassedGate, completedLaps: f.tracker.completedLaps,
      isLastLapBest: f.tracker.lastLapS !== null && f.tracker.lastLapS === f.tracker.best?.lapTimeS, charge01: f.battery.charge01,
      isLow: f.battery.isLow, isEmpty: f.battery.isEmpty, isCrashed, isActive: true,
    })) sound.play(event);
    hud.update({
      flight,
      battery: f.battery,
      tracker: f.tracker,
      gates: f.gates,
      mode: f.mode,
      pilot: f.pilot,
      ghostPosition: isGhostShown ? this.ghostPosition : null,
      camera: rig.camera,
      isGoggles,
      flightTimeS: f.flightTimeS,
      timeS: f.timeS,
    });
  }

  /** The main menu's background: the AI flyby filmed by the director, no pilot, no HUD, no sound. */
  presentMenu(dtS: number, timeS: number, director: MenuDirector, flight: FlightModel): void {
    const { renderer, rig, sky, scenery, boundary, sound } = this.parts;
    director.update(dtS, timeS);
    rig.setBroadcastShot(director.cameraPosition, director.cameraLookAt);
    rig.setAspect(renderer.aspect);
    rig.update(dtS, { position: flight.position, yawRad: 0, quaternion: flight.quaternion });
    scenery.update(timeS);
    sky.followFocus(director.cameraLookAt);
    boundary.update(director.cameraPosition);
    renderer.setLens(lensFor(false, false, 0));
    sound.update({ camera: rig.currentMode, dtS, isActive: false, areMotorsCut: false, throttle01: 0, speedMps: 0, sinkRateMps: 0, pitchRad: 0, rollRad: 0, yawRateRadps: 0 });
    this.director.reset();
  }
}
