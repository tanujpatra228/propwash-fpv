import { Scene, Vector3 } from 'three';
import { COLLISION, LOOP, TRACK, VALLEY } from '../config';
import { mustGet } from '../core/dom';
import { clamp } from '../core/math';
import { GameRenderer } from '../core/renderer';
import { Battery } from '../drone/battery';
import { createDroneModel } from '../drone/drone-model';
import { STOCK_STATS } from '../drone/drone-stats';
import { FlightModel, NO_INPUT, type FlightInput } from '../drone/flight-model';
import { Input } from '../input/input';
import {
  loadBindings,
  loadMouseSensitivity,
  primaryKeyLabel,
  saveBindings,
  saveMouseSensitivity,
  type ActionId,
  type Bindings,
} from '../input/key-bindings';
import { clampToWorld } from '../physics/bounds';
import { ColliderWorld } from '../physics/colliders';
import { resolveDrone, substepCount, type CrashReason } from '../physics/resolve';
import { Banner } from '../ui/banner';
import { ControlsPanel } from '../ui/controls-panel';
import { checkGateCrossing } from '../world/gate-crossing';
import { buildBoundary, type Boundary } from '../world/boundary';
import { buildGates, type Gate } from '../world/gates';
import { PIT_PAD } from '../world/pit-area';
import { buildScenery, type Scenery } from '../world/scenery';
import { buildSky } from '../world/sky';
import { buildTerrain, buildWater, groundY, surfaceAt } from '../world/terrain';
import { createWorldTextures } from '../world/textures';
import { CameraRig } from './camera-rig';
import { CRASH_MESSAGES } from './crash-messages';
import { lensFor, staticAmount } from './fpv-static';
import { HudBridge } from './hud-bridge';
import { LapTracker } from './lap-tracker';
import { respawnPose, type Pose } from './respawn';

const RESTING_ON_GROUND_M = 0.02;

const scratchPosition = new Vector3();
const previousPosition = new Vector3();
const stepInput: FlightInput = { ...NO_INPUT };
const respawn: Pose = { position: new Vector3(), yawRad: 0 };
const padPose: Pose = { position: PIT_PAD.position.clone(), yawRad: PIT_PAD.yawRad };

/** Owns the scene and the main loop. Sandbox until the modes arrive in M6: free flight with gates and crashes. */
export class Game {
  private readonly renderer: GameRenderer;
  private readonly scene = new Scene();
  private readonly rig = new CameraRig();
  private readonly sky;
  private readonly colliders = new ColliderWorld();
  private readonly scenery: Scenery;
  private readonly gates: Gate[];
  private readonly boundary: Boundary;
  private readonly tracker = new LapTracker(TRACK.gateCount);
  private readonly flight = new FlightModel();
  private readonly battery = new Battery(STOCK_STATS);
  private readonly drone = createDroneModel({ color: 0xff7a1a });
  private readonly input: Input;
  private readonly controls: ControlsPanel;
  private readonly banner = new Banner();
  private readonly hud: HudBridge;
  private readonly flightInput: FlightInput = { ...NO_INPUT };
  private bindings: Bindings;
  private lastTimeMs = 0;
  private clockS = 0;
  private crashTimerS = 0;
  private flightTimeS = 0;
  private isAnalogOn = true;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new GameRenderer(canvas);
    this.sky = buildSky(this.scene, this.renderer.webgl);
    const textures = createWorldTextures(this.renderer.webgl.capabilities.getMaxAnisotropy());
    buildTerrain(this.scene, textures.detail);
    buildWater(this.scene);
    this.scenery = buildScenery(this.scene, this.colliders, textures);
    this.gates = buildGates(this.scene, this.colliders, textures);
    this.boundary = buildBoundary(this.scene);
    this.scene.add(this.drone.group);

    this.bindings = loadBindings();
    const sensitivity = loadMouseSensitivity();
    this.input = new Input(canvas, this.bindings);
    this.input.setSensitivity(sensitivity);
    this.controls = new ControlsPanel(this.bindings, sensitivity, {
      onBindingsChange: (next) => {
        this.bindings = next;
        saveBindings(next);
        this.input.setBindings(next);
        this.refreshLabels();
      },
      onSensitivityChange: (value) => {
        saveMouseSensitivity(value);
        this.input.setSensitivity(value);
      },
      onClose: () => {
        this.input.enabled = true;
      },
    });
    this.hud = new HudBridge(this.scene, {
      onCamera: () => this.toggleCamera(),
      onStatic: () => this.toggleStatic(),
      onReset: () => this.resetByPlayer(),
      onControls: () => {
        this.input.enabled = false;
        this.controls.open();
      },
    });
    this.input.onPress((action) => this.onPress(action));

