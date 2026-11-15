import { AUDIO } from '../config';
import { clamp } from '../core/math';
import type { AudioBus } from './audio-bus';
import { motorVoiceTone } from './motor-model';
import { airAbsorption, dopplerRatio, remoteThrottle, remoteVolume, type Vec3 } from './positional-model';

/** What the sound needs to know about one other pilot's drone. */
export interface RemoteSoundSource {
  id: string;
  position: Vec3;
  velocity: Vec3;
}

/** One other pilot's motor, placed in 3D: two detuned sawtooths and a harsh fifth, panned (HRTF), faded and dulled by distance, bent by Doppler. */
export class RemoteVoice {
  private readonly oscillators: OscillatorNode[] = [];
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;
  private readonly panner: PannerNode;
  /** Seconds since this pilot was last in the list. */
  unseenS = 0;
  private isPlaced = false;

  constructor(private readonly bus: AudioBus) {
    const { context } = bus;
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = AUDIO.filterQ;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.panner = context.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = AUDIO.remote.refDistanceM;
    this.panner.rolloffFactor = AUDIO.remote.rolloff;
    this.panner.maxDistance = AUDIO.remote.rangeM;
    this.filter.connect(this.gain).connect(this.panner).connect(bus.motors);
    for (const type of ['sawtooth', 'sawtooth', 'square'] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.connect(this.filter);
      oscillator.start();
      this.oscillators.push(oscillator);
    }
  }

  /** Aims the voice at where the drone is now. `isAudible` is false when sound is off. */
  update(source: RemoteSoundSource, listener: Vec3, listenerVelocity: Vec3, isAudible: boolean): void {
    const { context } = this.bus;
    const now = context.currentTime;
    const { position, velocity } = source;
    const distance = Math.hypot(position.x - listener.x, position.y - listener.y, position.z - listener.z);
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const throttle = remoteThrottle(speed, velocity.y);
    const tone = motorVoiceTone(throttle, throttle, 0);
    const bend = dopplerRatio(listener, listenerVelocity, position, velocity);
    const hz = tone.hz * bend;
    const smoothing = AUDIO.smoothingS;
    if (!this.isPlaced) {
      // The first time, start where the drone is instead of gliding there from the origin.
      this.panner.positionX.value = position.x;
      this.panner.positionY.value = position.y;
      this.panner.positionZ.value = position.z;
      for (const oscillator of this.oscillators) oscillator.frequency.value = hz;
      this.isPlaced = true;
    }
    const [sawA, sawB, square] = this.oscillators;
    sawA?.frequency.setTargetAtTime(hz, now, smoothing);
    sawB?.frequency.setTargetAtTime(hz * AUDIO.remote.detune, now, smoothing);
    square?.frequency.setTargetAtTime(hz * AUDIO.motorHarmonicRatio, now, smoothing);
    this.filter.frequency.setTargetAtTime(clamp(tone.cutoffHz * airAbsorption(distance), 200, 12_000), now, smoothing);
    this.gain.gain.setTargetAtTime(isAudible ? remoteVolume(throttle, distance) : 0, now, smoothing);
    this.panner.positionX.setTargetAtTime(position.x, now, 0.03);
    this.panner.positionY.setTargetAtTime(position.y, now, 0.03);
    this.panner.positionZ.setTargetAtTime(position.z, now, 0.03);
    this.unseenS = 0;
  }

  /** Fades out (used when the pilot is not in the list this frame). */
  silence(): void {
    this.gain.gain.setTargetAtTime(0, this.bus.context.currentTime, AUDIO.smoothingS);
  }

  dispose(): void {
    for (const oscillator of this.oscillators) {
      oscillator.stop();
      oscillator.disconnect();
    }
    this.filter.disconnect();
    this.gain.disconnect();
    this.panner.disconnect();
  }
}
