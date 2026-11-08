import { describe, expect, it } from 'vitest';
import type { LapSubmission } from '../core/lap-validation';
import { ApiClient } from './api-client';

const lap = { pilotId: 'pilot-1234', name: 'Arjun', track: 'valley', worldVersion: 1, lapTimeS: 45, splitsS: [], ghost: { hz: 20, data: 'AAAAAA' } } as LapSubmission;
const reply = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const client = (impl: (url: string, init?: RequestInit) => Promise<Response>, timeoutMs = 100): ApiClient => new ApiClient(impl, timeoutMs);

describe('ApiClient.submitLap', () => {
  it('reports a saved lap', async () => {
    const c = client(async () => reply({ id: 'abc', rank: 3, isPersonalBest: true }));
    expect(await c.submitLap(lap)).toEqual({ kind: 'saved', id: 'abc', rank: 3, isPersonalBest: true });
  });

  it('sends the lap as JSON by POST', async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const c = client(async (url, init) => {
      seen = { url, init };
      return reply({ id: 'x', rank: 1, isPersonalBest: false });
    });
    await c.submitLap(lap);
    expect(seen).not.toBeNull();
    const call = seen as unknown as { url: string; init: RequestInit };
    expect(call.url).toBe('/api/laps');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(String(call.init.body)).name).toBe('Arjun');
  });

  it('treats a 400 as a final no, with the reason', async () => {
    const c = client(async () => reply({ error: 'That lap time is not possible.' }, 400));
    expect(await c.submitLap(lap)).toEqual({ kind: 'rejected', reason: 'That lap time is not possible.' });
  });

  it('asks to retry later on offline, rate limit, server errors and nonsense', async () => {
    expect((await client(async () => { throw new TypeError('offline'); }).submitLap(lap)).kind).toBe('retry');
    expect((await client(async () => reply({ error: 'Slow down' }, 429)).submitLap(lap)).kind).toBe('retry');
    expect((await client(async () => reply({ error: 'oops' }, 500)).submitLap(lap)).kind).toBe('retry');
    expect((await client(async () => new Response('<html>', { status: 200 })).submitLap(lap)).kind).toBe('retry');
  });

  it('gives up waiting after the timeout instead of hanging', async () => {
    const never = (_url: string, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const started = Date.now();
    expect((await client(never, 50).submitLap(lap)).kind).toBe('retry');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('ApiClient.leaderboard and ghost', () => {
  it('returns rows, or null when offline or the data is wrong', async () => {
    const rows = [{ id: 'a', name: 'Arjun', lapTimeS: 40, rank: 1 }];
    expect(await client(async () => reply(rows)).leaderboard()).toEqual(rows);
    expect(await client(async () => { throw new Error('offline'); }).leaderboard()).toBeNull();
    expect(await client(async () => reply({ not: 'a list' })).leaderboard()).toBeNull();
    expect(await client(async () => reply([{ id: 1 }])).leaderboard()).toBeNull();
    expect(await client(async () => reply([], 500)).leaderboard()).toBeNull();
  });

  it('returns a ghost, or null when missing or malformed', async () => {
    const ghost = { track: 'valley', name: 'Arjun', lapTimeS: 40, splitsS: [0, 1], ghost: { hz: 20, data: 'AAAAAA' } };
    expect(await client(async () => reply(ghost)).ghost('abc')).toEqual(ghost);
    expect(await client(async () => reply({ error: 'Not found.' }, 404)).ghost('abc')).toBeNull();
    expect(await client(async () => reply({ name: 'x' })).ghost('abc')).toBeNull();
  });

  it('escapes the id in the URL', async () => {
    let url = '';
    await client(async (u) => { url = u; return reply({}, 404); }).ghost('a/b?c');
    expect(url).toBe('/api/ghosts/a%2Fb%3Fc');
  });
});
