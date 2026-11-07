import { Vector3, type Camera } from 'three';
import { COLLISION, TRACK } from '../config';
import type { Battery } from '../drone/battery';
import type { FlightModel } from '../drone/flight-model';
import { clampToScreenEdge } from '../ui/gate-marker';
import { isOnScreen } from '../ui/ghost-tag';
import { Hud } from '../ui/hud';
import type { HudState } from '../ui/hud-state';
import type { FlightMenuCallbacks, FlightMenuLabels } from '../ui/flight-menu';
import type { Gate } from '../world/gates';
import type { GameMode } from './modes/mode';
import type { PilotSettings } from '../core/pilot-settings';
import { groundY } from '../world/terrain';
import { GroundMarker } from './ground-marker';
import type { LapTracker } from './lap-tracker';
import type { Scene } from 'three';

const projected = new Vector3();
/** The label floats this far above the ghost drone. */
const GHOST_TAG_ABOVE_M = 0.6;

export interface HudFrame {
  flight: FlightModel;
  battery: Battery;
  tracker: LapTracker;
  gates: readonly Gate[];
  mode: GameMode;
  pilot: PilotSettings;
  /** Where the ghost drone is, or null when it is not shown. */
  ghostPosition: Vector3 | null;
  camera: Camera;
  isGoggles: boolean;
  flightTimeS: number;
  timeS: number;
}

/** Turns game objects into the plain HudState the UI reads, and owns the HUD and the 3D ground marker. */
export class HudBridge {
  private readonly hud: Hud;
  private readonly groundMarker: GroundMarker;
  private readonly state: HudState = {
    isGoggles: true,
    units: 'metric',
    uptiltDeg: 0,
    fovDeg: 86,
    speedMps: 0,
    heightM: 0,
    throttle01: 0,
    flightTimeS: 0,
    voltage: 0,
    mAhUsed: 0,
    charge01: 1,
    timeLeftS: 0,
    isBatteryLow: false,
    isBatteryEmpty: false,
    rollRad: 0,
    pitchRad: 0,
    gatesPassed: 0,
    gateCount: TRACK.gateCount,
    nextGate: { x: 0, y: 0, distM: 0 },
    map: { x: 0, z: 0, yawRad: 0 },
    ghost: { isVisible: false, x: 0, y: 0 },
    mode: { label: '', hint: '', race: null, countdown: '', swapProgress01: 0, lesson: null, standings: null },
  };

  constructor(scene: Scene, callbacks: FlightMenuCallbacks) {
    this.hud = new Hud(callbacks);
    this.groundMarker = new GroundMarker(scene);
  }

  setVisible(isVisible: boolean): void {
    this.hud.setVisible(isVisible);
    if (!isVisible) this.groundMarker.hide();
  }

  setHelpText(text: string): void {
    this.hud.setHelpText(text);
  }

  setMenuLabels(labels: FlightMenuLabels): void {
    this.hud.setMenuLabels(labels);
  }

  update(frame: HudFrame): void {
    const { flight, battery, tracker, gates, camera } = frame;
    const { position } = flight;
    const groundHeightM = groundY(position.x, position.z);
    const heightM = Math.max(0, position.y - groundHeightM - COLLISION.restOffsetM);
    this.groundMarker.update(position, groundHeightM, heightM, !frame.isGoggles);

    const s = this.state;
    const next = gates[tracker.nextGate];
    if (next) {
      camera.updateMatrixWorld();
      projected.copy(next.position).project(camera);
      const edge = clampToScreenEdge(projected.x, projected.y, projected.z > 1);
      s.nextGate.x = edge.x;
      s.nextGate.y = edge.y;
      s.nextGate.distM = position.distanceTo(next.position);
    }
    s.isGoggles = frame.isGoggles;
    s.units = frame.pilot.units;
    s.uptiltDeg = frame.pilot.uptiltDeg;
    s.fovDeg = frame.pilot.fovDeg;
    s.speedMps = flight.velocity.length();
    s.heightM = heightM;
    s.throttle01 = flight.throttle01;
    s.flightTimeS = frame.flightTimeS;
    s.voltage = battery.voltage;
    s.mAhUsed = battery.mAhUsed;
    s.charge01 = battery.charge01;
    s.timeLeftS = battery.estimateSecondsLeft();
    s.isBatteryLow = battery.isLow;
    s.isBatteryEmpty = battery.isEmpty;
    s.rollRad = flight.rollRad;
    s.pitchRad = flight.pitchRad;
    s.gatesPassed = tracker.hasStarted ? (tracker.nextGate === 0 ? TRACK.gateCount : tracker.nextGate) : 0;
    s.map.x = position.x;
    s.map.z = position.z;
    s.map.yawRad = flight.yawRad;
    this.projectGhost(frame, s.ghost);
    s.mode.label = frame.mode.hud.modeLabel;
    s.mode.hint = frame.mode.hud.hint;
    s.mode.race = frame.mode.hud.race;
    s.mode.countdown = frame.mode.hud.countdown;
    s.mode.swapProgress01 = frame.mode.hud.swapProgress01;
    s.mode.lesson = frame.mode.hud.lesson;
    s.mode.standings = frame.mode.hud.standings;
    this.hud.update(s, frame.timeS);
  }

  /** Projects a point just above the ghost to the screen. */
  private projectGhost(frame: HudFrame, out: { isVisible: boolean; x: number; y: number }): void {
    out.isVisible = false;
    if (!frame.ghostPosition) return;
    frame.camera.updateMatrixWorld();
    projected.copy(frame.ghostPosition);
    projected.y += GHOST_TAG_ABOVE_M;
    projected.project(frame.camera);
    out.isVisible = isOnScreen(projected.x, projected.y, projected.z);
    out.x = projected.x;
    out.y = projected.y;
  }
}
