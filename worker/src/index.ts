import { ONLINE } from '../../src/config';
import { validateLapSubmission } from '../../src/core/lap-validation';
import { errorResponse, json, readJsonBody } from './http';
import { getGhost, leaderboard, submitLap } from './laps';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const GHOST_ID = /^[0-9a-f-]{36}$/;

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request, ONLINE.maxBodyBytes);
  if (body === null) return errorResponse('Bad or oversized request.', 400);
  const check = validateLapSubmission(body);
  if (!check.ok) return errorResponse(check.reason, 400);
  const result = await submitLap(env.DB, check.lap, Math.floor(Date.now() / 1000));
  if (result.status === 'too-soon') return errorResponse('Slow down: one lap every few seconds.', 429);
  return json({ id: result.id, rank: result.rank, isPersonalBest: result.status === 'saved' });
}

async function handleLeaderboard(url: URL, env: Env): Promise<Response> {
  const asked = Number(url.searchParams.get('limit') ?? ONLINE.leaderboardDefaultLimit);
  const limit = Number.isInteger(asked) ? Math.min(Math.max(asked, 1), ONLINE.leaderboardMaxLimit) : ONLINE.leaderboardDefaultLimit;
  return json(await leaderboard(env.DB, limit), 200, `public, max-age=${ONLINE.leaderboardCacheS}`);
}

async function handleGhost(id: string, env: Env): Promise<Response> {
  if (!GHOST_ID.test(id)) return errorResponse('Not found.', 404);
  const ghost = await getGhost(env.DB, id);
  if (!ghost) return errorResponse('Not found.', 404);
  return json(ghost, 200, `public, max-age=${ONLINE.ghostCacheS}, immutable`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Only /api/* reaches this Worker (see wrangler.jsonc); anything else is a static file.
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === '/api/laps') return request.method === 'POST' ? await handleSubmit(request, env) : errorResponse('Use POST.', 405);
      if (url.pathname === '/api/leaderboard') return request.method === 'GET' ? await handleLeaderboard(url, env) : errorResponse('Use GET.', 405);
      const ghost = /^\/api\/ghosts\/([^/]+)$/.exec(url.pathname);
      if (ghost?.[1]) return request.method === 'GET' ? await handleGhost(ghost[1], env) : errorResponse('Use GET.', 405);
      return errorResponse('Not found.', 404);
    } catch (error) {
      console.error('API error', error);
      return errorResponse('Something went wrong. Try again in a moment.', 500);
    }
  },
} satisfies ExportedHandler<Env>;
