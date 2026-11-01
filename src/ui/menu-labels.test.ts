import { describe, expect, it } from 'vitest';
import { defaultBindings, rebind } from '../input/key-bindings';
import { buildFlightMenuLabels } from './menu-labels';

const state = { isChaseCamera: false, isAnalogOn: true, isSoundAvailable: true, isSoundOn: false };

describe('buildFlightMenuLabels', () => {
  it('labels the camera, sound and keys', () => {
    const labels = buildFlightMenuLabels(defaultBindings(), state);
    expect(labels.cameraLabel).toBe('goggles');
    expect(labels.soundLabel).toBe('Motor sound: off');
    expect(labels.cameraKey).toBe('C');
    expect(labels.exitKey).toBe('P');
  });

  it('follows toggles and remaps', () => {
    const bindings = rebind(defaultBindings(), 'camera', 0, 'KeyV').bindings;
    const labels = buildFlightMenuLabels(bindings, { ...state, isChaseCamera: true, isSoundOn: true });
    expect(labels.cameraLabel).toBe('chase');
    expect(labels.soundLabel).toBe('Motor sound: on');
    expect(labels.cameraKey).toBe('V');
  });

  it('says so when sound is unavailable', () => {
    expect(buildFlightMenuLabels(defaultBindings(), { ...state, isSoundAvailable: false }).soundLabel).toBe('Motor sound: unavailable');
  });
});
