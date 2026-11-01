import { Quaternion, Scene, Vector3 } from 'three';
import { COLLISION, GHOST, LOOP, TRACK, VALLEY } from '../config';
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
import { FreeFlight } from './modes/free-flight';
import type { GameMode, ModeHost, ModeId } from './modes/mode';
import { TimeTrial } from './modes/time-trial';
import { respawnPose, type Pose } from './respawn';
import { loadFreeBatteryDrain } from './settings';

const RESTING_ON_GROUND_M = 0.02;
const OTHER_MODE_LABEL: Record<ModeId, string> = { free: 'time trial', trial: 'free flight' };

const previousPosition = new Vector3();
const stepInput: FlightInput = { ...NO_INPUT };
const respawn: Pose = { position: new Vector3(), yawRad: 0 };
const ghostPosition = new Vector3();
const ghostQuaternion = new Quaternion();
const padPose: Pose = { position: PIT_PAD.position.clone(), yawRad: PIT_PAD.yawRad };

/** Owns the scene and the main loop. The mode (free flight or time trial) decides the rules. */
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
  private readonly ghostDrone = createDroneModel({ color: GHOST.color, ghost: true });
  private readonly input: Input;
  private readonly controls: ControlsPanel;
  private readonly banner = new Banner();
  private readonly hud: HudBridge;
  private readonly modes: Record<ModeId, GameMode>;
  private mode: GameMode;
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
    this.scene.add(this.drone.group, this.ghostDrone.group);
    this.ghostDrone.group.visible = false;

    const host: ModeHost = {
      flight: this.flight,
      battery: this.battery,
      tracker: this.tracker,
      gates: this.gates,
      padPose,
      groundY,
      placeDrone: (pose) => this.placeDrone(pose),
      flashBanner: (title, subtitle, kind, seconds) => this.banner.show(title, subtitle, kind, seconds),
      hideBanner: () => this.banner.hide(),
    };
    this.modes = { free: new FreeFlight(host, loadFreeBatteryDrain), trial: new TimeTrial(host) };
    this.mode = this.modes.free;

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
      onReset: () => this.pressReset(),
      onMode: () => this.setMode(this.mode.id === 'free' ? 'trial' : 'free'),
      onControls: () => {
        this.input.enabled = false;
        this.controls.open();
      },
    });
    this.input.onPress((action) => this.onPress(action));

    this.setMode('free');
    this.input.enabled = true;
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  private setMode(id: ModeId): void {
    this.mode = this.modes[id];
    this.crashTimerS = 0;
    this.flightTimeS = 0;
    this.mode.start();
    this.refreshLabels();
  }

  private onPress(action: ActionId): void {
    if (action === 'reset') this.pressReset();
    else if (action === 'camera') this.toggleCamera();
    else if (action === 'static') this.toggleStatic();
  }

  /** The reset key: the mode may use it (restart a finished run); otherwise respawn at once, but not during the crash freeze. */
  private pressReset(): void {
    if (this.mode.handleReset()) return;
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

  /** Puts the drone at a pose, at rest and clear of the ground, and ends any crash freeze. */
  private placeDrone(pose: Pose): void {
    this.flight.reset(pose.position, pose.yawRad);
    const floorY = groundY(pose.position.x, pose.position.z) + COLLISION.restOffsetM;
    if (this.flight.position.y < floorY) this.flight.position.y = floorY;
    this.crashTimerS = 0;
    this.rig.snap();
  }

  private respawnAtLastGate(): void {
    this.mode.respawnPose(respawn);
    this.placeDrone(respawn);
    this.banner.hide();
  }

  private startCrash(reason: CrashReason): void {
    this.crashTimerS = COLLISION.crashDurationS;
    this.flight.velocity.set(0, 0, 0);
    this.banner.show('Crashed', `${CRASH_MESSAGES[reason]}. Respawning at the last gate…`, 'crash');
  }

  /** Key hints and menu labels, rebuilt when bindings, camera, mode or analog setting change. */
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
      otherModeLabel: OTHER_MODE_LABEL[this.mode.id],
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
  private simulate(input: Readonly<FlightInput>, dtS: number): CrashReason | null {
    const steps = substepCount(this.flight.velocity.length(), dtS);
    const subDtS = dtS / steps;
    let effortSum = 0;
    for (let i = 0; i < steps; i++) {
      previousPosition.copy(this.flight.position);
      Object.assign(stepInput, input);
      stepInput.mouseYawRad = input.mouseYawRad / steps;
      effortSum += this.flight.step(stepInput, STOCK_STATS, this.battery.powerFactor, subDtS);

      clampToWorld(this.flight);
      const result = resolveDrone(this.flight, this.colliders, surfaceAt, subDtS);
      if (result.crashed && result.reason) return result.reason;

      const next = this.gates[this.tracker.nextGate];
      if (next && checkGateCrossing(next, previousPosition, this.flight.position)) this.mode.onGateCrossed(next.index);
    }
    if (this.mode.drainsBattery) this.battery.step(effortSum / steps, dtS);
    return null;
  }

  private isLanded(): boolean {
    const { position } = this.flight;
    return position.y <= groundY(position.x, position.z) + COLLISION.restOffsetM + RESTING_ON_GROUND_M;
  }

  private update(dtS: number): void {
    this.banner.update(dtS);
    if (this.crashTimerS > 0) {
      this.crashTimerS -= dtS;
      if (this.crashTimerS <= 0) this.respawnAtLastGate();
    } else {
      // Always read the input so mouse movement does not pile up while the controls are locked.
      const pilot = this.input.readFlightInput(this.flightInput);
      const crash = this.simulate(this.mode.isInputLocked ? NO_INPUT : pilot, dtS);
      if (crash) this.startCrash(crash);
    }
    this.mode.update(dtS, { isLanded: this.isLanded() });
    if (this.crashTimerS <= 0 && !this.mode.isInputLocked) this.flightTimeS += dtS;

    const isGoggles = this.rig.currentMode === 'goggles';
    this.drone.group.visible = !isGoggles;
    this.drone.group.position.copy(this.flight.position);
    this.drone.group.quaternion.copy(this.flight.quaternion);
    this.drone.spinProps(this.crashTimerS > 0 ? 0 : this.flight.throttle01, dtS);
    this.updateGhost(dtS);
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
      mode: this.mode,
      camera: this.rig.camera,
      isGoggles,
      flightTimeS: this.flightTimeS,
      timeS: this.clockS,
    });
  }

  private updateGhost(dtS: number): void {
    const isShown = this.mode.ghostPose(ghostPosition, ghostQuaternion);
    this.ghostDrone.group.visible = isShown;
    if (!isShown) return;
    this.ghostDrone.group.position.copy(ghostPosition);
    this.ghostDrone.group.quaternion.copy(ghostQuaternion);
    this.ghostDrone.spinProps(0.5, dtS);
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

  // ---- Dev-only helpers for browser tests (the entry point only exposes them in dev builds). ----

  debugPlace(x: number, y: number, z: number, yawRad: number): void {
    this.placeDrone({ position: new Vector3(x, y, z), yawRad });
  }

  debugRenderInfo(): { calls: number; triangles: number; geometries: number } {
    const { render, memory } = this.renderer.webgl.info;
    return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries };
  }

  debugLook(look: Parameters<GameRenderer['debugLook']>[0] & Parameters<ReturnType<typeof buildSky>['debugLight']>[0]): void {
    this.renderer.debugLook(look);
    this.sky.debugLight(look);
  }

  debugSetMode(id: ModeId): void {
    this.setMode(id);
  }

  /** Advances the simulation without rendering (headless browsers render too slowly to fly in real time). */
  debugSimulate(seconds: number, input: Partial<FlightInput>): { crashed: CrashReason | null; position: number[] } {
    const pilot: FlightInput = { ...NO_INPUT, ...input };
    let crashed: CrashReason | null = null;
    for (let i = 0; i < Math.round(seconds * 60) && crashed === null; i++) {
      crashed = this.simulate(this.mode.isInputLocked ? NO_INPUT : pilot, 1 / 60);
      this.mode.update(1 / 60, { isLanded: this.isLanded() });
      this.clockS += 1 / 60;
    }
    return { crashed, position: this.flight.position.toArray() };
  }

  debugState(): { mode: ModeId; countdown: string; nextGate: number; lastPassedGate: number; laps: number; battery: number; best: number | null } {
    return {
      mode: this.mode.id,
      countdown: this.mode.hud.countdown,
      nextGate: this.tracker.nextGate,
      lastPassedGate: this.tracker.lastPassedGate,
      laps: this.tracker.completedLaps,
      battery: this.battery.charge01,
      best: this.tracker.best?.lapTimeS ?? null,
    };
  }

  debugGate(index: number): { position: number[]; yawRad: number } | null {
    const gate = this.gates[index];
    if (!gate) return null;
    return { position: gate.position.toArray(), yawRad: Math.atan2(-gate.forward.x, -gate.forward.z) };
  }
}
