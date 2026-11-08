import { PARTS } from '../config';
import { el } from '../core/dom';
import { formatLapTime } from '../core/format';
import { BATTERY_IDS, kindOf, partLabel, partPrice, PROP_IDS, setupName, upgradePrice, type DroneSetup, type PartId, type PartKind } from '../drone/parts';
import type { Progress } from '../game/progress';
import { compare, hangarStats, type HangarStats, type StatKey } from './hangar-preview';

const BARS: ReadonlyArray<{ key: StatKey; label: string; max: number }> = [
  { key: 'speed', label: 'Top speed', max: 1.3 },
  { key: 'grip', label: 'Grip', max: 1.5 },
  { key: 'lift', label: 'Lift', max: 1.4 },
  { key: 'flightTimeS', label: 'Flight time', max: 420 },
];

function blurbOf(id: PartId): string {
  return kindOf(id) === 'prop' ? PARTS.propellers[id as keyof typeof PARTS.propellers].blurb : PARTS.batteries[id as keyof typeof PARTS.batteries].blurb;
}

function formatStat(key: StatKey, value: number): string {
  return key === 'flightTimeS' ? formatLapTime(value).replace(/\.\d+$/, '') : `${Math.round(value * 100)}%`;
}

/** The Hangar: pick propellers and a battery, see what changes before you equip, buy and upgrade with credits. */
export class Hangar {
  private readonly root: HTMLDivElement;
  private readonly credits = el('b', { class: 'hg-credits' });
  private readonly tabs = el('div', { class: 'seg two' });
  private readonly cards = el('div', { class: 'hg-cards' });
  private readonly bars = el('div', { class: 'hg-bars' });
  private readonly message = el('p', { class: 'cd-sub hg-message' });
  private readonly setupLabel = el('small', { class: 'cd-sub' });
  private kind: PartKind = 'prop';
  private selected: PartId | null = null;

  constructor(
    private readonly progress: Progress,
    private readonly onClose: () => void,
  ) {
    const done = el('button', { type: 'button', class: 'btn', text: 'Done' });
    done.addEventListener('click', () => this.close());
    for (const [kind, label] of [['prop', 'Propellers'], ['battery', 'Batteries']] as const) {
      const button = el('button', { type: 'button', 'data-kind': kind }, [el('b', { text: label })]);
      button.addEventListener('click', () => {
        this.kind = kind;
        this.selected = null;
        this.render();
      });
      this.tabs.append(button);
    }
    this.root = el('div', { class: 'modal', hidden: true }, [
      el('div', { class: 'panel hangar-panel', role: 'dialog', 'aria-label': 'Hangar' }, [
        el('div', { class: 'hg-head' }, [el('span', { class: 'eyebrow', text: 'Hangar' }), el('span', { class: 'hg-bal' }, ['Credits ', this.credits])]),
        this.setupLabel,
        this.tabs,
        this.cards,
        this.bars,
        this.message,
        done,
      ]),
    ]);
    document.body.append(this.root);
  }

  open(): void {
    this.message.textContent = '';
    this.root.hidden = false;
    this.render();
  }

  private close(): void {
    this.root.hidden = true;
    this.onClose();
  }

  private ids(): readonly PartId[] {
    return this.kind === 'prop' ? PROP_IDS : BATTERY_IDS;
  }

  private withPart(id: PartId): DroneSetup {
    const now = this.progress.setup;
    const level = this.progress.levelOf(id) ?? 1;
    return kindOf(id) === 'prop' ? { ...now, prop: id as DroneSetup['prop'], propLevel: level } : { ...now, battery: id as DroneSetup['battery'], batteryLevel: level };
  }

  private act(result: ReturnType<Progress['buy']>): void {
    this.message.textContent = result.ok ? '' : result.reason;
    this.render();
  }

  private render(): void {
    this.credits.textContent = String(this.progress.credits);
    this.setupLabel.textContent = `Equipped: ${setupName(this.progress.setup)}`;
    for (const button of this.tabs.children) button.classList.toggle('on', button.getAttribute('data-kind') === this.kind);
    this.cards.replaceChildren(...this.ids().map((id) => this.card(id)));
    this.renderBars(this.selected ?? this.equippedOf(this.kind));
  }

  private equippedOf(kind: PartKind): PartId {
    return kind === 'prop' ? this.progress.setup.prop : this.progress.setup.battery;
  }

  private card(id: PartId): HTMLElement {
    const level = this.progress.levelOf(id);
    const isEquipped = this.progress.isEquipped(id);
    const action = el('button', { type: 'button', class: 'btn' });
    if (level === null) {
      action.textContent = `Buy · ${partPrice(id)}`;
      action.disabled = this.progress.credits < partPrice(id);
      action.addEventListener('click', (event) => {
        event.stopPropagation();
        this.act(this.progress.buy(id));
      });
    } else if (!isEquipped) {
      action.textContent = 'Equip';
      action.addEventListener('click', (event) => {
        event.stopPropagation();
        this.act(this.progress.equip(id));
      });
    } else {
      action.textContent = 'Equipped';
      action.disabled = true;
    }
    const children: Array<Node | string> = [el('b', { text: partLabel(id) }), el('small', { text: blurbOf(id) }), action];
    const price = level === null ? null : upgradePrice(level);
    if (level !== null) {
      const up = el('button', { type: 'button', class: 'btn ghost', text: price === null ? `Level ${level} (max)` : `Level ${level} → ${level + 1} · ${price}` });
      up.disabled = price === null || this.progress.credits < price;
      up.addEventListener('click', (event) => {
        event.stopPropagation();
        this.act(this.progress.upgrade(id));
      });
      children.push(up);
    }
    const card = el('div', { class: `hg-card${isEquipped ? ' equipped' : ''}${this.selected === id ? ' sel' : ''}` }, children);
    card.addEventListener('click', () => {
      this.selected = id;
      this.render();
    });
    return card;
  }

  /** Bars for the shown part, each marked better or worse than what is equipped now. */
  private renderBars(shown: PartId): void {
    const now = hangarStats(this.progress.setup);
    const preview = hangarStats(this.withPart(shown));
    this.bars.replaceChildren(
      ...BARS.map(({ key, label, max }) => {
        const verdict = compare(now[key], preview[key]);
        const fill = el('i', { class: verdict, style: `width:${Math.min(100, (preview[key] / max) * 100)}%` });
        return el('div', { class: 'hg-bar' }, [el('span', { text: label }), el('div', { class: 'hg-track' }, [fill]), el('small', { text: formatStat(key, preview[key] as HangarStats[typeof key]) })]);
      }),
    );
  }
}
