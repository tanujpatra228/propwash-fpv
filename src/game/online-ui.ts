import { ApiClient, type RemoteGhost } from '../net/api-client';
import { askPilotName } from '../ui/name-prompt';
import { LeaderboardScreen } from '../ui/leaderboard-screen';
import { OnlineService, type NewBestLap, type UploadNotice } from './online-service';

/** The game's side of the conversation: pause the controls while a dialog is open, show a message, start a race. */
export interface OnlineUiHost {
  pauseInput(): void;
  resumeInput(): void;
  notify(title: string, subtitle: string): void;
  raceGhost(ghost: RemoteGhost): void;
}

/** Delay before the "On the leaderboard" note, so it does not cover the "New best lap" banner. */
const NOTICE_DELAY_MS = 2800;

/** Connects the online service to the name prompt, the leaderboard screen and the shareable links. */
export class OnlineUi {
  private readonly service: OnlineService;
  private readonly screen: LeaderboardScreen;

  constructor(private readonly host: OnlineUiHost) {
    this.service = new OnlineService({
      api: new ApiClient(),
      askName: async (initial) => {
        host.pauseInput();
        try {
          return await askPilotName(initial ?? '');
        } finally {
          host.resumeInput();
        }
      },
    });
    this.screen = new LeaderboardScreen({
      onRace: (id) => void this.race(id),
      onCopyLink: (id) => this.copyLink(id),
      onChangeName: () => void this.service.changeName().then((name) => this.screen.setPilotName(name)),
      onClose: () => host.resumeInput(),
    });
  }

  private notifyLater(notice: UploadNotice): void {
    if (notice) setTimeout(() => this.host.notify(notice.title, notice.subtitle), NOTICE_DELAY_MS);
  }

  reportBestLap(lap: NewBestLap): void {
    void this.service.reportBestLap(lap).then((notice) => this.notifyLater(notice));
  }

  /** Try to send any lap that is waiting (offline earlier, no name yet). */
  flush(): void {
    void this.service.flush().then((notice) => this.notifyLater(notice));
  }

  async openLeaderboard(): Promise<void> {
    this.host.pauseInput();
    this.screen.setPilotName(this.service.pilotName);
    this.screen.showMessage('Loading…');
    this.screen.show();
    const rows = await this.service.leaderboard();
    if (rows) this.screen.showRows(rows);
    else this.screen.showMessage('Offline. Check your connection and try again later.');
  }

  private async race(id: string): Promise<boolean> {
    const ghost = await this.service.ghost(id);
    if (!ghost) {
      this.screen.showMessage('That lap is no longer available. Open the leaderboard again.');
      this.screen.show();
      return false;
    }
    this.host.raceGhost(ghost);
    return true;
  }

  /** For `?ghost=<id>` links. */
  raceFromLink(id: string): Promise<boolean> {
    return this.race(id);
  }

  private copyLink(id: string): void {
    const url = `${window.location.origin}/?ghost=${encodeURIComponent(id)}`;
    void navigator.clipboard?.writeText(url).catch(() => window.prompt('Copy this link', url));
  }
}
