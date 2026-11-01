import { Quaternion, Scene, Vector3 } from 'three';
import { COLLISION, GHOST, LOOP, TRACK } from '../config';
import { MotorSound } from '../core/audio';
import { formatLapTime } from '../core/format';
import { FpsMeter } from '../core/fps-meter';
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
import { helpText } from '../ui/help-text';
import { MainMenu, type QualityId } from '../ui/menu';
import { buildBoundary, type Boundary } from '../world/boundary';
import { checkGateCrossing } from '../world/gate-crossing';
import { buildGates, type Gate } from '../world/gates';
import { PIT_PAD } from '../world/pit-area';
import { buildScenery, type Scenery } from '../world/scenery';
import { buildSky } from '../world/sky';
import { buildTerrain, buildWater, groundY, surfaceAt } from '../world/terrain';
import { createWorldTextures } from '../world/textures';
import { CameraRig } from './camera-rig';
import { CRASH_MESSAGES } from './crash-messages';
import { createDebugApi, type DebugApi } from './debug-api';
import { frameLens, lensFor } from './fpv-static';
import { HudBridge } from './hud-bridge';
import { LapTracker } from './lap-tracker';
import { MenuDirector } from './menu-director';
import { FreeFlight } from './modes/free-flight';
import type { GameMode, ModeHost, ModeId } from './modes/mode';
import { TimeTrial } from './modes/time-trial';
import { type Pose } from './respawn';
import { applyQualityPreset } from './quality';
import { loadFreeBatteryDrain, loadQuality, saveFreeBatteryDrain, saveQuality } from './settings';
import { loadBestLap } from './trial-storage';

const RESTING_ON_GROUND_M = 0.02;

const previousPosition = new Vector3();
const stepInput: FlightInput = { ...NO_INPUT };
const respawn: Pose = { position: new Vector3(), yawRad: 0 };
const ghostPosition = new Vector3();
const ghostQuaternion = new Quaternion();
const padPose: Pose = { position: PIT_PAD.position.clone(), yawRad: PIT_PAD.yawRad };

