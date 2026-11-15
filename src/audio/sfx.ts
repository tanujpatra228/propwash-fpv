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
  | { type: 'crash'; reason: CrashSoundId; speedMps: number }
  | { type: 'crownClaimed' }
  | { type: 'crownLost' }
  | { type: 'crownOther' }
  | { type: 'crownDropped' }
  | { type: 'crownBack' }
  | { type: 'heartbeat' }
  | { type: 'crownPulse'; isKing: boolean };

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
      case 'crownClaimed': this.notes(AUDIO.crown.claim, 'triangle'); break;
      case 'crownLost': this.notes(AUDIO.crown.lost, 'sawtooth'); break;
      case 'crownOther': this.tone(AUDIO.crown.other.hz, 0, AUDIO.crown.other.durationS, AUDIO.crown.other.volume, 'sine'); break;
      case 'crownDropped': this.sweep(AUDIO.crown.dropped.fromHz, AUDIO.crown.dropped.toHz, 0, AUDIO.crown.dropped.durationS, AUDIO.crown.dropped.volume, 'triangle'); break;
      case 'crownBack': this.notes(AUDIO.crown.back, 'sine'); break;
      case 'heartbeat': {
        const h = AUDIO.crown.heartbeat;
        this.sweep(h.thumpHz * 1.5, h.thumpHz * 0.7, 0, h.thumpS, h.volume, 'sine');
        this.sweep(h.thumpHz * 1.3, h.thumpHz * 0.6, h.secondDelayS, h.thumpS, h.volume * 0.7, 'sine');
        break;
      }
      case 'crownPulse': {
        const p = AUDIO.crown.pulse;
        this.tone(event.isKing ? p.kingHz : p.chaserHz, 0, p.durationS, p.volume, event.isKing ? 'square' : 'sine');
        break;
      }
    }
  }

  /** A run of notes, one after the other. */
  private notes(spec: { notesHz: readonly number[]; gapS: number; noteS: number; volume: number }, type: OscillatorType): void {
    for (const [i, hz] of spec.notesHz.entries()) this.tone(hz, i * spec.gapS, spec.noteS, spec.volume, type);
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
    if (p.extra === 'rustle') for (const [i, delay] of c.rustle.delaysS.entries()) this.noise(c.rustle.hz, 0, c.rustle.q, c.rustle.durationS, c.rustle.volume * loud * c.rustle.fade ** i, delay);
    if (p.hasEarRinging && crashIntensity(speedMps) >= c.ringingFrom01) this.tone(c.ringing.hz, 0.05, c.ringing.durationS, c.ringing.volume, 'sine');
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
  private noise(hz: number, glideToHz: number, q: number, durationS: number, volume: number, delayS = 0): void {
    const { context, effects } = this.bus;
    const start = context.currentTime + delayS;
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
