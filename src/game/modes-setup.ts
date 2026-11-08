import type { LiveController } from './live-controller';
import { BatteryChallenge } from './modes/battery-challenge';
import { FreeFlight } from './modes/free-flight';
import { LiveRace } from './modes/live-race';
import type { GameMode, ModeHost, ModeId } from './modes/mode';
import { TimeTrial } from './modes/time-trial';
import { TrainingMode } from './modes/training';
import { loadCompletedLessons, saveCompletedLessons } from './training-progress';

export interface Modes {
  all: Record<ModeId, GameMode>;
  /** Kept typed because the game configures them before starting (opponent ghost, chosen challenge). */
  trial: TimeTrial;
  challenge: BatteryChallenge;
}

/** Builds one of every game mode on the same host, and connects the live race to its room controller. */
export function createModes(host: ModeHost, live: LiveController, isFreeDrainOn: () => boolean): Modes {
  const trial = new TimeTrial(host);
  const challenge = new BatteryChallenge(host);
  const liveRace = new LiveRace(host, live);
  live.attachMode(liveRace);
  return {
    trial,
    challenge,
    all: {
      live: liveRace,
      challenge,
      free: new FreeFlight(host, isFreeDrainOn),
      trial,
      training: new TrainingMode(host, { load: loadCompletedLessons, save: saveCompletedLessons }),
    },
  };
}
