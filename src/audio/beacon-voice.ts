import { AUDIO } from '../config';
import type { AudioBus } from './audio-bus';
import type { BeaconCue } from './motor-model';

/** The free crown's shimmer: two detuned high tones with a slow tremolo, panned and faded by where the beacon is. */
export class BeaconVoice {
  private readonly gain: GainNode;
  private readonly pan: StereoPannerNode;
  private readonly depth: GainNode;

  constructor(bus: AudioBus) {
    const { context } = bus;
    const b = AUDIO.crown.beacon;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.pan = context.createStereoPanner();
    this.gain.connect(this.pan).connect(bus.ambience);
    for (const hz of [b.hzA, b.hzB]) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = hz;
      oscillator.connect(this.gain);
      oscillator.start();
    }
    // The shimmer: a tremolo added on top of the volume.
    const tremolo = context.createOscillator();
    tremolo.frequency.value = b.shimmerHz;
    this.depth = context.createGain();
    this.depth.gain.value = 0;
    tremolo.connect(this.depth).connect(this.gain.gain);
    tremolo.start();
  }

  /** `cue` is null when there is no free crown to hear. */
  update(context: AudioContext, cue: BeaconCue | null, isAudible: boolean): void {
    const now = context.currentTime;
    const volume = cue && isAudible ? cue.loudness01 * AUDIO.crown.beacon.maxVolume : 0;
    this.gain.gain.setTargetAtTime(volume * 0.6, now, AUDIO.smoothingS * 2);
    this.depth.gain.setTargetAtTime(volume * 0.4, now, AUDIO.smoothingS * 2);
    this.pan.pan.setTargetAtTime(cue?.pan ?? 0, now, AUDIO.smoothingS * 2);
  }
}
