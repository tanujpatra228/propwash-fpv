import { el } from '../core/dom';

export interface StandingRow {
  name: string;
  isMe: boolean;
  /** Finishing place once done, otherwise 0. */
  finishedPlace: number;
  /** Laps completed out of the total, for the small progress note. */
  lap: number;
}

const ORDINALS = ['th', 'st', 'nd', 'rd'];
export function ordinal(n: number): string {
  const rest = n % 100;
  return `${n}${ORDINALS[(rest - 20) % 10] ?? ORDINALS[rest] ?? ORDINALS[0]}`;
}

/** Live race standings, left side under the race panel. Rebuilt only when the order or a lap count changes. */
export class StandingsPanel {
  private readonly root: HTMLDivElement;
  private readonly list = el('ol', { class: 'st-list' });
  private key = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', { class: 'panel standings-panel', hidden: true }, [el('span', { class: 'eyebrow', text: 'Standings' }), this.list]);
    parent.append(this.root);
  }

  update(rows: readonly StandingRow[] | null | undefined): void {
    this.root.hidden = !rows || rows.length === 0;
    if (!rows) return;
    const key = rows.map((r) => `${r.name}|${r.isMe ? 1 : 0}|${r.finishedPlace}|${r.lap}`).join('\n');
    if (key === this.key) return;
    this.key = key;
    this.list.replaceChildren(
      ...rows.map((row, i) =>
        el('li', { class: row.isMe ? 'me' : undefined }, [
          el('b', { text: ordinal(row.finishedPlace || i + 1) }),
          el('span', { class: 'st-name', text: row.name }),
          el('small', { text: row.finishedPlace ? 'Finished' : `Lap ${row.lap}` }),
        ]),
      ),
    );
  }
}
