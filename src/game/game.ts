import { Scene, Vector3 } from 'three';
import { COLLISION, GHOST, LOOP, TRACK } from '../config';
import { MotorSound } from '../core/audio';
import type { RemoteGhost } from '../net/api-client';
import { formatLapTime } from '../core/format';
import { FpsMeter } from '../core/fps-meter';
import { ResolutionController } from '../core/resolution-controller';
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
  saveBindings,
  saveMouseSensitivity,
  type ActionId,
  type Bindings,
} from '../input/key-bindings';
import { ColliderWorld } from '../physics/colliders';
import type { CrashReason } from '../physics/resolve';
import { Banner } from '../ui/banner';
import { ChoiceDialog } from '../ui/choice-dialog';
import { ControlsPanel } from '../ui/controls-panel';
import { helpText } from '../ui/help-text';
import { buildFlightMenuLabels } from '../ui/menu-labels';
import { MainMenu, type QualityId } from '../ui/menu';
import { buildBoundary, type Boundary } from '../world/boundary';
import { buildGates, type Gate } from '../world/gates';
import { PIT_PAD } from '../world/pit-area';
import { buildScenery, type Scenery } from '../world/scenery';
import { buildSky } from '../world/sky';
import { buildTerrain, buildWater, groundY } from '../world/terrain';
import { createWorldTextures } from '../world/textures';
import { CameraRig } from './camera-rig';
import { CRASH_MESSAGES } from './crash-messages';
import { Presenter } from './presenter';
import { Simulation } from './simulation';
import { createDebugApi, type DebugApi } from './debug-api';
import { HudBridge } from './hud-bridge';
import { LapTracker } from './lap-tracker';
import { MenuDirector } from './menu-director';
import { FreeFlight } from './modes/free-flight';
import type { GameMode, ModeHost, ModeId, NextStep } from './modes/mode';
import { TrainingMode } from './modes/training';
import { TimeTrial } from './modes/time-trial';
import { type Pose } from './respawn';
import { applyQualityPreset } from './quality';
import { OnlineUi } from './online-ui';
import { loadPilotSettings, savePilotSettings, type PilotSettings } from '../core/pilot-settings';
import { loadFreeBatteryDrain, loadQuality, saveFreeBatteryDrain, saveQuality } from './settings';
import { loadBestLap } from './trial-storage';
import { loadCompletedLessons, saveCompletedLessons, trainingMenuText } from './training-progress';

const RESTING_ON_GROUND_M = 0.02;

