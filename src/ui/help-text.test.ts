import { describe, expect, it } from 'vitest';
import { defaultBindings, rebind } from '../input/key-bindings';
import { helpText } from './help-text';

describe('helpText', () => {
  it('shows the default keys', () => {
    const text = helpText(defaultBindings());
    expect(text).toContain('Space up');
    expect(text).toContain('W/S fly');
    expect(text).toContain('R reset');
  });

  it('follows a remap', () => {
    const text = helpText(rebind(defaultBindings(), 'up', 0, 'KeyJ').bindings);
    expect(text).toContain('J up');
    expect(text).not.toContain('Space up');
  });
});
