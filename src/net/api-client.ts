import { ACTIVE_TRACK_ID, isTrackId, ONLINE, type TrackId } from '../config';
import type { GhostData } from '../core/ghost-codec';
import type { LapSubmission } from '../core/lap-validation';

export interface BoardRow {
  id: string;
  name: string;
  lapTimeS: number;
  rank: number;
}

export interface RemoteGhost {
  /** The track the lap was flown on. */
  track: TrackId;
  name: string;
  lapTimeS: number;
  splitsS: number[];
  ghost: GhostData;
}

/** What happened to a submitted lap. `retry` means "not now": offline, rate-limited or a server hiccup. */
export type SubmitOutcome =
  | { kind: 'saved'; id: string; rank: number; isPersonalBest: boolean }
  | { kind: 'rejected'; reason: string }
  | { kind: 'retry' };

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isBoardRow(v: unknown): v is BoardRow {
  return isRecord(v) && typeof v['id'] === 'string' && typeof v['name'] === 'string' && isNumber(v['lapTimeS']) && isNumber(v['rank']);
}

function isRemoteGhost(v: unknown): v is RemoteGhost {
  if (!isRecord(v) || !isTrackId(v['track']) || typeof v['name'] !== 'string' || !isNumber(v['lapTimeS']) || !Array.isArray(v['splitsS'])) return false;
  const ghost = v['ghost'];
  return isRecord(ghost) && isNumber(ghost['hz']) && typeof ghost['data'] === 'string';
}

/**
 * The game's only door to the server. It never throws and never waits long: every call has a timeout and returns a
 * plain result, so a slow or missing server can never freeze or break the game.
 */
export class ApiClient {
  constructor(
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
    private readonly timeoutMs: number = ONLINE.requestTimeoutMs,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(path, { ...init, signal: controller.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return (await response.json()) as unknown;
    } catch {
      return null;
    }
  }

  async submitLap(lap: LapSubmission): Promise<SubmitOutcome> {
    const response = await this.request('/api/laps', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lap) });
    if (!response) return { kind: 'retry' };
    const body = await this.readJson(response);
    if (response.ok && isRecord(body) && typeof body['id'] === 'string' && isNumber(body['rank'])) {
      return { kind: 'saved', id: body['id'], rank: body['rank'], isPersonalBest: body['isPersonalBest'] === true };
    }
    // The server said no because of the lap itself (400): retrying would not help. Everything else may pass later.
    if (response.status === 400 && isRecord(body) && typeof body['error'] === 'string') return { kind: 'rejected', reason: body['error'] };
    return { kind: 'retry' };
  }

  /** The fastest laps, or null when the server cannot be reached. */
  async leaderboard(limit: number = ONLINE.leaderboardDefaultLimit): Promise<BoardRow[] | null> {
    const response = await this.request(`/api/leaderboard?limit=${limit}&track=${ACTIVE_TRACK_ID}`);
    if (!response?.ok) return null;
    const body = await this.readJson(response);
    return Array.isArray(body) && body.every(isBoardRow) ? body : null;
  }

  /** One lap's ghost, or null when it is gone or the server cannot be reached. */
  async ghost(id: string): Promise<RemoteGhost | null> {
    const response = await this.request(`/api/ghosts/${encodeURIComponent(id)}`);
    if (!response?.ok) return null;
    const body = await this.readJson(response);
    return isRemoteGhost(body) ? body : null;
  }
}
