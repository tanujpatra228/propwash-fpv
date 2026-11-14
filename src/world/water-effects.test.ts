import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { WaterEffects } from './water-effects';

describe('WaterEffects', () => {
  it('a splash shows a ring that grows and then disappears, and droplets that fall away', () => {
    const scene = new Scene();
    const fx = new WaterEffects(scene);
    const ring = scene.children[1];
    fx.splash(new Vector3(0, 0, 0));
    fx.update(0.1, new Vector3(500, 500, 500), new Vector3());
    expect(ring?.visible).toBe(true);
    const early = ring?.scale.x ?? 0;
    fx.update(0.3, new Vector3(500, 500, 500), new Vector3());
    expect(ring?.scale.x ?? 0).toBeGreaterThan(early);
    for (let i = 0; i < 40; i++) fx.update(0.05, new Vector3(500, 500, 500), new Vector3());
    expect(ring?.visible).toBe(false);
  });
  it('does nothing when the drone is high or slow', () => {
    const scene = new Scene();
    const fx = new WaterEffects(scene);
    expect(() => fx.update(0.016, new Vector3(0, 50, 0), new Vector3(20, 0, 0))).not.toThrow();
  });
});
