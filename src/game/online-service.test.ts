import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACK } from '../config';
import type { SubmitOutcome } from '../net/api-client';
import { loadPendingLap, MAX_ATTEMPTS } from '../net/pending-lap';
import { loadPilotName } from '../net/pilot-identity';
import { OnlineService, type OnlineDeps } from './online-service';

const lap = { lapTimeS: 45, splitsS: new Array<number>(TRACK.gateCount).fill(3), ghost: { hz: 20, data: 'AAAAAA' } };

function setup(outcomes: SubmitOutcome[], names: Array<string | null> = ['Arjun']) {
  const submitted: Array<{ name: string; lapTimeS: number }> = [];
  const asked: Array<string | undefined> = [];
  const deps: OnlineDeps = {
    api: {
      submitLap: async (l) => {
        submitted.push({ name: l.name, lapTimeS: l.lapTimeS });
        return outcomes.shift() ?? { kind: 'retry' };
      },
      leaderboard: async () => [],
      ghost: async () => null,
    },
    askName: async (initial) => {
      asked.push(initial);
      return names.shift() ?? null;
    },
  };
  return { service: new OnlineService(deps), submitted, asked };
}

describe('OnlineService', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });
  afterEach(() => void vi.unstubAllGlobals());

  it('asks for a name the first time, saves it, uploads, and clears the queue', async () => {
    const { service, submitted, asked } = setup([{ kind: 'saved', id: 'x', rank: 3, isPersonalBest: true }]);
    const notice = await service.reportBestLap(lap);
    expect(asked).toHaveLength(1);
    expect(loadPilotName()).toBe('Arjun');
    expect(submitted).toEqual([{ name: 'Arjun', lapTimeS: 45 }]);
    expect(notice).toEqual({ title: 'On the leaderboard', subtitle: 'Rank 3' });
    expect(loadPendingLap()).toBeNull();
  });

  it('does not ask again once there is a name', async () => {
    const { service, asked } = setup([{ kind: 'saved', id: 'x', rank: 1, isPersonalBest: true }, { kind: 'saved', id: 'y', rank: 1, isPersonalBest: true }]);
    await service.reportBestLap(lap);
    await service.reportBestLap({ ...lap, lapTimeS: 44 });
    expect(asked).toHaveLength(1);
  });

  it('keeps the lap queued if the player says "not now", and does not nag again this session', async () => {
    const { service, submitted, asked } = setup([], [null]);
    expect(await service.reportBestLap(lap)).toBeNull();
    expect(loadPendingLap()?.lapTimeS).toBe(45);
    expect(submitted).toHaveLength(0);
    await service.reportBestLap({ ...lap, lapTimeS: 44 });
    expect(asked).toHaveLength(1); // not asked a second time
    expect(loadPendingLap()?.lapTimeS).toBe(44); // the newer, faster lap replaced the queued one
  });

  it('sends the queued lap after the name is set from the leaderboard', async () => {
    const { service, submitted } = setup([{ kind: 'saved', id: 'x', rank: 2, isPersonalBest: true }], [null, 'Meera']);
    await service.reportBestLap(lap);
    expect(await service.changeName()).toBe('Meera');
    await vi.waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]?.name).toBe('Meera');
  });

  it('keeps the lap and counts the attempt when the server is unreachable, then gives up after a few tries', async () => {
    const { service } = setup(Array.from({ length: MAX_ATTEMPTS + 2 }, () => ({ kind: 'retry' }) as SubmitOutcome));
    await service.reportBestLap(lap);
    expect(loadPendingLap()?.attempts).toBe(1);
    for (let i = 1; i < MAX_ATTEMPTS; i++) await service.flush();
    expect(loadPendingLap()).toBeNull();
  });

  it('drops a lap the server rejected, and says why', async () => {
    const { service } = setup([{ kind: 'rejected', reason: 'That lap time is not possible.' }]);
    const notice = await service.reportBestLap(lap);
    expect(notice).toEqual({ title: 'Lap not uploaded', subtitle: 'That lap time is not possible.' });
    expect(loadPendingLap()).toBeNull();
  });

  it('stays quiet when the lap was not a new personal best on the server', async () => {
    const { service } = setup([{ kind: 'saved', id: 'x', rank: 5, isPersonalBest: false }]);
    expect(await service.reportBestLap(lap)).toBeNull();
    expect(loadPendingLap()).toBeNull();
  });

  it('flush does nothing with nothing queued', async () => {
    const { service, submitted } = setup([]);
    expect(await service.flush()).toBeNull();
    expect(submitted).toHaveLength(0);
  });
});
