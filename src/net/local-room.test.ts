import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOTS, ROOMS } from '../config';
import type { ServerMessage } from '../core/room-protocol';
import { LocalRoomClient } from './local-room';

function open() {
  const messages: ServerMessage[] = [];
  let closed = '';
  const client = new LocalRoomClient({ onMessage: (m) => messages.push(m), onClose: (r) => (closed = r) });
  client.connect('SOLO', 'Arjun');
  return { client, messages, closedReason: () => closed };
}
const last = <T extends ServerMessage['t']>(messages: ServerMessage[], t: T) => messages.filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined;

afterEach(() => vi.useRealTimers());

describe('LocalRoomClient', () => {
  it('welcomes you as the host of a one-human room', async () => {
    const { messages, client } = open();
    await Promise.resolve();
    expect(messages.map((m) => m.t)).toEqual(['welcome', 'room']);
    const room = last(messages, 'room');
    expect(room?.hostId).toBe('me');
    expect(room?.pilots).toHaveLength(1);
    client.close();
  });
  it('adds bots on request and lists them as ready bots', async () => {
    const { messages, client } = open();
    await Promise.resolve();
    client.send({ t: 'bots', count: 3, skill: 'hard' });
    const room = last(messages, 'room');
    expect(room?.bots).toEqual({ count: 3, skill: 'hard' });
    expect(room?.pilots.filter((p) => p.isBot && p.isReady)).toHaveLength(3);
    client.close();
  });
  it('will not start alone, then runs the countdown and says GO by itself', async () => {
    vi.useFakeTimers();
    const { messages, client } = open();
    await Promise.resolve();
    client.send({ t: 'start' });
    expect(last(messages, 'error')?.message).toMatch(/bot/i);
    client.send({ t: 'bots', count: 2, skill: 'easy' });
    client.send({ t: 'start' });
    expect(last(messages, 'countdown')?.startsInMs).toBe(ROOMS.countdownMs);
    expect(messages.some((m) => m.t === 'go')).toBe(false);
    vi.advanceTimersByTime(ROOMS.countdownMs + 50);
    expect(messages.some((m) => m.t === 'go')).toBe(true);
    client.close();
  });
  it('ranks a bot that the host reports as finished, and ends the race when the human has finished too', async () => {
    vi.useFakeTimers();
    const { messages, client } = open();
    await Promise.resolve();
    client.send({ t: 'bots', count: 1, skill: 'hard' });
    client.send({ t: 'laps', laps: 1 });
    client.send({ t: 'start' });
    vi.advanceTimersByTime(ROOMS.countdownMs + 50);
    client.send({ t: 'botProgress', rows: [{ id: 'bot-1', gates: 13, timeMs: 47_000, dNextM: 0 }] });
    expect(last(messages, 'finish')?.id).toBe('bot-1');
    // The human flies the gates (a second apart is the fastest the room accepts).
    for (let i = 0; i < 13; i++) {
      vi.advanceTimersByTime(1100);
      client.send({ t: 'gate', index: i % 12 });
    }
    const results = last(messages, 'results');
    expect(results?.rows.map((r) => r.id)).toEqual(['me', 'bot-1']);
    client.close();
  });
  it('delivers in order even when a handler answers at once: the newer room never gets overtaken by the older one', async () => {
    const seen: number[] = [];
    let client!: LocalRoomClient;
    client = new LocalRoomClient({
      onMessage: (m) => {
        if (m.t === 'welcome') client.send({ t: 'bots', count: 2, skill: 'easy' });
        if (m.t === 'room') seen.push(m.pilots.length);
      },
      onClose: () => undefined,
    });
    client.connect('SOLO', 'Arjun');
    await Promise.resolve();
    expect(seen).toEqual([1, 3]);
    client.close();
  });
  it('does nothing after it is closed', async () => {
    const { messages, client } = open();
    await Promise.resolve();
    client.close();
    const before = messages.length;
    client.send({ t: 'bots', count: 2, skill: 'easy' });
    expect(messages).toHaveLength(before);
    expect(client.isOpen).toBe(false);
    expect(BOTS.maxBots).toBeGreaterThan(0);
  });
});
