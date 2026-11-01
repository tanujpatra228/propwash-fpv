import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  actionForCode,
  defaultBindings,
  isBindable,
  keyLabel,
  primaryKeyLabel,
  rebind,
  sanitizeBindings,
} from './key-bindings';

describe('key bindings', () => {
  it('defaults have no duplicate keys', () => {
    const codes = Object.values(defaultBindings()).flat().filter((c) => c !== '');
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every action id is unique', () => {
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
  });

  it('moves a key from another action and reports it', () => {
    const { bindings, movedFrom } = rebind(defaultBindings(), 'down', 1, 'KeyS');
    expect(bindings.down[1]).toBe('KeyS');
    expect(bindings.back[0]).toBe('');
    expect(movedFrom).toBe('back');
    expect(actionForCode(bindings, 'KeyS')).toBe('down');
  });

  it('does not mutate the input bindings', () => {
    const original = defaultBindings();
    rebind(original, 'down', 1, 'KeyS');
    expect(original.back[0]).toBe('KeyS');
  });

  it('rebinding within the same action reports no move', () => {
    const { bindings, movedFrom } = rebind(defaultBindings(), 'forward', 1, 'KeyW');
    expect(movedFrom).toBeNull();
    expect(bindings.forward).toEqual(['', 'KeyW']);
  });

  it('clears a slot with an empty code', () => {
    const { bindings } = rebind(defaultBindings(), 'forward', 0, '');
    expect(bindings.forward[0]).toBe('');
    expect(actionForCode(bindings, 'KeyW')).toBeNull();
  });

  it('refuses browser keys', () => {
    for (const code of ['Escape', 'F5', 'F11', 'F12', 'ControlLeft', 'MetaRight', '']) {
      expect(isBindable(code)).toBe(false);
    }
    expect(isBindable('KeyJ')).toBe(true);
  });

  it('falls back to defaults for corrupt saved data', () => {
    const defaults = defaultBindings();
    expect(sanitizeBindings(null)).toEqual(defaults);
    expect(sanitizeBindings('nope')).toEqual(defaults);
    expect(sanitizeBindings({ forward: ['KeyW'] })).toEqual(defaults);
    const duplicated = { ...defaults, up: ['KeyW', ''] };
    expect(sanitizeBindings(duplicated)).toEqual(defaults);
  });

  it('keeps a valid saved set', () => {
    const custom = rebind(defaultBindings(), 'up', 0, 'KeyJ').bindings;
    expect(sanitizeBindings(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
  });

  it('labels keys for people', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('ShiftLeft')).toBe('L Shift');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('')).toBe('');
    expect(primaryKeyLabel(defaultBindings(), 'up')).toBe('Space');
  });
});