    this.placeAtPad();
    this.refreshLabels();
    this.input.enabled = true;
  }

  /** Dev-only helper used by browser tests to put the drone somewhere specific. */
  debugPlace(x: number, y: number, z: number, yawRad: number): void {
    scratchPosition.set(x, y, z);
    this.flight.reset(scratchPosition, yawRad);
    this.rig.snap();
  }

  /** Dev-only: draw calls and triangles of the last frame. */
  debugRenderInfo(): { calls: number; triangles: number; geometries: number } {
    const { render, memory } = this.renderer.webgl.info;
    return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries };
  }

  /** Dev-only: advance the simulation without rendering (headless tests run too slowly in real time). */
  debugSimulate(seconds: number, input: Partial<FlightInput>): { crashed: CrashReason | null; position: number[] } {
    Object.assign(this.flightInput, NO_INPUT, input);
    let crashed: CrashReason | null = null;
    const frames = Math.round(seconds * 60);
    for (let i = 0; i < frames && crashed === null; i++) {
      crashed = this.simulate({ ...this.flightInput }, 1 / 60);
      this.clockS += 1 / 60;
    }
    return { crashed, position: this.flight.position.toArray() };
  }

  /** Dev-only: change exposure, bloom and light levels live. */
  debugLook(look: Parameters<GameRenderer['debugLook']>[0] & Parameters<ReturnType<typeof buildSky>['debugLight']>[0]): void {
    this.renderer.debugLook(look);
    this.sky.debugLight(look);
  }

  /** Dev-only: lap and gate state for browser tests. */
  debugState(): { nextGate: number; lastPassedGate: number; laps: number; crashTimerS: number; battery: number } {
    return {
      nextGate: this.tracker.nextGate,
      lastPassedGate: this.tracker.lastPassedGate,
      laps: this.tracker.completedLaps,
      crashTimerS: this.crashTimerS,
      battery: this.battery.charge01,
    };
  }

  /** Dev-only: where gate `index` is and which way it faces. */
  debugGate(index: number): { position: number[]; yawRad: number } | null {
    const gate = this.gates[index];
    if (!gate) return null;
    return { position: gate.position.toArray(), yawRad: Math.atan2(-gate.forward.x, -gate.forward.z) };
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  private onPress(action: ActionId): void {
    if (action === 'reset') this.resetByPlayer();
    else if (action === 'camera') this.toggleCamera();
    else if (action === 'static') this.toggleStatic();
  }

  /** The R key: respawn at once, but not during the crash freeze. */
  private resetByPlayer(): void {
    if (this.crashTimerS <= 0) this.respawnAtLastGate();
  }

  private toggleCamera(): void {
    this.rig.toggleMode();
    this.refreshLabels();
  }

  private toggleStatic(): void {
    this.isAnalogOn = !this.isAnalogOn;
    this.refreshLabels();
  }

  private placeAtPad(): void {
    this.flight.reset(padPose.position, padPose.yawRad);
    this.flight.position.y = groundY(padPose.position.x, padPose.position.z) + COLLISION.restOffsetM;
    this.rig.snap();
  }

  private respawnAtLastGate(): void {
    respawnPose(this.gates, this.tracker.respawnGate, padPose, groundY, respawn);
    if (this.tracker.respawnGate < 0) respawn.position.y = groundY(respawn.position.x, respawn.position.z) + COLLISION.restOffsetM;
    this.flight.reset(respawn.position, respawn.yawRad);
    this.banner.hide();
    this.crashTimerS = 0;
    this.rig.snap();
  }

  private startCrash(reason: CrashReason): void {
    this.crashTimerS = COLLISION.crashDurationS;
    this.flight.velocity.set(0, 0, 0);
    this.banner.show('Crashed', `${CRASH_MESSAGES[reason]}. Respawning at the last gate…`, 'crash');
  }

  /** Key hints and menu labels, rebuilt when bindings, camera or analog setting change. */
  private refreshLabels(): void {
    const key = (id: ActionId): string => primaryKeyLabel(this.bindings, id);
    this.hud.setHelpText(
      `${key('up')} up · ${key('down')} down · ${key('forward')}/${key('back')} fly · ` +
        `${key('left')}/${key('right')} slide · mouse or ${key('turnLeft')}/${key('turnRight')} turn · ` +
        `${key('reset')} reset · click the view to steer with the mouse`,
    );
    this.hud.setMenuLabels({
      cameraLabel: this.rig.currentMode === 'goggles' ? 'goggles' : 'chase',
      isAnalogOn: this.isAnalogOn,
      cameraKey: key('camera'),
      staticKey: key('static'),
      resetKey: key('reset'),
    });
  }

  private readonly frame = (nowMs: number): void => {
    const dtS = clamp((nowMs - this.lastTimeMs) / 1000, LOOP.minDtS, LOOP.maxDtS);
    this.lastTimeMs = nowMs;
    this.clockS += dtS;
    this.update(dtS);
    this.renderer.render(this.scene, this.rig.camera, this.clockS);
    requestAnimationFrame(this.frame);
  };

  /**
   * Moves the drone one frame in small sub-steps so it can't tunnel through thin gate bars,
   * checking collisions and gate crossings after each. Returns the crash reason, if any.
   */
  private simulate(input: FlightInput, dtS: number): CrashReason | null {
    const steps = substepCount(this.flight.velocity.length(), dtS);
    const subDtS = dtS / steps;
    let effortSum = 0;
    for (let i = 0; i < steps; i++) {
      previousPosition.copy(this.flight.position);
      stepInput.forward = input.forward;
      stepInput.back = input.back;
      stepInput.left = input.left;
      stepInput.right = input.right;
      stepInput.up = input.up;
      stepInput.down = input.down;
      stepInput.turnLeft = input.turnLeft;
      stepInput.turnRight = input.turnRight;
      stepInput.stickX = input.stickX;
      stepInput.stickY = input.stickY;
      stepInput.mouseYawRad = input.mouseYawRad / steps;
      effortSum += this.flight.step(stepInput, STOCK_STATS, this.battery.powerFactor, subDtS);

      clampToWorld(this.flight);
      const result = resolveDrone(this.flight, this.colliders, surfaceAt, subDtS);
      if (result.crashed && result.reason) return result.reason;

      const next = this.gates[this.tracker.nextGate];
      if (next && checkGateCrossing(next, previousPosition, this.flight.position)) {
        this.tracker.onGateCrossed(next.index, this.clockS);
      }
    }
    this.battery.step(effortSum / steps, dtS);
    return null;
  }

  private update(dtS: number): void {
    if (this.crashTimerS > 0) {
      this.crashTimerS -= dtS;
      if (this.crashTimerS <= 0) this.respawnAtLastGate();
    } else {
      const crash = this.simulate(this.input.readFlightInput(this.flightInput), dtS);
      if (crash) this.startCrash(crash);
      // Temporary until the game modes (M6): an empty battery ends in a landing back on the pad.
      const isLanded = this.flight.position.y <= groundY(this.flight.position.x, this.flight.position.z) + COLLISION.restOffsetM + RESTING_ON_GROUND_M;
      if (this.battery.isEmpty && isLanded) {
        this.battery.refill();
        this.placeAtPad();
      }
    }

    const isGoggles = this.rig.currentMode === 'goggles';
    this.drone.group.visible = !isGoggles;
    this.drone.group.position.copy(this.flight.position);
    this.drone.group.quaternion.copy(this.flight.quaternion);
    this.drone.spinProps(this.crashTimerS > 0 ? 0 : this.flight.throttle01, dtS);
    if (this.crashTimerS <= 0) this.flightTimeS += dtS;
    this.scenery.update(this.clockS);
    this.boundary.update(this.flight.position);
    this.sky.followFocus(this.flight.position);
    this.rig.setAspect(this.renderer.aspect);
    this.rig.update(dtS, { position: this.flight.position, yawRad: this.flight.yawRad, quaternion: this.flight.quaternion });
    this.updateLens(isGoggles);
    this.hud.update({
      flight: this.flight,
      battery: this.battery,
      tracker: this.tracker,
      gates: this.gates,
      camera: this.rig.camera,
      isGoggles,
      flightTimeS: this.flightTimeS,
      timeS: this.clockS,
    });
  }

  private updateLens(isGoggles: boolean): void {
    const { position } = this.flight;
    const staticValue = staticAmount({
      isGoggles,
      isAnalogOn: this.isAnalogOn,
      distanceFromPadM: position.distanceTo(PIT_PAD.position),
      isInFactory: Math.hypot(position.x - VALLEY.bando.x, position.z - VALLEY.bando.z) < TRACK.bandoZoneRadiusM,
      crashRemainingS: Math.max(0, this.crashTimerS),
    });
    this.renderer.setLens(lensFor(isGoggles, this.isAnalogOn, staticValue));
  }
}
