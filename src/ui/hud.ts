import { HUD } from '../config';
import { el } from '../core/dom';
import { BatteryGauge } from './battery-gauge';
import { FlightMenu, type FlightMenuCallbacks, type FlightMenuLabels } from './flight-menu';
import { GateMarker } from './gate-marker';
import { HeightGauge } from './height-gauge';
import { HelpBar } from './help-bar';
import type { HudState } from './hud-state';
import { Minimap } from './minimap';
import { Osd } from './osd';
import { SpeedGauge } from './speed-gauge';

/** Composes every on-screen element. Reads a plain HudState; never touches game internals. */
export class Hud {
  private readonly root = el('div', { class: 'hud' });
  private readonly gauges = el('div', { class: 'gauges' });
  private readonly osd = new Osd(this.root);
  private readonly gateMarker = new GateMarker(this.root);
  private readonly minimap = new Minimap(this.root);
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
    this.gateMarker.update(state.nextGate.x, state.nextGate.y, state.nextGate.distM, isTextFrame);
    if (isTextFrame) {
      this.gateMarker.setCounter(state.gatesPassed, state.gateCount);
      this.height.update(state.heightM);
      this.battery.update(state.charge01, state.timeLeftS);
      this.speed.update(state.speedMps);
    }
    if (this.frameCount % HUD.minimapEveryNFrames === 0) this.minimap.update(state);
  }
}
