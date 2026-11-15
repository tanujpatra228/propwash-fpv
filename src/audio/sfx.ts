import { AUDIO, type CrashSoundId } from '../config';
import type { AudioBus } from './audio-bus';
import { crashIntensity, crashProfile, crashVolume, gatePitchHz } from './motor-model';

/** One-shot sounds. The game says what happened; this says how it sounds. */
export type SoundEvent =
  | { type: 'gate'; streak: number }
  | { type: 'tick' }
  | { type: 'go' }
  | { type: 'lap'; isBest: boolean }
  | { type: 'batteryBeep' }
  | { type: 'crash'; reason: CrashSoundId; speedMps: number };

/** Plays one-shot sounds on the Effects bus: short enveloped tones, no samples. */
export class Sfx {
  constructor(private readonly bus: AudioBus) {}

  play(event: SoundEvent): void {
    switch (event.type) {
      case 'gate': {
        const hz = gatePitchHz(event.streak);
        this.tone(hz, 0, AUDIO.gate.decayS, AUDIO.gate.volume, 'sine');
        this.tone(hz * 2, 0, AUDIO.gate.decayS * 0.6, AUDIO.gate.volume * 0.3, 'triangle');
        break;
      }
      case 'tick': this.tone(AUDIO.countdown.tickHz, 0, AUDIO.countdown.tickS, AUDIO.countdown.volume, 'sine'); break;
      case 'go': this.tone(AUDIO.countdown.goHz, 0, AUDIO.countdown.goS, AUDIO.countdown.volume, 'triangle'); break;
      case 'lap': {
        const notes = event.isBest ? AUDIO.lap.bestNotesHz : AUDIO.lap.notesHz;
        for (const [i, hz] of notes.entries()) this.tone(hz, i * AUDIO.lap.noteGapS, AUDIO.lap.noteS, AUDIO.lap.volume, 'triangle');
        break;
      }
      case 'batteryBeep': this.tone(AUDIO.batteryBeep.hz, 0, AUDIO.batteryBeep.beepS, AUDIO.batteryBeep.volume, 'square'); break;
      case 'crash': this.crash(event.reason, event.speedMps); break;
    }
  }

  /** A tone with a 5 ms attack and an exponential fade, `delayS` from now. */
  private tone(hz: number, delayS: number, durationS: number, volume: number, type: OscillatorType): void {
    const { context, effects } = this.bus;
    const start = context.currentTime + delayS;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = hz;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationS);
    oscillator.connect(gain).connect(effects);
    oscillator.start(start);
    oscillator.stop(start + durationS + 0.02);
  }

  /** What was hit decides the sound; how fast decides the loudness. The motors cut out underneath it all. */
  private crash(reason: CrashSoundId, speedMps: number): void {
    const c = AUDIO.crash;
    const p = crashProfile(reason);
    const loud = crashVolume(speedMps);
    this.sweep(c.cutWhine.fromHz, c.cutWhine.toHz, 0, c.cutWhine.durationS, c.cutWhine.volume, 'sawtooth');
    this.sweep(p.thumpHz * 1.6, p.thumpHz * 0.6, 0, p.thumpS, p.thumpVolume * loud, 'sine');
    this.noise(p.noiseHz, p.noiseGlideToHz, p.noiseQ, p.noiseS, p.noiseVolume * loud);
    for (const hz of p.ringsHz) this.tone(hz, 0, p.ringS, (p.ringVolume * loud) / p.ringsHz.length, 'sine');
    if (p.extra === 'horn') for (const hz of c.horn.hz) this.tone(hz, c.horn.delayS, c.horn.durationS, c.horn.volume * loud, 'sawtooth');
    if (p.extra === 'bubbles') for (const delay of c.bubbles.delaysS) this.sweep(c.bubbles.fromHz, c.bubbles.toHz, delay, c.bubbles.durationS, c.bubbles.volume * loud, 'sine');
    if (crashIntensity(speedMps) >= c.ringingFrom01) this.tone(c.ringing.hz, 0.05, c.ringing.durationS, c.ringing.volume, 'sine');
  }

  /** A tone gliding from one pitch to another. */
  private sweep(fromHz: number, toHz: number, delayS: number, durationS: number, volume: number, type: OscillatorType): void {
    const { context, effects } = this.bus;
    const start = context.currentTime + delayS;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromHz, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, toHz), start + durationS);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationS);
    oscillator.connect(gain).connect(effects);
    oscillator.start(start);
    oscillator.stop(start + durationS + 0.02);
  }

  /** A burst of band-passed noise that fades out, optionally gliding to another band. */
  private noise(hz: number, glideToHz: number, q: number, durationS: number, volume: number): void {
    const { context, effects } = this.bus;
    const start = context.currentTime;
    const source = this.bus.createNoise();
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = q;
    band.frequency.setValueAtTime(hz, start);
    if (glideToHz > 0) band.frequency.exponentialRampToValueAtTime(glideToHz, start + durationS);
    const gain = context.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationS);
    source.connect(band).connect(gain).connect(effects);
    source.start(start);
    source.stop(start + durationS + 0.02);
  }
}
