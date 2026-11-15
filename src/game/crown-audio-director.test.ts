import { describe, expect, it } from 'vitest';
import { AUDIO } from '../config';
import { CrownAudioDirector, type CrownAudioFrame } from './crown-audio-director';
import type { ModeAudio } from './modes/mode';

const audio = (over: Partial<ModeAudio> = {}): ModeAudio => ({ myId: 'me', holderId: '', holdLeftMs: 0, threatId: '', threat01: 0, beacon: null, isRunning: true, ...over });
const frame = (a: ModeAudio, dtS = 0.016): CrownAudioFrame => ({ dtS, audio: a, x: 0, y: 10, z: 0, yawRad: 0 });
const types = (d: CrownAudioDirector, a: ModeAudio, dtS = 0.016): string[] => d.update(frame(a, dtS)).events.map((e) => e.type);

describe('CrownAudioDirector stingers', () => {
  it('says nothing on the first update, whoever has the crown', () => {
    expect(types(new CrownAudioDirector(), audio({ holderId: 'bea' }))).toEqual([]);
  });
  it('plays one sting for each change of holder, and the right one', () => {
    const d = new CrownAudioDirector();
    types(d, audio());
    expect(types(d, audio({ holderId: 'me', holdLeftMs: 30_000 }))).toEqual(['crownClaimed']);
    expect(types(d, audio({ holderId: 'me', holdLeftMs: 29_000 }))).toEqual([]);
    expect(types(d, audio({ holderId: 'bea', holdLeftMs: 30_000 }))).toEqual(['crownLost']);
    expect(types(d, audio({ holderId: 'cy', holdLeftMs: 30_000 }))).toEqual(['crownOther']);
    expect(types(d, audio({ holderId: '' }))).toEqual(['crownDropped']);
  });
  it('chimes when the crown returns to the beacon after a drop, not at the start of the match', () => {
    const d = new CrownAudioDirector();
    types(d, audio({ beacon: { x: 1, y: 1, z: 1 } }));
    expect(types(d, audio({ beacon: { x: 1, y: 1, z: 1 } }))).toEqual([]);
    types(d, audio({ holderId: 'bea', holdLeftMs: 30_000 }));
    types(d, audio({ holderId: '' }));
    expect(types(d, audio({ beacon: { x: 1, y: 1, z: 1 } }))).toEqual(['crownBack']);
  });
  it('is silent outside the match and starts clean afterwards', () => {
    const d = new CrownAudioDirector();
    types(d, audio({ holderId: 'bea' }));
    expect(types(d, audio({ isRunning: false, holderId: 'me' }))).toEqual([]);
    expect(d.update(frame(audio({ isRunning: false }))).beacon).toBeNull();
    expect(types(d, audio({ holderId: 'me' }))).toEqual([]);
  });
});

describe('CrownAudioDirector heartbeat and pulse', () => {
  const count = (d: CrownAudioDirector, a: ModeAudio, seconds: number, type: string): number => {
    let n = 0;
    for (let t = 0; t < seconds; t += 0.05) n += d.update(frame(a, 0.05)).events.filter((e) => e.type === type).length;
    return n;
  };
  it('beats only while the pilot is king, faster as the hold runs out', () => {
    const early = count(new CrownAudioDirector(), audio({ holderId: 'me', holdLeftMs: 29_000 }), 6, 'heartbeat');
    const late = count(new CrownAudioDirector(), audio({ holderId: 'me', holdLeftMs: 2000 }), 6, 'heartbeat');
    expect(late).toBeGreaterThan(early);
    expect(count(new CrownAudioDirector(), audio({ holderId: 'bea', holdLeftMs: 2000 }), 6, 'heartbeat')).toBe(0);
  });
  it('the king hears a pulse from any close chaser, faster when closer, and none when far', () => {
    const far = count(new CrownAudioDirector(), audio({ holderId: 'me', threatId: 'bea', threat01: 0.1 }), 4, 'crownPulse');
    const near = count(new CrownAudioDirector(), audio({ holderId: 'me', threatId: 'bea', threat01: 0.5 }), 4, 'crownPulse');
    const touching = count(new CrownAudioDirector(), audio({ holderId: 'me', threatId: 'bea', threat01: 1 }), 4, 'crownPulse');
    expect(far).toBe(0);
    expect(near).toBeGreaterThan(0);
    expect(touching).toBeGreaterThan(near);
  });
  it('a chaser hears a pulse only for their own approach, with the chaser sound', () => {
    const d = new CrownAudioDirector();
    const mine = audio({ holderId: 'bea', threatId: 'me', threat01: 0.8 });
    const events = [];
    for (let t = 0; t < 2; t += 0.05) events.push(...d.update(frame(mine, 0.05)).events);
    expect(events.some((e) => e.type === 'crownPulse' && !e.isKing)).toBe(true);
    expect(count(new CrownAudioDirector(), audio({ holderId: 'bea', threatId: 'cy', threat01: 0.8 }), 3, 'crownPulse')).toBe(0);
    expect(AUDIO.crown.pulse.chaserHz).toBeLessThan(AUDIO.crown.pulse.kingHz);
  });
});

describe('CrownAudioDirector beacon', () => {
  it('hears the free crown, louder and on the correct side as you get closer, and nothing while it is worn', () => {
    const d = new CrownAudioDirector();
    const farCue = d.update({ ...frame(audio({ beacon: { x: 100, y: 10, z: 0 } })) }).beacon;
    const nearCue = d.update({ ...frame(audio({ beacon: { x: 20, y: 10, z: 0 } })) }).beacon;
    expect(nearCue?.loudness01).toBeGreaterThan(farCue?.loudness01 ?? 1);
    expect(nearCue?.pan).toBeGreaterThan(0.9); // facing -z, beacon at +x: on the right
    expect(d.update(frame(audio({ holderId: 'bea' }))).beacon).toBeNull();
  });
});