/** Owns the scene and the main loop. In the menu an AI flyby plays; in a mode the pilot flies and the mode sets the rules. */
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
  private readonly director: MenuDirector;
  private readonly input: Input;
  private readonly controls: ControlsPanel;
  private readonly banner = new Banner();
  private readonly hud: HudBridge;
  private readonly menu: MainMenu;
  private readonly sound = new MotorSound();
  private readonly modes: Record<ModeId, GameMode>;
  private mode: GameMode;
  private phase: 'menu' | 'playing' = 'menu';
  private readonly flightInput: FlightInput = { ...NO_INPUT };
  private bindings: Bindings;
  private isFreeDrainOn = loadFreeBatteryDrain();
  private lastTimeMs = 0;
  private clockS = 0;
  private crashTimerS = 0;
  private flightTimeS = 0;
  private isAnalogOn = true;
  private readonly fpsMeter = new FpsMeter();
  readonly debug: DebugApi;

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
    this.director = new MenuDirector(this.scene);

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
    this.modes = { free: new FreeFlight(host, () => this.isFreeDrainOn), trial: new TimeTrial(host) };
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
        this.input.enabled = this.phase === 'playing';
      },
    });
    this.hud = new HudBridge(this.scene, {
      onCamera: () => this.toggleCamera(),
      onStatic: () => this.toggleStatic(),
      onReset: () => this.pressReset(),
      onSound: () => this.toggleSound(),
      onControls: () => this.openControls(),
      onExit: () => this.returnToMenu(),
    });
    const quality = loadQuality();
    this.menu = new MainMenu(
      {
        onFreeFlight: () => this.startMode('free'),
        onTimeTrial: () => this.startMode('trial'),
        onControls: () => this.openControls(),
        onQualityChange: (id) => this.applyQuality(id),
        onFreeDrainChange: (isOn) => {
          this.isFreeDrainOn = isOn;
          saveFreeBatteryDrain(isOn);
        },
      },
      { quality, isFreeDrainOn: this.isFreeDrainOn },
    );
    this.applyQuality(quality, false);
    this.input.onPress((action) => this.onPress(action));
    this.debug = createDebugApi({
      renderer: this.renderer,
      sky: this.sky,
      tracker: this.tracker,
      battery: this.battery,
      gates: this.gates,
      currentMode: () => this.mode,
      phase: () => this.phase,
      placeDrone: (pose) => this.placeDrone(pose),
      startMode: (id) => this.startMode(id),
      returnToMenu: () => this.returnToMenu(),
      simulate: (input, dtS) => this.simulate(input, dtS),
      tickMode: (dtS) => this.mode.update(dtS, { isLanded: this.isLanded() }),
    });
    this.returnToMenu();
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  // ---- phases ----

  private returnToMenu(): void {
    this.phase = 'menu';
    this.input.enabled = false; // also releases the mouse
    this.crashTimerS = 0;
    this.banner.hide();
    this.hud.setVisible(false);
    this.drone.group.visible = false;
    this.ghostDrone.group.visible = false;
    this.director.setActive(true);
    this.rig.enterBroadcast();
    const best = loadBestLap();
    this.menu.setBestLapText(best ? formatLapTime(best.lapTimeS) : null);
    this.menu.setVisible(true);
  }

  private startMode(id: ModeId): void {
    this.phase = 'playing';
    this.menu.setVisible(false);
    this.director.setActive(false);
    this.rig.leaveBroadcast();
    this.hud.setVisible(true);
    this.mode = this.modes[id];
    this.crashTimerS = 0;
    this.flightTimeS = 0;
    this.mode.start();
    this.refreshLabels();
    this.input.enabled = true;
  }

  private openControls(): void {
    this.input.enabled = false;
    this.controls.open();
  }

  private applyQuality(id: QualityId, shouldSave = true): void {
    applyQualityPreset(id, this.renderer, this.sky, this.scenery);
    if (shouldSave) saveQuality(id);
  }

  // ---- input actions ----

  private onPress(action: ActionId): void {
    if (this.phase !== 'playing') return;
    if (action === 'reset') this.pressReset();
    else if (action === 'camera') this.toggleCamera();
    else if (action === 'static') this.toggleStatic();
    else if (action === 'sound') this.toggleSound();
    else if (action === 'pause') this.returnToMenu();
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

  private toggleSound(): void {
    this.sound.toggle();
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

  /** Key hints and menu labels, rebuilt when bindings, camera, sound or analog setting change. */
  private refreshLabels(): void {
    const key = (id: ActionId): string => primaryKeyLabel(this.bindings, id);
    this.hud.setHelpText(helpText(this.bindings));
    this.hud.setMenuLabels({
      cameraLabel: this.rig.currentMode === 'chase' ? 'chase' : 'goggles',
      isAnalogOn: this.isAnalogOn,
      cameraKey: key('camera'),
      staticKey: key('static'),
      resetKey: key('reset'),
      soundLabel: this.sound.available ? `Motor sound: ${this.sound.enabled ? 'on' : 'off'}` : 'Motor sound: unavailable',
      soundKey: key('sound'),
      exitKey: key('pause'),
    });
  }

  // ---- the loop ----

  private readonly frame = (nowMs: number): void => {
    const dtS = clamp((nowMs - this.lastTimeMs) / 1000, LOOP.minDtS, LOOP.maxDtS);
    this.lastTimeMs = nowMs;
    this.clockS += dtS;
    const fps = this.fpsMeter.tick(dtS);
    if (fps !== null) this.menu.setFps(fps);
    if (this.phase === 'menu') this.updateMenu(dtS);
    else this.updatePlaying(dtS);
    this.renderer.render(this.scene, this.rig.camera, this.clockS);
    requestAnimationFrame(this.frame);
  };

  private updateMenu(dtS: number): void {
    this.director.update(dtS, this.clockS);
    this.rig.setBroadcastShot(this.director.cameraPosition, this.director.cameraLookAt);
    this.rig.setAspect(this.renderer.aspect);
    this.rig.update(dtS, { position: this.flight.position, yawRad: 0, quaternion: this.flight.quaternion });
    this.scenery.update(this.clockS);
    this.sky.followFocus(this.director.cameraLookAt);
    this.boundary.update(this.director.cameraPosition);
    this.renderer.setLens(lensFor(false, false, 0));
    this.sound.update(0, 0, false, false);
  }

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

  private updatePlaying(dtS: number): void {
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
    const isGhostShown = this.updateGhost(dtS);
    this.scenery.update(this.clockS);
    this.boundary.update(this.flight.position);
    this.sky.followFocus(this.flight.position);
    this.rig.setAspect(this.renderer.aspect);
    this.rig.update(dtS, { position: this.flight.position, yawRad: this.flight.yawRad, quaternion: this.flight.quaternion });
    this.updateLens(isGoggles);
    this.sound.update(this.flight.throttle01, this.flight.velocity.length(), this.crashTimerS <= 0, this.battery.isEmpty);
    this.hud.update({
      flight: this.flight,
      battery: this.battery,
      tracker: this.tracker,
      gates: this.gates,
      mode: this.mode,
      ghostPosition: isGhostShown ? ghostPosition : null,
      camera: this.rig.camera,
      isGoggles,
      flightTimeS: this.flightTimeS,
      timeS: this.clockS,
    });
  }

  private updateGhost(dtS: number): boolean {
    const isShown = this.mode.ghostPose(ghostPosition, ghostQuaternion);
    this.ghostDrone.group.visible = isShown;
    if (!isShown) return false;
    this.ghostDrone.group.position.copy(ghostPosition);
    this.ghostDrone.group.quaternion.copy(ghostQuaternion);
    this.ghostDrone.spinProps(0.5, dtS);
    return true;
  }

  private updateLens(isGoggles: boolean): void {
    this.renderer.setLens(
      frameLens({ isGoggles, isAnalogOn: this.isAnalogOn, position: this.flight.position, crashRemainingS: Math.max(0, this.crashTimerS) }),
    );
  }
}
