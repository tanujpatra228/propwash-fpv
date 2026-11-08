import { ACTIVE_TRACK_ID, TRACK_DEFS, TRACK_IDS, type TrackId } from '../config';
import { switchTrack } from '../core/track-switch';
import { ChoiceDialog } from './choice-dialog';

const BACK = 'back';

/** Lists the tracks; picking another one calls `onPick` (the game then reloads into it). */
export function showTrackPicker(dialog: ChoiceDialog<string>, active: TrackId, onPick: (id: TrackId) => void, onBack: () => void): void {
  const choices = [
    ...TRACK_IDS.map((id) => ({ id, label: `${TRACK_DEFS[id].name}${id === active ? '  (current)' : ''}`, isPrimary: id !== active })),
    { id: BACK, label: 'Back' },
  ];
  const subtitle = TRACK_IDS.map((id) => `${TRACK_DEFS[id].name}: ${TRACK_DEFS[id].blurb}`).join('\n');
  dialog.show('Choose a track', `${subtitle}\n\nSwitching reloads the game.`, choices, (id) => {
    const picked = TRACK_IDS.find((t) => t === id);
    if (picked) onPick(picked);
    else onBack();
  });
}

/** The menu's "Track" entry: shows the choice and reloads into the picked track. */
export class TrackPicker {
  private readonly dialog = new ChoiceDialog<string>();

  constructor(private readonly onBack: () => void) {}

  open(): void {
    showTrackPicker(this.dialog, ACTIVE_TRACK_ID, switchTrack, this.onBack);
  }
}
