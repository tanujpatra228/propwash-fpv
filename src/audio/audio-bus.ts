import { AUDIO } from '../config';
import { levelToGain, type AudioLevels } from '../core/audio-settings';

/**
 * The mixer. Three groups (motors, effects, ambience) feed the master gain, then a limiter, so stacked sounds never
 * clip. Group gains follow the settings sliders. Throws when Web Audio is missing; the caller treats that as "no sound".
 */
export class AudioBus {
  readonly context: AudioContext;
  readonly motors: GainNode;
  readonly effects: GainNode;
  readonly ambience: GainNode;
  private readonly master: GainNode;

  constructor(levels: Readonly<AudioLevels>) {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) throw new Error('Web Audio is not supported');
    this.context = new Context();
    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = AUDIO.limiter.thresholdDb;
    limiter.ratio.value = AUDIO.limiter.ratio;
    limiter.attack.value = AUDIO.limiter.attackS;
    limiter.release.value = AUDIO.limiter.releaseS;
    this.master = this.context.createGain();
    this.master.connect(limiter).connect(this.context.destination);
    this.motors = this.group();
    this.effects = this.group();
    this.ambience = this.group();
    this.setLevels(levels);
  }

  private group(): GainNode {
    const gain = this.context.createGain();
    gain.connect(this.master);
    return gain;
  }

  setLevels(levels: Readonly<AudioLevels>): void {
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(levelToGain(levels.master), now, AUDIO.smoothingS);
    this.motors.gain.setTargetAtTime(levelToGain(levels.motors), now, AUDIO.smoothingS);
    this.effects.gain.setTargetAtTime(levelToGain(levels.effects), now, AUDIO.smoothingS);
    this.ambience.gain.setTargetAtTime(levelToGain(levels.ambience), now, AUDIO.smoothingS);
  }

  /** Points the Web Audio listener (the ears) at the camera: where it is and which way it faces and leans. */
  setListener(position: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }, up: { x: number; y: number; z: number }): void {
    const l = this.context.listener;
    const now = this.context.currentTime;
    l.positionX.setTargetAtTime(position.x, now, 0.03);
    l.positionY.setTargetAtTime(position.y, now, 0.03);
    l.positionZ.setTargetAtTime(position.z, now, 0.03);
    l.forwardX.setTargetAtTime(forward.x, now, 0.03);
    l.forwardY.setTargetAtTime(forward.y, now, 0.03);
    l.forwardZ.setTargetAtTime(forward.z, now, 0.03);
    l.upX.setTargetAtTime(up.x, now, 0.03);
    l.upY.setTargetAtTime(up.y, now, 0.03);
    l.upZ.setTargetAtTime(up.z, now, 0.03);
  }

  /** Two seconds of white-ish noise, the same every time (no `Math.random`), for looping wind and wash. */
  createNoise(): AudioBufferSourceNode {
    const source = this.context.createBufferSource();
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    source.buffer = buffer;
    source.loop = true;
    return source;
  }
}
