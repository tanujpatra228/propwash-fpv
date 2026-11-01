import { el } from '../core/dom';

export interface FlightMenuCallbacks {
  onCamera(): void;
  onStatic(): void;
  onReset(): void;
  onControls(): void;
}

export interface FlightMenuLabels {
  cameraLabel: string;
  isAnalogOn: boolean;
  cameraKey: string;
  staticKey: string;
  resetKey: string;
}

/** Top-right button list. Every button shows the key bound to it. Sound and Exit arrive with M7. */
export class FlightMenu {
  private readonly camera = this.button('hot');
  private readonly analog = this.button();
  private readonly reset = this.button();
  private readonly controls = this.button();

  constructor(parent: HTMLElement, callbacks: FlightMenuCallbacks) {
    this.camera.root.addEventListener('click', callbacks.onCamera);
    this.analog.root.addEventListener('click', callbacks.onStatic);
    this.reset.root.addEventListener('click', callbacks.onReset);
    this.controls.root.addEventListener('click', callbacks.onControls);
    this.controls.label.textContent = 'Change controls';
    this.controls.key.hidden = true;
    parent.append(el('div', { class: 'flight-bar' }, [this.camera.root, this.analog.root, this.reset.root, this.controls.root]));
  }

  private button(extraClass?: string): { root: HTMLButtonElement; label: HTMLElement; key: HTMLElement } {
    const label = el('span');
    const key = el('kbd');
    const root = el('button', { type: 'button', class: extraClass }, [label, key]);
    return { root, label, key };
  }

  update(labels: FlightMenuLabels): void {
    this.camera.label.textContent = `Camera: ${labels.cameraLabel}`;
    this.camera.key.textContent = labels.cameraKey;
    this.analog.label.textContent = `Analog static: ${labels.isAnalogOn ? 'on' : 'off'}`;
    this.analog.key.textContent = labels.staticKey;
    this.reset.label.textContent = 'Reset to last gate';
    this.reset.key.textContent = labels.resetKey;
  }
}
