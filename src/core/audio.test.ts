import { describe, expect, it } from 'vitest';
import { motorTone } from './audio';

describe('motorTone', () => {
  it('rises in pitch, brightness and volume with throttle', () => {
    const idle = motorTone(0, 0);
    const full = motorTone(1, 0);
    expect(idle.motorHz).toBe(120);
    expect(full.motorHz).toBe(480);
    expect(full.cutoffHz).toBeGreaterThan(idle.cutoffHz);
    expect(full.motorVolume).toBeGreaterThan(idle.motorVolume);
  });

  it('wind follows speed and is capped', () => {
    expect(motorTone(0.5, 0).windVolume).toBe(0);
    expect(motorTone(0.5, 15).windVolume).toBeCloseTo(0.05);
    expect(motorTone(0.5, 500).windVolume).toBe(0.12);
  });

  it('clamps out-of-range throttle', () => {
    expect(motorTone(5, 0).motorHz).toBe(480);
    expect(motorTone(-2, 0).motorHz).toBe(120);
  });
});
