import { el } from '../core/dom';
import {
  ACTIONS,
  MOUSE_SENSITIVITY,
  actionLabel,
  defaultBindings,
  isBindable,
  keyLabel,
  rebind,
  type ActionId,
  type Bindings,
  type Slot,
} from '../input/key-bindings';

export interface ControlsPanelCallbacks {
  onBindingsChange(bindings: Bindings): void;
  onSensitivityChange(value: number): void;
  onClose(): void;
}

const DEFAULT_NOTE = 'Click any key to change it. Esc cancels, Backspace clears. Changes are saved in this browser.';

/** Modal that lists every action from ACTIONS (no hard-coded rows) and lets the player rebind them. */
export class ControlsPanel {
  private readonly root: HTMLDivElement;
  private readonly table: HTMLDivElement;
  private readonly note: HTMLParagraphElement;
  private readonly sensitivityValue: HTMLElement;
  private readonly sensitivityInput: HTMLInputElement;
  private listening: { actionId: ActionId; slot: Slot } | null = null;

  constructor(
    private bindings: Bindings,
    sensitivity: number,
    private readonly callbacks: ControlsPanelCallbacks,
  ) {
    this.table = el('div', { class: 'bind-table' });
    this.note = el('p', { class: 'cp-note', text: DEFAULT_NOTE });
    this.sensitivityValue = el('b', { text: '' });
    this.sensitivityInput = el('input', {
      type: 'range',
      id: 'mouseSens',
      min: String(MOUSE_SENSITIVITY.min),
      max: String(MOUSE_SENSITIVITY.max),
      step: String(MOUSE_SENSITIVITY.step),
      value: String(sensitivity),
    });
    this.sensitivityInput.addEventListener('input', () => {
      const value = Number(this.sensitivityInput.value);
      this.showSensitivity(value);
      callbacks.onSensitivityChange(value);
    });
    this.showSensitivity(sensitivity);

    const resetButton = el('button', { class: 'btn ghost', type: 'button', text: 'Reset to defaults' });
    resetButton.addEventListener('click', () => this.apply(defaultBindings(), 'Back to the default keys.'));
    const doneButton = el('button', { class: 'btn', type: 'button', text: 'Done' });
    doneButton.addEventListener('click', () => this.close());

    const panel = el('div', { class: 'panel controls-panel', role: 'dialog', 'aria-labelledby': 'cp-title' }, [
      el('div', { class: 'cp-head' }, [
        el('div', {}, [el('span', { class: 'eyebrow', text: 'Settings' }), el('h2', { id: 'cp-title', text: 'Controls' })]),
        resetButton,
      ]),
      this.note,
      this.table,
      el('div', { class: 'range' }, [
        el('label', { for: 'mouseSens' }, ['Mouse turn speed ', this.sensitivityValue]),
        this.sensitivityInput,
      ]),
      el('div', {}, [doneButton]),
    ]);
    this.root = el('div', { class: 'modal', hidden: true }, [panel]);
    document.body.append(this.root);
    this.renderTable();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
    this.renderTable();
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  close(): void {
    this.stopListening();
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.callbacks.onClose();
  }

  private showSensitivity(value: number): void {
    this.sensitivityValue.textContent = `${value.toFixed(1)}×`;
  }

  private apply(bindings: Bindings, message: string, isWarning = false): void {
    this.bindings = bindings;
    this.callbacks.onBindingsChange(bindings);
    this.setNote(message, isWarning);
    this.renderTable();
  }

  private setNote(message: string, isWarning = false): void {
    this.note.textContent = message;
    this.note.classList.toggle('warn', isWarning);
  }

  private stopListening(): void {
    this.listening = null;
    this.setNote(DEFAULT_NOTE);
  }

  /** Capture phase: while waiting for a key, nothing else (including the game) sees it. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.listening) {
      if (event.code === 'Escape') this.close();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const { actionId, slot } = this.listening;
    if (event.code === 'Escape') {
      this.stopListening();
      this.renderTable();
      return;
    }
    if (event.code === 'Backspace' || event.code === 'Delete') {
      this.listening = null;
      this.apply(rebind(this.bindings, actionId, slot, '').bindings, `Cleared "${actionLabel(actionId)}".`);
      return;
    }
    if (event.ctrlKey || event.metaKey || !isBindable(event.code)) {
      this.setNote('That key is used by the browser and cannot be bound. Try another.', true);
      return;
    }
    const result = rebind(this.bindings, actionId, slot, event.code);
    this.listening = null;
    const { movedFrom } = result;
    this.apply(
      result.bindings,
      movedFrom
        ? `${keyLabel(event.code)} was used for "${actionLabel(movedFrom)}". It now does this instead.`
        : DEFAULT_NOTE,
      movedFrom !== null,
    );
  };

  private renderTable(): void {
    const rows: HTMLElement[] = [
      el('span'),
      el('span', { class: 'col-h', text: 'Main' }),
      el('span', { class: 'col-h', text: 'Alternate' }),
    ];
    let group = '';
    for (const action of ACTIONS) {
      if (action.group !== group) {
        group = action.group;
        rows.push(el('h3', { text: group }));
      }
      rows.push(el('span', { class: 'lbl', text: action.label }));
      for (const slot of [0, 1] as const) rows.push(this.slotButton(action.id, slot));
    }
    this.table.replaceChildren(...rows);
  }

  private slotButton(actionId: ActionId, slot: Slot): HTMLButtonElement {
    const code = this.bindings[actionId][slot];
    const isListening = this.listening?.actionId === actionId && this.listening.slot === slot;
    const label = isListening ? 'Press a key…' : code !== '' ? keyLabel(code) : 'none';
    const button = el('button', {
      type: 'button',
      class: isListening ? 'listen' : code === '' ? 'empty' : undefined,
      text: label,
      'aria-label': `${actionLabel(actionId)}, ${slot === 0 ? 'main' : 'alternate'} key: ${label}`,
    });
    button.addEventListener('click', () => {
      this.listening = { actionId, slot };
      this.setNote('Press the new key.');
      this.renderTable();
    });
    return button;
  }
}
