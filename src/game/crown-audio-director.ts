import { beaconCue, heartbeatIntervalS, pulseIntervalS, type BeaconCue } from '../audio/motor-model';
import type { SoundEvent } from '../audio/sfx';
import type { ModeAudio } from './modes/mode';

export interface CrownAudioFrame {
  dtS: number;
  audio: ModeAudio;
  /** The pilot's drone: where it is and which way it faces. */
  x: number;
  y: number;
  z: number;
  yawRad: number;
}

export interface CrownAudioResult {
  events: SoundEvent[];
  beacon: BeaconCue | null;
}

/**
 * Turns Crown chase state into sound: a stinger when the crown changes hands, drops or returns, a heartbeat while the
 * pilot is king, a proximity pulse when a chaser closes in, and the beacon's shimmer while the crown lies free. It
 * decides nothing about the match; it only listens.
 */
export class CrownAudioDirector {
  private hasSeen = false;
  private holderId = '';
  private wasBeaconReady = false;
  private heartbeatTimerS = 0;
  private pulseTimerS = 0;

  update(f: CrownAudioFrame): CrownAudioResult {
    const { audio } = f;
    const events: SoundEvent[] = [];
    if (!audio.isRunning) {
      this.reset();
      return { events, beacon: null };
    }

    if (this.hasSeen && audio.holderId !== this.holderId) events.push(...this.holderChange(audio));
    const isBeaconReady = audio.beacon !== null;
    if (this.hasSeen && isBeaconReady && !this.wasBeaconReady) events.push({ type: 'crownBack' });
    this.hasSeen = true;
    this.holderId = audio.holderId;
    this.wasBeaconReady = isBeaconReady;

    const isKing = audio.holderId !== '' && audio.holderId === audio.myId;
    if (isKing) {
      this.heartbeatTimerS += f.dtS;
      if (this.heartbeatTimerS >= heartbeatIntervalS(audio.holdLeftMs)) {
        this.heartbeatTimerS = 0;
        events.push({ type: 'heartbeat' });
      }
    } else {
      this.heartbeatTimerS = 0;
    }

    // The king hears every close chaser; a chaser hears only their own closing in on the king.
    const isInvolved = isKing || (audio.holderId !== '' && audio.threatId === audio.myId);
    const interval = isInvolved ? pulseIntervalS(audio.threat01) : 0;
    if (interval > 0) {
      this.pulseTimerS += f.dtS;
      if (this.pulseTimerS >= interval) {
        this.pulseTimerS = 0;
        events.push({ type: 'crownPulse', isKing });
      }
    } else {
      this.pulseTimerS = 0;
    }

    return { events, beacon: audio.beacon ? beaconCue(f, f.yawRad, audio.beacon) : null };
  }

  private holderChange(audio: ModeAudio): SoundEvent[] {
    const wasMine = this.holderId !== '' && this.holderId === audio.myId;
    if (audio.holderId === audio.myId) return [{ type: 'crownClaimed' }];
    if (audio.holderId === '') return [{ type: 'crownDropped' }];
    return [{ type: wasMine ? 'crownLost' : 'crownOther' }];
  }

  reset(): void {
    this.hasSeen = false;
    this.holderId = '';
    this.wasBeaconReady = false;
    this.heartbeatTimerS = 0;
    this.pulseTimerS = 0;
  }
}
