import { HUD } from '../config';
import { el } from '../core/dom';
import { BatteryGauge } from './battery-gauge';
import { Countdown } from './countdown';
import { FlightMenu, type FlightMenuCallbacks, type FlightMenuLabels } from './flight-menu';
import { GateMarker } from './gate-marker';
import { GhostTag } from './ghost-tag';
import { HeightGauge } from './height-gauge';
import { LessonPanel } from './lesson-panel';
import { HelpBar } from './help-bar';
import type { HudState } from './hud-state';
import { Minimap } from './minimap';
import { ModeTag } from './mode-tag';
import { StandingsPanel } from './standings-panel';
import { Osd } from './osd';
import { RacePanel } from './race-panel';
import { SpeedGauge } from './speed-gauge';

/** Composes every on-screen element. Reads a plain HudState; never touches game internals. */
export class Hud {
  private readonly root = el('div', { class: 'hud' });
  private readonly gauges = el('div', { class: 'gauges' });
  private readonly osd = new Osd(this.root);
  private readonly gateMarker = new GateMarker(this.root);
  private readonly minimap = new Minimap(this.root);
  private readonly racePanel = new RacePanel(this.root);
  private readonly modeTag = new ModeTag(this.root);
  private readonly standings = new StandingsPanel(this.root);
  private readonly lessonPanel = new LessonPanel(this.root);
  private readonly countdown = new Countdown(this.root);
  private readonly ghostTag = new GhostTag(this.root);
  private readonly height: HeightGauge;
  private readonly speed: SpeedGauge;
  private readonly battery: BatteryGauge;
  private readonly flightMenu: FlightMenu;
  private readonly helpBar = new HelpBar(this.root);
  private frameCount = 0;

  constructor(callbacks: FlightMenuCallbacks) {
    this.root.append(this.gauges);
    this.height = new HeightGauge(this.gauges);
    this.battery = new BatteryGauge(this.gauges);
    this.speed = new SpeedGauge(this.gauges);
    this.flightMenu = new FlightMenu(this.root, callbacks);
    document.body.append(this.root);
  }

  setVisible(isVisible: boolean): void {
    this.root.hidden = !isVisible;
  }

  setHelpText(text: string): void {
    this.helpBar.setText(text);
  }

  setMenuLabels(labels: FlightMenuLabels): void {
    this.flightMenu.update(labels);
  }

  update(state: HudState, timeS: number): void {
    this.frameCount++;
    const isTextFrame = this.frameCount % HUD.textEveryNFrames === 0;
    this.osd.setVisible(state.isGoggles);
    this.osd.update(state, timeS, isTextFrame);
    this.racePanel.setVisible(state.mode.race !== null);
    if (state.mode.race) this.racePanel.update(state.mode.race, isTextFrame);
    this.modeTag.update(state.mode.race === null && state.mode.lesson === null, state.mode.label, state.mode.hint);
    this.lessonPanel.update(state.mode.lesson);
    this.standings.update(state.mode.standings);
    this.countdown.update(state.mode.countdown);
    this.ghostTag.update(state.ghost.isVisible, state.ghost.x, state.ghost.y);
    this.gateMarker.update(state.nextGate.x, state.nextGate.y, state.nextGate.distM, state.units, isTextFrame);
    if (isTextFrame) {
      this.gateMarker.setCounter(state.gatesPassed, state.gateCount);
      this.height.update(state.heightM, state.units);
      this.battery.update(state.charge01, state.timeLeftS, state.mode.swapProgress01);
      this.speed.update(state.speedMps, state.units);
    }
    if (this.frameCount % HUD.minimapEveryNFrames === 0) this.minimap.update(state);
  }
}
