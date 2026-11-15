import { AUDIO } from '../config';
import type { AudioBus } from './audio-bus';
import { windTone } from './motor-model';

/** Wind rushing past (on the Ambience bus) and prop wash, a rough tremolo buzz (on the Motors bus). */
export class WindVoice {
  private readonly windBand: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly washGain: GainNode;
  private readonly tremoloDepth: GainNode;

  constructor(bus: AudioBus) {
    const { context } = bus;
    this.windBand = context.createBiquadFilter();
    this.windBand.type = 'bandpass';
    this.windBand.frequency.value = AUDIO.windBandHz;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0;
    const windNoise = bus.createNoise();
    windNoise.connect(this.windBand).connect(this.windGain).connect(bus.ambience);
    windNoise.start();

    const washBand = context.createBiquadFilter();
    washBand.type = 'bandpass';
    washBand.frequency.value = AUDIO.washBandHz;
    washBand.Q.value = AUDIO.washQ;
    this.washGain = context.createGain();
    this.washGain.gain.value = 0;
    const washNoise = bus.createNoise();
    washNoise.connect(washBand).connect(this.washGain).connect(bus.motors);
    washNoise.start();
    // The buzz: a fast tremolo added on top of the wash volume.
    const tremolo = context.createOscillator();
    tremolo.frequency.value = AUDIO.washTremoloHz;
    this.tremoloDepth = context.createGain();
    this.tremoloDepth.gain.value = 0;
    tremolo.connect(this.tremoloDepth).connect(this.washGain.gain);
    tremolo.start();
  }

  update(context: AudioContext, speedMps: number, wash01: number, windLoudness: number, isAudible: boolean, isWashAudible: boolean): void {
    const now = context.currentTime;
    const wind = windTone(speedMps);
    this.windBand.frequency.setTargetAtTime(wind.bandHz, now, AUDIO.smoothingS * 2);
    this.windGain.gain.setTargetAtTime(isAudible ? wind.volume * windLoudness : 0, now, AUDIO.smoothingS * 2);
    const wash = isAudible && isWashAudible ? wash01 * AUDIO.washVolume : 0;
    this.washGain.gain.setTargetAtTime(wash * 0.55, now, AUDIO.smoothingS);
    this.tremoloDepth.gain.setTargetAtTime(wash * 0.45, now, AUDIO.smoothingS);
  }
}
