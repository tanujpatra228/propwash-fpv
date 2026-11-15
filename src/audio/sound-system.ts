import { AUDIO, type SoundCameraId } from '../config';
import { loadAudioLevels, saveAudioLevels, type AudioLevels } from '../core/audio-settings';
import { loadJson, saveJson } from '../core/storage';
import { AudioBus } from './audio-bus';
import { BeaconVoice } from './beacon-voice';
import { cameraMix, motorLoads, washLevel, type BeaconCue } from './motor-model';
import { MotorVoice } from './motor-voice';
import { Sfx, type SoundEvent } from './sfx';
import { WindVoice } from './wind-voice';

const SOUND_KEY = 'sound.v1';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** What the sound needs to know about the drone each frame. */
export interface SoundFrame {
  camera: SoundCameraId;
  dtS: number;
  /** False in menus and during the crash freeze. */
  isActive: boolean;
  /** True when the battery has died: the motors fade out (wind and falling continue). */
  areMotorsCut: boolean;
  throttle01: number;
  speedMps: number;
  /** Positive when sinking. */
  sinkRateMps: number;
  pitchRad: number;
  rollRad: number;
  yawRateRadps: number;
}

interface Graph {
  bus: AudioBus;
  motors: MotorVoice;
  wind: WindVoice;
  sfx: Sfx;
  beacon: BeaconVoice;
}

/**
 * The one sound object the game holds: the mixer, the four motors, wind and prop wash, and one-shot effects. Off by
 * default (browsers only allow sound after a click or key press); the choice is saved. Never throws: if Web Audio is
 * blocked or missing, `available` turns false and every call does nothing.
 */
export class SoundSystem {
  private graph: Graph | null = null;
  private isOn = false;
  private isUnavailable = false;
  private levels: AudioLevels = loadAudioLevels();
  private previous = { pitchRad: 0, rollRad: 0, throttle01: 0, isKnown: false };

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

  get currentLevels(): Readonly<AudioLevels> {
    return this.levels;
  }

  toggle(): boolean {
    this.setOn(!this.isOn);
    return this.isOn;
  }

  setOn(isOn: boolean): void {
    if (isOn && !this.ensureGraph()) return;
    this.isOn = isOn;
    saveJson(SOUND_KEY, isOn);
    if (this.graph && isOn) void this.graph.bus.context.resume();
  }

  /** The mixer sliders. Saved at once; heard at once when sound is on. */
  setLevels(levels: AudioLevels): void {
    this.levels = levels;
    saveAudioLevels(levels);
    this.graph?.bus.setLevels(levels);
  }

  /** A one-shot sound. Does nothing when sound is off or blocked. */
  play(event: SoundEvent): void {
    if (this.isOn) this.graph?.sfx.play(event);
  }

  /** The free crown's shimmer (null when there is none). Call every frame in Crown chase. */
  updateBeacon(cue: BeaconCue | null): void {
    const g = this.graph;
    if (g) g.beacon.update(g.bus.context, cue, this.isOn);
  }

  /** Call every frame. */
  update(f: SoundFrame): void {
    const g = this.graph;
    const rateDt = Math.max(1e-3, f.dtS);
    const p = this.previous;
    const pitchRate = p.isKnown ? (f.pitchRad - p.pitchRad) / rateDt : 0;
    const rollRate = p.isKnown ? (f.rollRad - p.rollRad) / rateDt : 0;
    const throttleRate = p.isKnown ? (f.throttle01 - p.throttle01) / rateDt : 0;
    this.previous = { pitchRad: f.pitchRad, rollRad: f.rollRad, throttle01: f.throttle01, isKnown: true };
    if (!g) return;
    const isAudible = this.isOn && f.isActive;
    const mix = cameraMix(f.camera);
    const loads = motorLoads({ throttle01: f.throttle01, pitchRad: f.pitchRad, rollRad: f.rollRad, pitchRateRadps: pitchRate, rollRateRadps: rollRate, yawRateRadps: f.yawRateRadps });
    const isFlying = isAudible && !f.areMotorsCut;
    g.motors.update(g.bus.context, loads, f.throttle01, mix.motor, mix.brightness, isFlying, f.areMotorsCut ? AUDIO.motorsCutFadeS / 3 : AUDIO.smoothingS);
    g.wind.update(g.bus.context, f.speedMps, washLevel(f.sinkRateMps, throttleRate), mix.wind, isAudible, isFlying);
  }

  /** Creates every Web Audio node once, on first use. Returns false when audio is blocked or missing. */
  private ensureGraph(): boolean {
    if (this.graph) return true;
    if (this.isUnavailable) return false;
    try {
      const bus = new AudioBus(this.levels);
      this.graph = { bus, motors: new MotorVoice(bus), wind: new WindVoice(bus), sfx: new Sfx(bus), beacon: new BeaconVoice(bus) };
      return true;
    } catch (error) {
      console.warn('Sound unavailable.', error);
      this.isUnavailable = true;
      return false;
    }
  }
}
