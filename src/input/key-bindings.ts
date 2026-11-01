import { clamp } from '../core/math';
import { loadJson, saveJson } from '../core/storage';

/** Every action the player can trigger. Game code asks for actions, never raw keys. */
export const ACTIONS = [
  { id: 'forward', label: 'Fly forward', group: 'Flying', type: 'hold', defaults: ['KeyW', 'ArrowUp'] },
  { id: 'back', label: 'Fly backward', group: 'Flying', type: 'hold', defaults: ['KeyS', 'ArrowDown'] },
  { id: 'left', label: 'Slide left', group: 'Flying', type: 'hold', defaults: ['KeyA', 'ArrowLeft'] },
  { id: 'right', label: 'Slide right', group: 'Flying', type: 'hold', defaults: ['KeyD', 'ArrowRight'] },
  { id: 'up', label: 'Go up', group: 'Flying', type: 'hold', defaults: ['Space', ''] },
  { id: 'down', label: 'Go down', group: 'Flying', type: 'hold', defaults: ['ShiftLeft', ''] },
  { id: 'turnLeft', label: 'Turn left', group: 'Flying', type: 'hold', defaults: ['KeyQ', ''] },
  { id: 'turnRight', label: 'Turn right', group: 'Flying', type: 'hold', defaults: ['KeyE', ''] },
  { id: 'camera', label: 'Switch camera', group: 'Game', type: 'press', defaults: ['KeyC', ''] },
  { id: 'reset', label: 'Reset to last gate', group: 'Game', type: 'press', defaults: ['KeyR', ''] },
  { id: 'static', label: 'Analog static on / off', group: 'Game', type: 'press', defaults: ['KeyG', ''] },
  { id: 'sound', label: 'Motor sound on / off', group: 'Game', type: 'press', defaults: ['KeyM', ''] },
  { id: 'pause', label: 'Pause / back to menu', group: 'Game', type: 'press', defaults: ['KeyP', ''] },
] as const;

export type ActionId = (typeof ACTIONS)[number]['id'];
export type Slot = 0 | 1;
/** Key codes (KeyboardEvent.code) per action: main and alternate. '' means unbound. */
export type Bindings = Record<ActionId, [string, string]>;

export const MOUSE_SENSITIVITY = { min: 0.3, max: 3, step: 0.1, default: 1 } as const;

const BINDINGS_KEY = 'bindings.v1';
const SENSITIVITY_KEY = 'mouseSens.v1';
const ACTION_IDS: readonly ActionId[] = ACTIONS.map((a) => a.id);

/** Keys the browser needs for itself. They cannot be bound. */
const RESERVED_CODES: ReadonlySet<string> = new Set(['Escape', 'F5', 'F11', 'F12', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight']);

const KEY_NAMES: Readonly<Record<string, string>> = {
  Space: 'Space',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'Enter',
  Tab: 'Tab',
  AltLeft: 'L Alt',
  AltRight: 'R Alt',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
};

export function defaultBindings(): Bindings {
  const result = {} as Bindings;
  for (const action of ACTIONS) result[action.id] = [action.defaults[0], action.defaults[1]];
  return result;
}

export function isBindable(code: string): boolean {
  return code !== '' && !RESERVED_CODES.has(code);
}

/** Readable name for a key code: "KeyW" -> "W". Empty for unbound. */
export function keyLabel(code: string): string {
  if (code === '') return '';
  return KEY_NAMES[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}

export function actionForCode(bindings: Readonly<Bindings>, code: string): ActionId | null {
  if (code === '') return null;
  for (const id of ACTION_IDS) {
    const slots = bindings[id];
    if (slots[0] === code || slots[1] === code) return id;
  }
  return null;
}

export function actionLabel(id: ActionId): string {
  return ACTIONS.find((a) => a.id === id)?.label ?? id;
}

/** Main key of an action, for hints like "Space to go up". */
export function primaryKeyLabel(bindings: Readonly<Bindings>, id: ActionId): string {
  const [main, alternate] = bindings[id];
  return keyLabel(main !== '' ? main : alternate) || '–';
}

export interface RebindResult {
  bindings: Bindings;
  /** The other action that lost this key, if any (so the panel can tell the player). */
  movedFrom: ActionId | null;
}

/** Binds `code` to a slot. A key can belong to one slot only: it moves away from where it was. */
export function rebind(bindings: Readonly<Bindings>, actionId: ActionId, slot: Slot, code: string): RebindResult {
  const next = {} as Bindings;
  for (const id of ACTION_IDS) next[id] = [bindings[id][0], bindings[id][1]];
  let movedFrom: ActionId | null = null;
  if (code !== '') {
    for (const id of ACTION_IDS) {
      for (const s of [0, 1] as const) {
        if (next[id][s] !== code) continue;
        next[id][s] = '';
        if (id !== actionId) movedFrom = id;
      }
    }
  }
  next[actionId][slot] = code;
  return { bindings: next, movedFrom };
}

function isSlotPair(value: unknown): value is [string, string] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string';
}

/** Builds valid bindings from untrusted saved data. Unknown or broken entries fall back to defaults. */
export function sanitizeBindings(raw: unknown): Bindings {
  const result = defaultBindings();
  if (typeof raw !== 'object' || raw === null) return result;
  const saved = raw as Record<string, unknown>;
  const used = new Set<string>();
  let isCorrupt = false;
  const parsed = {} as Bindings;
  for (const id of ACTION_IDS) {
    const value = saved[id];
    if (!isSlotPair(value)) {
      isCorrupt = true;
      break;
    }
    parsed[id] = [value[0], value[1]];
    for (const code of parsed[id]) {
      if (code === '') continue;
      if (!isBindable(code) || used.has(code)) isCorrupt = true;
      used.add(code);
    }
  }
  return isCorrupt ? result : parsed;
}

export function loadBindings(): Bindings {
  return sanitizeBindings(loadJson<unknown>(BINDINGS_KEY, (v): v is unknown => v !== undefined));
}

export function saveBindings(bindings: Readonly<Bindings>): void {
  saveJson(BINDINGS_KEY, bindings);
}

export function loadMouseSensitivity(): number {
  const value = loadJson<number>(SENSITIVITY_KEY, (v): v is number => typeof v === 'number' && Number.isFinite(v));
  return clamp(value ?? MOUSE_SENSITIVITY.default, MOUSE_SENSITIVITY.min, MOUSE_SENSITIVITY.max);
}

export function saveMouseSensitivity(value: number): void {
  saveJson(SENSITIVITY_KEY, clamp(value, MOUSE_SENSITIVITY.min, MOUSE_SENSITIVITY.max));
}
