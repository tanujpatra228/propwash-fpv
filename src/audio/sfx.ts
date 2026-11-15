import { AUDIO } from '../config';
import type { AudioBus } from './audio-bus';
import { gatePitchHz } from './motor-model';

/** One-shot sounds. The game says what happened; this says how it sounds. */
export type SoundEvent =
  | { type: 'gate'; streak: number }
  | { type: 'tick' }
  | { type: 'go' }
  | { type: 'lap'; isBest: boolean }
  | { type: 'batteryBeep' };

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
}
