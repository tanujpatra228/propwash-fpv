/** Averages frames per second over about a second. */
export class FpsMeter {
  private elapsedS = 0;
  private frames = 0;

  /** Call once per frame. Returns the average when a full second has passed, otherwise null. */
  tick(dtS: number): number | null {
    this.elapsedS += dtS;
    this.frames++;
    if (this.elapsedS < 1) return null;
    const fps = this.frames / this.elapsedS;
    this.elapsedS = 0;
    this.frames = 0;
    return fps;
  }
}
