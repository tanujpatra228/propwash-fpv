import { ACESFilmicToneMapping, PCFShadowMap, Scene, Vector2, WebGLRenderer, type Camera } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { LENS, RENDER } from '../config';
import { applyLens, createFpvPass, type LensSettings } from './fpv-shader';

/** Owns the WebGL renderer and the post chain: render, bloom, tone-map, FPV lens. */
export class GameRenderer {
  readonly webgl: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly fpvPass = createFpvPass();
  private readonly bloomPass: UnrealBloomPass;
  private pixelRatioCap = 1;
  private readonly lens: LensSettings = { fisheye: 0, vignette: 0.35, grain: 0.012, staticAmount: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.webgl = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.webgl.toneMapping = ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = RENDER.toneMappingExposure;
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = PCFShadowMap;

    this.composer = new EffectComposer(this.webgl);
    this.renderPass = new RenderPass(new Scene(), null as unknown as Camera);
    this.bloomPass = new UnrealBloomPass(
      new Vector2(window.innerWidth, window.innerHeight),
      LENS.bloom.strength,
      LENS.bloom.radius,
      LENS.bloom.threshold,
    );
    this.bloomPass.enabled = LENS.bloom.isEnabled;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.fpvPass);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  get aspect(): number {
    return this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
  }

  /** Lens look for the next frame. Static comes from game rules; the shader only draws it. */
  setLens(next: Readonly<LensSettings>): void {
    Object.assign(this.lens, next);
  }

  /** Dev-only: try look settings from the browser console or tests. */
  debugLook(look: { exposure?: number; bloomStrength?: number; bloomThreshold?: number; bloomRadius?: number; bloom?: boolean }): void {
    if (look.exposure !== undefined) this.webgl.toneMappingExposure = look.exposure;
    if (look.bloomStrength !== undefined) this.bloomPass.strength = look.bloomStrength;
    if (look.bloomThreshold !== undefined) this.bloomPass.threshold = look.bloomThreshold;
    if (look.bloomRadius !== undefined) this.bloomPass.radius = look.bloomRadius;
    if (look.bloom !== undefined) this.bloomPass.enabled = look.bloom;
  }

  setBloomEnabled(isEnabled: boolean): void {
    this.bloomPass.enabled = isEnabled;
  }

  render(scene: Scene, camera: Camera, timeS: number): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    applyLens(this.fpvPass, this.lens, timeS, this.aspect);
    this.composer.render();
  }

  /** Graphics quality: the sharpest pixel ratio to render at (capped by the screen's own). */
  setPixelRatioCap(cap: number): void {
    this.pixelRatioCap = cap;
    this.resize();
  }

  readonly resize = (): void => {
    const ratio = Math.min(window.devicePixelRatio, this.pixelRatioCap);
    this.webgl.setPixelRatio(ratio);
    this.webgl.setSize(window.innerWidth, window.innerHeight, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };
}
