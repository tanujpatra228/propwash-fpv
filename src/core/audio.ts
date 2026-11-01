import { AUDIO } from '../config';
import { clamp01 } from './math';
import { loadJson, saveJson } from './storage';

export interface MotorTone {
  motorHz: number;
  cutoffHz: number;
  motorVolume: number;
  windVolume: number;
}

/** What the motor and wind should sound like. Pure, so it is easy to test. */
export function motorTone(throttle01: number, speedMps: number): MotorTone {
  const t = clamp01(throttle01);
  return {
    motorHz: AUDIO.motorBaseHz + AUDIO.motorHzPerThrottle * t,
    cutoffHz: AUDIO.cutoffBaseHz + AUDIO.cutoffHzPerThrottle * t,
    motorVolume: AUDIO.volumeBase + AUDIO.volumePerThrottle * t,
    windVolume: Math.min(AUDIO.windMaxVolume, Math.max(0, speedMps / AUDIO.windSpeedForFullMps) * AUDIO.windVolumeAtFull),
  };
}

const SOUND_KEY = 'sound.v1';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

interface Graph {
  context: AudioContext;
  motorOscillators: OscillatorNode[];
  filter: BiquadFilterNode;
  motorGain: GainNode;
  windGain: GainNode;
}

/** Motor whine and wind, built with Web Audio. Off by default: browsers only allow sound after a click or key press. */
export class MotorSound {
  private graph: Graph | null = null;
  private isOn = false;
  private isUnavailable = false;

  constructor() {
    // A player who left it on last time hears it again after their first click.
    if (loadJson(SOUND_KEY, isBoolean) === true) {
      const resume = (): void => {
        window.removeEventListener('pointerdown', resume);
        this.setOn(true);
      };
      window.addEventListener('pointerdown', resume);
    }
  }

  get enabled(): boolean {
    return this.isOn;
  }

  get available(): boolean {
    return !this.isUnavailable;
  }

  toggle(): boolean {
    this.setOn(!this.isOn);
    return this.isOn;
  }

  setOn(isOn: boolean): void {
    if (isOn && !this.ensureGraph()) return;
    this.isOn = isOn;
    saveJson(SOUND_KEY, isOn);
    if (this.graph) {
      if (isOn) void this.graph.context.resume();
      else this.silence();
    }
  }

  /** Call every frame. `isActive` is false in menus; `areMotorsCut` fades the motor out when the battery dies. */
  update(throttle01: number, speedMps: number, isActive: boolean, areMotorsCut: boolean): void {
    const g = this.graph;
    if (!g) return;
    const now = g.context.currentTime;
    const tone = motorTone(throttle01, speedMps);
    const isAudible = this.isOn && isActive;
    const smoothing = AUDIO.smoothingS;
    for (const [index, oscillator] of g.motorOscillators.entries()) {
      oscillator.frequency.setTargetAtTime(tone.motorHz * (index === 0 ? 1 : AUDIO.motorHarmonicRatio), now, smoothing);
    }
    g.filter.frequency.setTargetAtTime(tone.cutoffHz, now, smoothing);
    g.motorGain.gain.setTargetAtTime(isAudible && !areMotorsCut ? tone.motorVolume : 0, now, areMotorsCut ? AUDIO.motorsCutFadeS / 3 : smoothing);
    // Wind keeps going while the drone falls.
    g.windGain.gain.setTargetAtTime(isAudible ? tone.windVolume : 0, now, smoothing * 2);
  }

  private silence(): void {
    const g = this.graph;
    if (!g) return;
    g.motorGain.gain.setTargetAtTime(0, g.context.currentTime, 0.02);
    g.windGain.gain.setTargetAtTime(0, g.context.currentTime, 0.02);
  }

  /** Creates every Web Audio node once, on first use. Returns false when audio is blocked or missing. */
  private ensureGraph(): boolean {
    if (this.graph) return true;
    if (this.isUnavailable) return false;
    try {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) throw new Error('Web Audio is not supported');
      const context = new Context();
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = AUDIO.filterQ;
      const motorGain = context.createGain();
      motorGain.gain.value = 0;
      filter.connect(motorGain).connect(context.destination);

      const motorOscillators = [context.createOscillator(), context.createOscillator()];
      const [saw, square] = motorOscillators;
      if (!saw || !square) throw new Error('Oscillators missing');
      saw.type = 'sawtooth';
      square.type = 'square';
      for (const oscillator of motorOscillators) {
        oscillator.connect(filter);
        oscillator.start();
      }

      const noise = context.createBufferSource();
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i * 12.9898) * 43758.5453 % 1; // deterministic noise, no Math.random
      noise.buffer = buffer;
      noise.loop = true;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = AUDIO.windBandHz;
      const windGain = context.createGain();
      windGain.gain.value = 0;
      noise.connect(band).connect(windGain).connect(context.destination);
      noise.start();

      this.graph = { context, motorOscillators, filter, motorGain, windGain };
      return true;
    } catch (error) {
      console.warn('Motor sound unavailable.', error);
      this.isUnavailable = true;
      return false;
    }
  }
}