const respawn: Pose = { position: new Vector3(), yawRad: 0 };
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
  private readonly nextSteps = new ChoiceDialog<NextStep>();
  private readonly hud: HudBridge;
  private readonly menu: MainMenu;
  private readonly sound = new MotorSound();
  private readonly simulation: Simulation;
  private readonly presenter: Presenter;
  private readonly trial: TimeTrial;
  private readonly online: OnlineUi;
  private readonly modes: Record<ModeId, GameMode>;
  private mode: GameMode;
  private phase: 'menu' | 'playing' = 'menu';
  private readonly flightInput: FlightInput = { ...NO_INPUT };
  private bindings: Bindings;
  private isFreeDrainOn = loadFreeBatteryDrain();
  private pilot: PilotSettings = loadPilotSettings();
  private lastTimeMs = 0;
  private clockS = 0;
  private crashTimerS = 0;
  private flightTimeS = 0;
  private isAnalogOn = true;
  private readonly fpsMeter = new FpsMeter();
  private readonly resolution = new ResolutionController();
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
      offerNextSteps: (title, subtitle, choices) => this.offerNextSteps(title, subtitle, choices),
      reportBestLap: (lap) => this.online.reportBestLap(lap),
    };
    this.trial = new TimeTrial(host);
    this.modes = {
      free: new FreeFlight(host, () => this.isFreeDrainOn),
      trial: this.trial,
      training: new TrainingMode(host, { load: loadCompletedLessons, save: saveCompletedLessons }),
    };
    this.mode = this.modes.free;
    this.online = new OnlineUi({
      pauseInput: () => void (this.input.enabled = false),
      resumeInput: () => void (this.input.enabled = this.phase === 'playing' && !this.nextSteps.isOpen),
      notify: (title, subtitle) => this.banner.show(title, subtitle, 'info', 3),
      raceGhost: (ghost) => this.raceGhost(ghost),
    });

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
        onTimeTrial: () => this.startTimeTrial(),
        onLeaderboard: () => void this.online.openLeaderboard(),
        onTraining: () => this.startMode('training'),
        onControls: () => this.openControls(),
        onQualityChange: (id) => this.applyQuality(id),
        onPilotChange: (next) => {
          this.pilot = next;
          savePilotSettings(next);
          this.applyPilotSettings();
        },
        onFreeDrainChange: (isOn) => {
          this.isFreeDrainOn = isOn;
          saveFreeBatteryDrain(isOn);
        },
      },
      { quality, isFreeDrainOn: this.isFreeDrainOn, pilot: this.pilot },
    );
    this.applyPilotSettings();
    this.simulation = new Simulation(this.flight, this.battery, this.colliders, this.gates, this.tracker);
    this.presenter = new Presenter({
      renderer: this.renderer,
      rig: this.rig,
      sky: this.sky,
      scenery: this.scenery,
      boundary: this.boundary,
      drone: this.drone,
      ghostDrone: this.ghostDrone,
      hud: this.hud,
      sound: this.sound,
    });
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
    this.nextSteps.hide();
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
    this.menu.setTrainingText(trainingMenuText(loadCompletedLessons()));
    this.menu.setVisible(true);
    this.online.flush();
  }

  /** A time trial against your own best lap. */
  private startTimeTrial(): void {
    this.trial.setOpponent(null);
    this.startMode('trial');
  }

  /** A time trial against another pilot's ghost. */
  private raceGhost(ghost: RemoteGhost): void {
    this.trial.setOpponent(ghost);
    this.startMode('trial');
  }

  /** For `?ghost=<id>` links: start racing that ghost, or stay on the menu if it is gone. */
  startFromLink(id: string): void {
    void this.online.raceFromLink(id);
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

  /** Shows the "what next?" dialog (the mouse is released while it is open) and carries out the pilot's choice. */
  private offerNextSteps(title: string, subtitle: string, choices: Parameters<ModeHost['offerNextSteps']>[2]): void {
    this.input.enabled = false;
    this.nextSteps.show(title, subtitle, choices, (id) => {
      if (id === 'menu') this.returnToMenu();
      else if (id === 'trial') this.startTimeTrial();
      else if (id === 'restart') {
        this.mode.handleReset();
        this.input.enabled = true;
      } else this.input.enabled = true;
    });
  }

  private openControls(): void {
    this.input.enabled = false;
    this.controls.open();
  }

  /** Pushes the pilot's camera, mouse and units choices to the parts that use them. */
  private applyPilotSettings(): void {
    this.rig.setGogglesView(this.pilot.fovDeg, this.pilot.uptiltDeg);
    this.input.setInvertTurn(this.pilot.isTurnInverted);
  }

  private applyQuality(id: QualityId, shouldSave = true): void {
    this.resolution.reset();
    this.renderer.setResolutionScale(1);
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
    this.hud.setHelpText(helpText(this.bindings));
    this.hud.setMenuLabels(
      buildFlightMenuLabels(this.bindings, {
        isChaseCamera: this.rig.currentMode === 'chase',
        isAnalogOn: this.isAnalogOn,
        isSoundAvailable: this.sound.available,
        isSoundOn: this.sound.enabled,
      }),
    );
  }

  // ---- the loop ----

  private readonly frame = (nowMs: number): void => {
    const dtS = clamp((nowMs - this.lastTimeMs) / 1000, LOOP.minDtS, LOOP.maxDtS);
    this.lastTimeMs = nowMs;
    this.clockS += dtS;
    const fps = this.fpsMeter.tick(dtS);
    if (fps !== null) this.onFpsSample(fps);
    if (this.phase === 'menu') this.presenter.presentMenu(dtS, this.clockS, this.director, this.flight);
    else this.updatePlaying(dtS);
    this.renderer.render(this.scene, this.rig.camera, this.clockS);
    requestAnimationFrame(this.frame);
  };

  /** Once a second: show the rate in settings and, while flying, keep the picture smooth by adjusting the resolution. */
  private onFpsSample(fps: number): void {
    if (this.phase === 'playing') {
      const scale = this.resolution.update(fps);
      if (scale !== null) this.renderer.setResolutionScale(scale);
    }
    this.menu.setFps(fps, this.renderer.currentResolutionScale);
  }

  private simulate(input: Readonly<FlightInput>, dtS: number): CrashReason | null {
    return this.simulation.step(input, dtS, this.mode.drainsBattery, (index) => this.mode.onGateCrossed(index));
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

    this.presenter.present({
      dtS,
      timeS: this.clockS,
      flight: this.flight,
      battery: this.battery,
      tracker: this.tracker,
      gates: this.gates,
      mode: this.mode,
      pilot: this.pilot,
      isAnalogOn: this.isAnalogOn,
      crashRemainingS: Math.max(0, this.crashTimerS),
      flightTimeS: this.flightTimeS,
    });
  }
}
