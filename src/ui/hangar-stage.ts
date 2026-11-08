import { ACESFilmicToneMapping, AmbientLight, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { DRONE } from '../config';
import { createDroneModel, type DroneLook, type DroneModel } from '../drone/drone-model';

const SIZE = { w: 600, h: 260 };
const TURN_RADPS = 0.5;
const PROP_THROTTLE = 0.04;
const CAMERA = { distanceM: 0.62, heightM: 0.27, targetY: 0.04, fovDeg: 34 };

/** A small turntable that shows the drone with the chosen propellers and battery. Draws only while open. */
export class HangarStage {
  readonly canvas = document.createElement('canvas');
  private renderer: WebGLRenderer | null = null;
  private isInitialised = false;
  private look: DroneLook | null = null;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(CAMERA.fovDeg, SIZE.w / SIZE.h, 0.05, 5);
  private readonly drone: DroneModel = createDroneModel({ color: DRONE.colors.player });
  private frame = 0;
  private lastMs = 0;

  constructor() {
    this.canvas.className = 'hg-stage';
  }

  /** Creates the WebGL context the first time the Hangar opens, so the menu never pays for it. */
  private init(): void {
    this.isInitialised = true;
    try {
      this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    } catch {
      this.canvas.hidden = true; // no second WebGL context available: the cards and bars still work
      return;
    }
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(SIZE.w, SIZE.h, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.scene.add(new HemisphereLight(0xcfe6ff, 0x30363c, 1.1), new AmbientLight(0xffffff, 0.35));
    const sun = new DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(0.6, 1, 0.8);
    this.scene.add(sun, this.drone.group);
    this.camera.position.set(0, CAMERA.heightM, CAMERA.distanceM);
    this.camera.lookAt(0, CAMERA.targetY, 0);
    this.drone.group.rotation.x = 0.12;
    if (this.look) this.drone.setLook(this.look);
  }

  setLook(look: DroneLook): void {
    this.look = look;
    this.drone.setLook(look);
  }

  start(): void {
    if (!this.isInitialised) this.init();
    if (!this.renderer || this.frame) return;
    this.lastMs = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private readonly tick = (nowMs: number): void => {
    const dtS = Math.min(0.1, (nowMs - this.lastMs) / 1000);
    this.lastMs = nowMs;
    this.drone.group.rotation.y += TURN_RADPS * dtS;
    this.drone.spinProps(PROP_THROTTLE, dtS);
    this.renderer?.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };
}
