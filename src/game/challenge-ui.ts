import type { ChoiceDialog } from '../ui/choice-dialog';
import { CHALLENGE_LIST, lockReason, type ChallengeDef, type Records } from './challenge-results';
import type { DroneSetup } from '../drone/parts';

const BACK = 'back';
const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);

function label(def: ChallengeDef, records: Records, isLocked: boolean): string {
  const record = records[def.id];
  const result = def.laps === null ? (record?.bestScore != null ? `best ${record.bestScore.toFixed(2)} laps` : '') : stars(record?.stars ?? 0);
  return `${def.name}${isLocked ? ' (locked)' : ''}  ${result}`.trim();
}

/** Lists the challenges with stars and locks. Picking a locked one says what to equip; picking an open one starts it. */
export function showChallengePicker(
  dialog: ChoiceDialog<string>,
  records: Records,
  setup: Readonly<DroneSetup>,
  onStart: (def: ChallengeDef) => void,
  onBack: () => void,
  message = 'One battery, no swap. Finish the laps before it dies.',
): void {
  const choices = [
    ...CHALLENGE_LIST.map((def) => ({ id: def.id, label: label(def, records, lockReason(def, setup) !== null), isPrimary: def.id === 'three' })),
    { id: BACK, label: 'Back' },
  ];
  dialog.show('Battery Challenge', message, choices, (id) => {
    const def = CHALLENGE_LIST.find((c) => c.id === id);
    if (!def) return onBack();
    const reason = lockReason(def, setup);
    if (reason) showChallengePicker(dialog, records, setup, onStart, onBack, reason);
    else onStart(def);
  });
}
