import { ACESFilmicToneMapping, PCFShadowMap, WebGLRenderer, type Camera, type Scene } from 'three';
import { RENDER } from '../config';

/** Owns the WebGL renderer. The post-processing chain (bloom, FPV lens) is added here in M5. */
export class GameRenderer {
  readonly webgl: WebGLRenderer;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.webgl = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.webgl.toneMapping = ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = RENDER.toneMappingExposure;
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = PCFShadowMap;
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  get aspect(): number {
    return this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
  }

  render(scene: Scene, camera: Camera): void {
    this.webgl.render(scene, camera);
  }

  readonly resize = (): void => {
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    this.webgl.setSize(window.innerWidth, window.innerHeight, false);
  };
}
