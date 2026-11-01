export interface ResolutionSettings {
  /** Never render below this fraction of the full resolution. */
  minScale: number;
  /** Below this frame rate the picture gets a little blurrier. */
  lowerBelowFps: number;
  /** At or above this frame rate (for `raiseAfterSamples` in a row) the picture sharpens again. */
  raiseAtFps: number;
  raiseAfterSamples: number;
  lowerStep: number;
  raiseStep: number;
}

export const DEFAULT_RESOLUTION: Readonly<ResolutionSettings> = {
  minScale: 0.6,
  lowerBelowFps: 55,
  raiseAtFps: 59,
  raiseAfterSamples: 4,
  lowerStep: 0.07,
  raiseStep: 0.04,
};

/**
 * Dynamic resolution: trades sharpness for smoothness when the frame rate sags, and wins it back when there is
 * headroom. Feed it one average frame rate per second. Pure, so it is easy to test.
 */
export class ResolutionController {
  scale = 1;
  private goodSamples = 0;

  constructor(private readonly settings: Readonly<ResolutionSettings> = DEFAULT_RESOLUTION) {}

  /** Returns the new scale when it changed, otherwise null. */
  update(fps: number): number | null {
    const s = this.settings;
    const before = this.scale;
    if (fps < s.lowerBelowFps) {
      this.goodSamples = 0;
      this.scale = Math.max(s.minScale, this.scale - s.lowerStep);
    } else if (fps >= s.raiseAtFps) {
      this.goodSamples++;
      if (this.goodSamples >= s.raiseAfterSamples) {
        this.goodSamples = 0;
        this.scale = Math.min(1, this.scale + s.raiseStep);
      }
    } else {
      this.goodSamples = 0;
    }
    return this.scale === before ? null : this.scale;
  }

  reset(): void {
    this.scale = 1;
    this.goodSamples = 0;
  }
}
