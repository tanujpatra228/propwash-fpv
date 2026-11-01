import { QUALITY } from '../config';
import { el } from '../core/dom';

export type QualityId = keyof typeof QUALITY;
export const QUALITY_IDS = Object.keys(QUALITY) as QualityId[];

export interface MenuCallbacks {
  onFreeFlight(): void;
  onTimeTrial(): void;
  onTraining(): void;
  onControls(): void;
  onQualityChange(quality: QualityId): void;
  onFreeDrainChange(isOn: boolean): void;
}

export interface MenuSettings {
  quality: QualityId;
  isFreeDrainOn: boolean;
}

/** Main menu over the live AI flyby, with the settings panel. DOM only: it calls back into the game. */
export class MainMenu {
  private readonly root: HTMLElement;
  private readonly settings: HTMLElement;
  private readonly trialSubtitle = el('small', { text: 'Set your first lap time' });
  private readonly trainingSubtitle = el('small', { text: 'Learn to fly in six short lessons' });
  private readonly fps = el('span', { class: 'fps', text: 'Measuring frame rate…' });
  private readonly qualityButtons = new Map<QualityId, HTMLButtonElement>();
  private readonly drainButtons = new Map<boolean, HTMLButtonElement>();

  constructor(private readonly callbacks: MenuCallbacks, initial: MenuSettings) {
    const item = (title: string, subtitle: HTMLElement | string, onClick: () => void, isPrimary = false): HTMLElement => {
      const sub = typeof subtitle === 'string' ? el('small', { text: subtitle }) : subtitle;
      const button = el('button', { type: 'button', class: isPrimary ? 'primary' : undefined }, [el('b', { text: title }), sub]);
      button.addEventListener('click', onClick);
      return el('li', {}, [button]);
    };

    const list = el('ul', { class: 'menu-list' }, [
      item('Free flight', 'Explore the valley at your own pace', callbacks.onFreeFlight, true),
      item('Time trial', this.trialSubtitle, callbacks.onTimeTrial),
      item('Training', this.trainingSubtitle, callbacks.onTraining),
      item('Controls', 'Change keys and mouse speed', callbacks.onControls),
      item('Settings', 'Graphics quality, battery', () => this.openSettings()),
    ]);
    this.root = el('section', { class: 'menu-screen' }, [
      el('div', { class: 'menu-left' }, [
        el('div', { class: 'logo' }, [el('span', { text: 'Prop' }), el('br'), 'wash']),
        el('p', { class: 'tagline', text: 'FPV drone racing, right in your browser.' }),
        list,
      ]),
    ]);

    this.settings = this.buildSettings(initial);
    document.body.append(this.root, this.settings);
    this.setQuality(initial.quality);
    this.setFreeDrain(initial.isFreeDrainOn);
  }

  private buildSettings(initial: MenuSettings): HTMLElement {
    const qualitySeg = el('div', { class: 'seg' });
    for (const id of QUALITY_IDS) {
      const preset = QUALITY[id];
      const button = el('button', { type: 'button' }, [el('b', { text: preset.label }), el('small', { text: preset.description })]);
      button.addEventListener('click', () => {
        this.setQuality(id);
        this.callbacks.onQualityChange(id);
      });
      this.qualityButtons.set(id, button);
      qualitySeg.append(button);
    }

    const drainSeg = el('div', { class: 'seg two' });
    for (const [isOn, label, description] of [[true, 'On', 'The battery drains as you fly.'], [false, 'Off', 'Always 100%. Time trial still drains.']] as const) {
      const button = el('button', { type: 'button' }, [el('b', { text: label }), el('small', { text: description })]);
      button.addEventListener('click', () => {
        this.setFreeDrain(isOn);
        this.callbacks.onFreeDrainChange(isOn);
      });
      this.drainButtons.set(isOn, button);
      drainSeg.append(button);
    }

    const controls = el('button', { type: 'button', class: 'btn ghost', text: 'Change controls' });
    controls.addEventListener('click', () => {
      this.closeSettings();
      this.callbacks.onControls();
    });
    const done = el('button', { type: 'button', class: 'btn', text: 'Done' });
    done.addEventListener('click', () => this.closeSettings());

    void initial;
    return el('div', { class: 'modal', hidden: true }, [
      el('div', { class: 'panel settings-panel', role: 'dialog', 'aria-label': 'Settings' }, [
        el('span', { class: 'eyebrow', text: 'Settings' }),
        el('h2', { text: 'Graphics quality' }),
        qualitySeg,
        this.fps,
        el('h2', { text: 'Battery drain in free flight' }),
        drainSeg,
        el('div', { class: 'settings-actions' }, [controls, done]),
      ]),
    ]);
  }

  private setQuality(id: QualityId): void {
    for (const [key, button] of this.qualityButtons) button.classList.toggle('on', key === id);
  }

  private setFreeDrain(isOn: boolean): void {
    for (const [key, button] of this.drainButtons) button.classList.toggle('on', key === isOn);
  }

  private openSettings(): void {
    this.settings.hidden = false;
  }

  private closeSettings(): void {
    this.settings.hidden = true;
  }

  get isSettingsOpen(): boolean {
    return !this.settings.hidden;
  }

  setVisible(isVisible: boolean): void {
    this.root.hidden = !isVisible;
    if (!isVisible) this.closeSettings();
  }

  /** The time-trial button subtitle: "Best lap 0:45.27" or an invitation to set one. */
  setBestLapText(text: string | null): void {
    this.trialSubtitle.textContent = text === null ? 'Set your first lap time' : `Best lap ${text}`;
  }

  /** The training button subtitle: where the pilot is in the six lessons. */
  setTrainingText(text: string): void {
    this.trainingSubtitle.textContent = text;
  }

  setFps(fps: number, renderScale = 1): void {
    if (this.settings.hidden) return;
    const sharpness = renderScale < 0.995 ? ` The picture is rendered at ${Math.round(renderScale * 100)}% to keep it smooth.` : '';
    this.fps.textContent = `Running at about ${Math.round(fps)} frames per second on this device.${sharpness}`;
  }
}
