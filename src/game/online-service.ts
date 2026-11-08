import { ACTIVE_TRACK_ID, TRACK_DEFS } from '../config';
import type { GhostData } from '../core/ghost-codec';
import type { ApiClient, BoardRow, RemoteGhost } from '../net/api-client';
import { clearPendingLap, loadPendingLap, MAX_ATTEMPTS, savePendingLap } from '../net/pending-lap';
import { getPilotId, loadPilotName, savePilotName } from '../net/pilot-identity';

export interface OnlineDeps {
  api: Pick<ApiClient, 'submitLap' | 'leaderboard' | 'ghost'>;
  /** Asks the player for a name; null means "not now". */
  askName(initial?: string): Promise<string | null>;
}

export interface NewBestLap {
  lapTimeS: number;
  splitsS: number[];
  ghost: GhostData;
}

/** What to tell the player after an upload attempt, or null to say nothing. */
export type UploadNotice = { title: string; subtitle: string } | null;

/**
 * Uploading personal bests and reading the leaderboard. A new best is written to a one-slot queue first, so it
 * survives a closed tab, no name yet, or no connection; it is sent whenever things line up.
 */
export class OnlineService {
  private hasDeclinedNameThisSession = false;
  private isUploading = false;

  constructor(private readonly deps: OnlineDeps) {}

  get pilotName(): string | null {
    return loadPilotName();
  }

  /** A new personal best: queue it and try to send it now. */
  async reportBestLap(lap: NewBestLap): Promise<UploadNotice> {
    savePendingLap({ ...lap, track: ACTIVE_TRACK_ID, attempts: 0 });
    return this.flush();
  }

  /** Sends the queued lap if there is one and a name. Safe to call any time; it never runs twice at once. */
  async flush(): Promise<UploadNotice> {
    if (this.isUploading) return null;
    const pending = loadPendingLap();
    if (!pending) return null;
    this.isUploading = true;
    try {
      const name = this.pilotName ?? (await this.askNameOnce());
      if (!name) return null; // stays queued until the player picks a name
      const outcome = await this.deps.api.submitLap({
        pilotId: getPilotId(),
        name,
        track: pending.track,
        worldVersion: TRACK_DEFS[pending.track].worldVersion,
        lapTimeS: pending.lapTimeS,
        splitsS: pending.splitsS,
        ghost: pending.ghost,
      });
      if (outcome.kind === 'saved') {
        clearPendingLap();
        return outcome.isPersonalBest ? { title: 'On the leaderboard', subtitle: `Rank ${outcome.rank}` } : null;
      }
      if (outcome.kind === 'rejected') {
        clearPendingLap(); // retrying a lap the server refused cannot help
        return { title: 'Lap not uploaded', subtitle: outcome.reason };
      }
      if (pending.attempts + 1 >= MAX_ATTEMPTS) clearPendingLap();
      else savePendingLap({ ...pending, attempts: pending.attempts + 1 });
      return null;
    } finally {
      this.isUploading = false;
    }
  }

  private async askNameOnce(): Promise<string | null> {
    if (this.hasDeclinedNameThisSession) return null;
    const name = await this.deps.askName();
    if (name === null) {
      this.hasDeclinedNameThisSession = true;
      return null;
    }
    savePilotName(name);
    return name;
  }

  /** From the leaderboard's "Change name". Sends any waiting lap under the new name. */
  async changeName(): Promise<string | null> {
    const name = await this.deps.askName(this.pilotName ?? '');
    if (name === null) return this.pilotName;
    savePilotName(name);
    this.hasDeclinedNameThisSession = false;
    void this.flush();
    return name;
  }

  leaderboard(): Promise<BoardRow[] | null> {
    return this.deps.api.leaderboard();
  }

  ghost(id: string): Promise<RemoteGhost | null> {
    return this.deps.api.ghost(id);
  }
}
