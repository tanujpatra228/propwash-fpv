import { AUDIO } from '../config';
import type { AudioBus } from './audio-bus';
import { motorVoiceTone, type MotorLoads } from './motor-model';

interface Motor {
  saw: OscillatorNode;
  square: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

/** Four motors, each a sawtooth and a harsh fifth through its own low-pass filter, a little detuned so they beat. */
export class MotorVoice {
  private readonly motors: Motor[] = [];

  constructor(bus: AudioBus) {
    const { context } = bus;
    for (let i = 0; i < AUDIO.motorDetune.length; i++) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = AUDIO.filterQ;
      const gain = context.createGain();
      gain.gain.value = 0;
      filter.connect(gain).connect(bus.motors);
      const saw = context.createOscillator();
      saw.type = 'sawtooth';
      const square = context.createOscillator();
      square.type = 'square';
      for (const oscillator of [saw, square]) {
        oscillator.connect(filter);
        oscillator.start();
      }
      this.motors.push({ saw, square, filter, gain });
    }
  }

  /** `loudness` and `brightness` come from the camera; `fadeS` is how fast the volume follows (slow-ish normally, quick when cut). */
  update(context: AudioContext, loads: MotorLoads, throttle01: number, loudness: number, brightness: number, isAudible: boolean, fadeS: number): void {
    const now = context.currentTime;
    for (const [i, motor] of this.motors.entries()) {
      const tone = motorVoiceTone(loads[i] ?? 0, throttle01, i);
      motor.saw.frequency.setTargetAtTime(tone.hz, now, AUDIO.smoothingS);
      motor.square.frequency.setTargetAtTime(tone.hz * AUDIO.motorHarmonicRatio, now, AUDIO.smoothingS);
      motor.filter.frequency.setTargetAtTime(tone.cutoffHz * brightness, now, AUDIO.smoothingS);
      motor.gain.gain.setTargetAtTime(isAudible ? tone.volume * loudness : 0, now, fadeS);
    }
  }
}
