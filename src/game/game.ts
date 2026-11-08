import { Scene, Vector3 } from 'three';
import { GHOST, LOOP, TRACK } from '../config';
import { MotorSound } from '../core/audio';
import type { RemoteGhost } from '../net/api-client';
import { formatLapTime } from '../core/format';
import { clamp } from '../core/math';
import { GameRenderer } from '../core/renderer';
import { Battery } from '../drone/battery';
import { createDroneModel } from '../drone/drone-model';
import { STOCK_STATS, type DroneStats } from '../drone/drone-stats';
import { buildStats, droneLook, setupName, STOCK_SETUP } from '../drone/parts';
import { FlightModel, NO_INPUT, type FlightInput } from '../drone/flight-model';
import { Input } from '../input/input';
import { loadBindings, loadMouseSensitivity, saveBindings, saveMouseSensitivity, type ActionId, type Bindings } from '../input/key-bindings';
import { ColliderWorld } from '../physics/colliders';
import { Banner } from '../ui/banner';
import { ChoiceDialog } from '../ui/choice-dialog';
import { ControlsPanel } from '../ui/controls-panel';
import { MainMenu, type QualityId } from '../ui/menu';
import type { Boundary } from '../world/boundary';
import type { Gate } from '../world/gates';
import { PIT_PAD } from '../world/pit-area';
import type { Scenery } from '../world/scenery';
import { groundY } from '../world/terrain';
import { CameraRig } from './camera-rig';
import { Presenter } from './presenter';
import { FlightSession } from './flight-session';
import { buildWorldContent } from './world-setup';
import { Simulation } from './simulation';
import { createDebugApi, type DebugApi } from './debug-api';
import { HudBridge } from './hud-bridge';
import { LapTracker } from './lap-tracker';
import { MenuDirector } from './menu-director';
import { LiveController } from './live-controller';
import { createModes } from './modes-setup';
import { ChallengeMenu } from './challenge-ui';
import type { GameMode, ModeHost, ModeId, NextStep } from './modes/mode';
import type { TimeTrial } from './modes/time-trial';
import type { Pose } from './respawn';
import { Tuning } from './tuning';
import { OnlineUi } from './online-ui';
import { loadPilotSettings, savePilotSettings, type PilotSettings } from '../core/pilot-settings';
import { loadFreeBatteryDrain, loadQuality, saveFreeBatteryDrain, saveQuality } from './settings';
import { Hangar } from '../ui/hangar';
import { loadProgress } from './progress';
import { loadBestLap } from './trial-storage';
import { loadCompletedLessons, trainingMenuText } from './training-progress';

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
  private readonly progress = loadProgress().progress;
  /** The stats in force: the equipped parts in modes that use them, the stock drone otherwise. */
  private stats: DroneStats = STOCK_STATS;
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
  private readonly session: FlightSession;
  private readonly presenter: Presenter;
  private readonly trial: TimeTrial;
  private readonly online: OnlineUi;
  private readonly live: LiveController;
  private readonly hangar: Hangar;
  private readonly challenges: ChallengeMenu;
  private readonly modes: Record<ModeId, GameMode>;
  private mode: GameMode;
  private phase: 'menu' | 'playing' = 'menu';
  private readonly flightInput: FlightInput = { ...NO_INPUT };
  private bindings: Bindings;
  private isFreeDrainOn = loadFreeBatteryDrain();
  private pilot: PilotSettings = loadPilotSettings();
  private lastTimeMs = 0;
  private clockS = 0;
  private flightTimeS = 0;
  private isAnalogOn = true;
  private readonly tuning: Tuning;
  readonly debug: DebugApi;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new GameRenderer(canvas);
    const world = buildWorldContent(this.scene, this.renderer, this.colliders);
    this.sky = world.sky;
    this.scenery = world.scenery;
    this.gates = world.gates;
    this.boundary = world.boundary;
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
      placeDrone: (pose) => this.session.placeDrone(pose),
      flashBanner: (title, subtitle, kind, seconds) => this.banner.show(title, subtitle, kind, seconds),
      hideBanner: () => this.banner.hide(),
      offerNextSteps: (title, subtitle, choices) => this.offerNextSteps(title, subtitle, choices),
      earn: (reason, times) => this.progress.earn(reason, times),
      reportBestLap: (lap) => this.online.reportBestLap(lap),
    };
    // Dialogs share these: pause the flight controls while one is open, resume when it closes.
    const dialogs = {
      pauseInput: () => void (this.input.enabled = false),
      resumeInput: () => void (this.input.enabled = this.phase === 'playing' && !this.nextSteps.isOpen),
      notify: (title: string, subtitle: string) => this.banner.show(title, subtitle, 'info', 3),
    };
    this.live = new LiveController({ ...dialogs, scene: this.scene, startRace: () => this.startMode('live'), returnToLobby: () => this.returnToMenu(true) });
    const modes = createModes(host, this.live, () => this.isFreeDrainOn);
    this.trial = modes.trial;
    this.challenges = new ChallengeMenu(modes.challenge, {
      setup: () => this.progress.setup,
      start: () => this.startMode('challenge'),
      onBack: () => void (this.input.enabled = false),
    });
    this.modes = modes.all;
    this.mode = this.modes.free;
    this.online = new OnlineUi({ ...dialogs, raceGhost: (ghost) => this.raceGhost(ghost) });

    this.hangar = new Hangar(this.progress, () => this.refreshMenuText());
    this.bindings = loadBindings();
    const sensitivity = loadMouseSensitivity();
    this.input = new Input(canvas, this.bindings);
    this.input.setSensitivity(sensitivity);
    this.tuning = new Tuning({ renderer: this.renderer, sky: this.sky, scenery: this.scenery, rig: this.rig, input: this.input });
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
        onRaceFriends: () => void this.live.open(),
        onHangar: () => this.hangar.open(),
        onChallenge: () => this.challenges.open(),
        onControls: () => this.openControls(),
        onQualityChange: (id) => this.applyQuality(id),
        onPilotChange: (next) => {
          this.pilot = next;
          savePilotSettings(next);
          this.tuning.applyPilot(this.pilot);
        },
        onFreeDrainChange: (isOn) => {
          this.isFreeDrainOn = isOn;
          saveFreeBatteryDrain(isOn);
        },
      },
      { quality, isFreeDrainOn: this.isFreeDrainOn, pilot: this.pilot },
    );
    this.tuning.applyPilot(this.pilot);
    const simulation = new Simulation(this.flight, this.battery, this.colliders, this.gates, this.tracker, () => this.stats);
    this.session = new FlightSession({
      flight: this.flight,
      simulation,
      snapCamera: () => this.rig.snap(),
      showCrash: (title, subtitle) => this.banner.show(title, subtitle, 'crash'),
      hideBanner: () => this.banner.hide(),
      currentMode: () => this.mode,
    });
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
      placeDrone: (pose) => this.session.placeDrone(pose),
      startMode: (id) => this.startMode(id),
      returnToMenu: () => this.returnToMenu(),
      simulate: (input, dtS) => this.session.simulate(input, dtS),
      tickMode: (dtS) => this.mode.update(dtS, { isLanded: this.session.isLanded() }),
    });
    this.returnToMenu();
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  // ---- phases ----

  /** Back to the menu scene. Leaves the live-race room too, unless `keepRoom` (returning to its lobby). */
  private returnToMenu(keepRoom = false): void {
    this.nextSteps.hide();
    this.phase = 'menu';
    this.input.enabled = false; // also releases the mouse
    if (!keepRoom) this.live.leave();
    this.session.crashTimerS = 0;
    this.banner.hide();
    this.hud.setVisible(false);
    this.drone.group.visible = false;
    this.ghostDrone.group.visible = false;
    this.director.setActive(true);
    this.rig.enterBroadcast();
    this.refreshMenuText();
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

  /** For `?room=<code>` links: join that live race room. */
  startFromRoomLink(code: string): void {
    void this.live.open(code);
  }

  private startMode(id: ModeId): void {
    this.phase = 'playing';
    this.menu.setVisible(false);
    this.director.setActive(false);
    this.rig.leaveBroadcast();
    this.hud.setVisible(true);
    this.mode = this.modes[id];
    this.stats = this.mode.usesSetup ? buildStats(this.progress.setup) : STOCK_STATS;
    this.battery.configure(this.stats);
    this.drone.setLook(droneLook(this.mode.usesSetup ? this.progress.setup : STOCK_SETUP));
    this.session.crashTimerS = 0;
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

  private refreshMenuText(): void {
    const best = loadBestLap();
    this.menu.setBestLapText(best ? formatLapTime(best.lapTimeS) : null);
    this.menu.setHangarText(`${setupName(this.progress.setup)} · ${this.progress.credits} credits`);
    this.menu.setTrainingText(trainingMenuText(loadCompletedLessons()));
  }

  private openControls(): void {
    this.input.enabled = false;
    this.controls.open();
  }

  private applyQuality(id: QualityId, shouldSave = true): void {
    this.tuning.applyQuality(id);
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
    if (this.session.crashTimerS <= 0) this.session.respawnAtLastGate();
  }

  private toggle(change: () => void): void {
    change();
    this.refreshLabels();
  }

  private toggleCamera = (): void => this.toggle(() => this.rig.toggleMode());
  private toggleStatic = (): void => this.toggle(() => void (this.isAnalogOn = !this.isAnalogOn));
  private toggleSound = (): void => this.toggle(() => this.sound.toggle());

  private refreshLabels(): void {
    this.hud.setControlsInfo(this.bindings, {
      isChaseCamera: this.rig.currentMode === 'chase',
      isAnalogOn: this.isAnalogOn,
      isSoundAvailable: this.sound.available,
      isSoundOn: this.sound.enabled,
    });
  }

  // ---- the loop ----

  private readonly frame = (nowMs: number): void => {
    const dtS = clamp((nowMs - this.lastTimeMs) / 1000, LOOP.minDtS, LOOP.maxDtS);
    this.lastTimeMs = nowMs;
    this.clockS += dtS;
    const fps = this.tuning.tick(dtS, this.phase === 'playing');
    if (fps !== null) this.menu.setFps(fps, this.renderer.currentResolutionScale);
    if (this.phase === 'menu') this.presenter.presentMenu(dtS, this.clockS, this.director, this.flight);
    else this.updatePlaying(dtS);
    this.renderer.render(this.scene, this.rig.camera, this.clockS);
    requestAnimationFrame(this.frame);
  };

  private updatePlaying(dtS: number): void {
    this.banner.update(dtS);
    // Always read the input so mouse movement does not pile up while the controls are locked.
    this.session.advance(dtS, this.input.readFlightInput(this.flightInput));
    if (this.mode.id === 'live') this.live.update(performance.now(), dtS);
    this.mode.update(dtS, { isLanded: this.session.isLanded() });
    if (this.session.crashTimerS <= 0 && !this.mode.isInputLocked) this.flightTimeS += dtS;

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
      crashRemainingS: Math.max(0, this.session.crashTimerS),
      flightTimeS: this.flightTimeS,
    });
  }
}
