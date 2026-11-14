import { ACTIVE_TRACK_ID, TRACK_DEFS, TRACK_IDS, type TrackId } from '../config';
import { el } from '../core/dom';
import { formatLapTime } from '../core/format';
import { switchTrack } from '../core/track-switch';

/** Simple silhouettes drawn in SVG, one per map, so each card has its own picture without any image files. */
const PICTURES: Record<TrackId, { sky: string; svg: string }> = {
  valley: {
    sky: 'linear-gradient(#f2c48b, #8fb4d6)',
    svg: '<path d="M0 70 L40 38 L70 58 L110 26 L150 60 L200 40 V90 H0Z" fill="#3b5a3a"/><path d="M0 82 Q60 62 120 80 T200 76 V90 H0Z" fill="#274028"/><rect x="146" y="64" width="18" height="12" fill="#6d4a34"/>',
  },
  city: {
    sky: 'linear-gradient(#9cc4e6, #dfe9f1)',
    svg: '<g fill="#4a5a69"><rect x="8" y="30" width="22" height="60"/><rect x="34" y="14" width="26" height="76"/><rect x="64" y="40" width="20" height="50"/><rect x="88" y="22" width="28" height="68"/><rect x="120" y="44" width="22" height="46"/><rect x="146" y="10" width="24" height="80"/><rect x="174" y="36" width="22" height="54"/></g><g fill="#c9dcec"><rect x="38" y="22" width="4" height="4"/><rect x="48" y="22" width="4" height="4"/><rect x="92" y="30" width="4" height="4"/><rect x="150" y="20" width="4" height="4"/></g>',
  },
  harbor: {
    sky: 'linear-gradient(#ffb36b, #f3d6a8 60%, #4a8aa6 61%)',
    svg: '<rect y="55" width="200" height="35" fill="#2f6f86"/><path d="M0 62 H200 V70 H0Z" fill="#8d8b84"/><g fill="#d9892b"><rect x="30" y="18" width="3" height="44"/><rect x="52" y="18" width="3" height="44"/><rect x="26" y="16" width="34" height="3"/><rect x="40" y="19" width="2" height="16"/><rect x="36" y="35" width="10" height="4" fill="#c4382c"/></g><rect x="84" y="46" width="88" height="14" fill="#2b3a4a"/><g><rect x="96" y="30" width="22" height="16" fill="#8a3a2a"/><rect x="118" y="30" width="22" height="16" fill="#2f5d7a"/><rect x="140" y="30" width="22" height="16" fill="#a7752e"/></g><rect x="165" y="26" width="8" height="20" fill="#e9e4da"/><circle cx="170" cy="12" r="7" fill="#ffe9b0"/>',
  },
  night: {
    sky: 'linear-gradient(#070b1d, #1a2750)',
    svg: '<g fill="#fff"><circle cx="20" cy="12" r="1"/><circle cx="70" cy="8" r="1"/><circle cx="120" cy="16" r="1"/><circle cx="170" cy="10" r="1"/></g><circle cx="176" cy="22" r="7" fill="#dfe8ff"/><g fill="#0d1226"><rect x="8" y="30" width="22" height="60"/><rect x="34" y="14" width="26" height="76"/><rect x="64" y="40" width="20" height="50"/><rect x="88" y="22" width="28" height="68"/><rect x="120" y="44" width="22" height="46"/><rect x="146" y="10" width="24" height="80"/></g><g fill="#ffc27a"><rect x="38" y="22" width="4" height="4"/><rect x="48" y="34" width="4" height="4"/><rect x="92" y="30" width="4" height="4"/><rect x="100" y="48" width="4" height="4"/><rect x="150" y="20" width="4" height="4"/><rect x="158" y="40" width="4" height="4"/></g><rect x="68" y="50" width="12" height="4" fill="#ff2d95"/>',
  },
};

/** The map screen: one card per track with a picture, a line about it and your best lap. Picking another map reloads into it. */
export class MapSelect {
  private readonly root: HTMLDivElement;
  private readonly cards = el('div', { class: 'ms-cards' });

  constructor(
    private readonly onClose: () => void,
    /** Your best lap time on a map, by its world version, or null. Passed in because saved laps live in the game layer. */
    private readonly bestLapS: (worldVersion: number) => number | null,
  ) {
    const back = el('button', { type: 'button', class: 'btn ghost', text: 'Back' });
    back.addEventListener('click', () => this.close());
    this.root = el('div', { class: 'modal', hidden: true }, [
      el('div', { class: 'panel mapselect-panel', role: 'dialog', 'aria-label': 'Choose a map' }, [
        el('span', { class: 'eyebrow', text: 'Maps' }),
        el('h2', { text: 'Choose a map' }),
        this.cards,
        el('p', { class: 'cd-sub', text: 'Switching reloads the game. Each map has its own best laps and leaderboard.' }),
        back,
      ]),
    ]);
    document.body.append(this.root);
  }

  open(): void {
    this.cards.replaceChildren(...TRACK_IDS.map((id) => this.card(id)));
    this.root.hidden = false;
  }

  private close(): void {
    this.root.hidden = true;
    this.onClose();
  }

  private card(id: TrackId): HTMLElement {
    const def = TRACK_DEFS[id];
    const best = this.bestLapS(def.worldVersion);
    const isCurrent = id === ACTIVE_TRACK_ID;
    const picture = el('div', { class: 'ms-picture', style: `background:${PICTURES[id].sky}` });
    picture.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 200 90" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${PICTURES[id].svg}</svg>`);
    const button = el('button', { type: 'button', class: `ms-card${isCurrent ? ' current' : ''}`, disabled: isCurrent }, [
      picture,
      el('b', { text: def.name }),
      el('small', { text: def.blurb }),
      el('span', { class: 'ms-best', text: isCurrent ? 'Current map' : best !== null ? `Best lap ${formatLapTime(best)}` : 'No lap yet' }),
    ]);
    button.addEventListener('click', () => switchTrack(id));
    return button;
  }
}
