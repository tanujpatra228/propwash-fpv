import { el } from '../core/dom';
import { formatLapTime } from '../core/format';
import type { BoardRow } from '../net/api-client';

export interface LeaderboardCallbacks {
  onRace(id: string): void;
  onCopyLink(id: string): void;
  onChangeName(): void;
  onClose(): void;
}

/** The fastest laps. Names are always set as text (never as HTML) and long ones are cut with an ellipsis. */
export class LeaderboardScreen {
  private readonly root: HTMLDivElement;
  private readonly body = el('div', { class: 'lb-body' });
  private readonly pilot = el('span', { class: 'lb-pilot' });
  private readonly note = el('p', { class: 'cd-sub lb-note' });

  constructor(private readonly callbacks: LeaderboardCallbacks) {
    const change = el('button', { type: 'button', class: 'btn ghost lb-change', text: 'Change name' });
    change.addEventListener('click', () => callbacks.onChangeName());
    const close = el('button', { type: 'button', class: 'btn', text: 'Close' });
    close.addEventListener('click', () => {
      this.hide();
      callbacks.onClose();
    });
    this.root = el('div', { class: 'modal', hidden: true }, [
      el('div', { class: 'panel leaderboard', role: 'dialog', 'aria-label': 'Leaderboard' }, [
        el('span', { class: 'eyebrow', text: 'Valley Sprint' }),
        el('h2', { text: 'Leaderboard' }),
        el('div', { class: 'lb-me' }, [this.pilot, change]),
        this.body,
        this.note,
        close,
      ]),
    ]);
    document.body.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  setPilotName(name: string | null): void {
    this.pilot.textContent = name ? `You fly as ${name}` : 'You have no pilot name yet';
  }

  showMessage(text: string): void {
    this.body.replaceChildren(el('p', { class: 'cd-sub', text }));
    this.note.textContent = '';
  }

  showRows(rows: readonly BoardRow[]): void {
    if (rows.length === 0) {
      this.showMessage('No laps yet. Set the first one in a time trial!');
      return;
    }
    const leader = rows[0]?.lapTimeS ?? 0;
    const items = rows.map((row) => {
      const race = el('button', { type: 'button', class: 'btn ghost lb-race', text: 'Race' });
      race.addEventListener('click', () => {
        this.hide();
        this.callbacks.onRace(row.id);
      });
      const link = el('button', { type: 'button', class: 'btn ghost lb-link', text: 'Link' });
      link.addEventListener('click', () => {
        this.callbacks.onCopyLink(row.id);
        link.textContent = 'Copied';
      });
      return el('div', { class: 'lb-row' }, [
        el('span', { class: 'lb-rank', text: String(row.rank) }),
        el('span', { class: 'lb-name', text: row.name }),
        el('span', { class: 'lb-time', text: formatLapTime(row.lapTimeS) }),
        el('span', { class: 'lb-gap', text: row.rank === 1 ? '' : `+${(row.lapTimeS - leader).toFixed(2)}` }),
        race,
        link,
      ]);
    });
    this.body.replaceChildren(...items);
    this.note.textContent = 'Race a pilot to chase their ghost.';
  }
}
