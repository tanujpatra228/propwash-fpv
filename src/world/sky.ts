import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  MathUtils,
  PMREMGenerator,
  Scene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RENDER } from '../config';
import { buildNightDome, buildNightSky } from './stars';

/** The stock sky draws the sun disc about 19,000 times brighter than the sky, which bloom smears across half the screen. */
const SUN_DISC_BRIGHTNESS = '19000.0';
const SUN_DISC_BRIGHTNESS_CAPPED = '260.0';

function createSkyDome(scale: number, sunDirection: Vector3): Sky {
  const sky = new Sky();
  if (!sky.material.fragmentShader.includes(SUN_DISC_BRIGHTNESS)) {
    console.warn('Sky shader changed: sun disc brightness could not be capped.');
  }
  sky.material.fragmentShader = sky.material.fragmentShader.replace(SUN_DISC_BRIGHTNESS, SUN_DISC_BRIGHTNESS_CAPPED);
  sky.scale.setScalar(scale);
  const uniforms = sky.material.uniforms;
  const set = (name: string, value: number): void => {
    const uniform = uniforms[name];
    if (uniform) uniform.value = value;
  };
  set('turbidity', RENDER.sky.turbidity);
  set('rayleigh', RENDER.sky.rayleigh);
  set('mieCoefficient', RENDER.sky.mieCoefficient);
  set('mieDirectionalG', RENDER.sky.mieDirectionalG);
  uniforms['sunPosition']?.value.copy(sunDirection);
  return sky;
}

export interface SkyRig {
  /** Moves the shadow-casting sun so shadows follow the camera focus. */
  followFocus(position: Vector3): void;
  setShadowExtent(extentM: number): void;
  /** 0 turns shadows off; otherwise the shadow map size in pixels. */
  setShadowQuality(mapSizePx: number): void;
  /** Dev-only: try different light levels. */
  debugLight(look: { sun?: number; hemisphere?: number; environment?: number; turbidity?: number; mie?: number; mieG?: number; rayleigh?: number }): void;
}

/** Sky dome, sky-based lighting, warm haze, one shadow-casting sun. */
export function buildSky(scene: Scene, renderer: WebGLRenderer): SkyRig {
  const sunDirection = new Vector3().setFromSphericalCoords(
    1,
    MathUtils.degToRad(90 - RENDER.sunElevationDeg),
    MathUtils.degToRad(RENDER.sunAzimuthDeg),
  );
  const lightDirection = new Vector3().setFromSphericalCoords(
    1,
    MathUtils.degToRad(90 - RENDER.lightElevationDeg),
    MathUtils.degToRad(RENDER.lightAzimuthDeg),
  );
  const dome = createSkyDome(3000, sunDirection);
  scene.add(dome);
  if (RENDER.hasStars) {
    dome.visible = false; // the stock dome is pure black after dark; a navy gradient takes its place
    buildNightDome(scene);
    buildNightSky(scene, lightDirection);
  }

  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Scene();
  envScene.add(createSkyDome(50, sunDirection));
  scene.environment = pmrem.fromScene(envScene).texture;
  scene.environmentIntensity = RENDER.environmentIntensity;
  pmrem.dispose();

  scene.fog = new FogExp2(new Color(RENDER.fogColor), RENDER.fogDensity);

  const sun = new DirectionalLight(RENDER.lightColor, RENDER.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 600;
  const hemisphere = new HemisphereLight(RENDER.hemisphereSky, RENDER.hemisphereGround, RENDER.hemisphereIntensity);
  scene.add(sun, sun.target, hemisphere);

  let currentExtentM = 0;
  const rig: SkyRig = {
    setShadowQuality(mapSizePx: number): void {
      sun.castShadow = mapSizePx > 0;
      if (mapSizePx > 0 && sun.shadow.mapSize.x !== mapSizePx) {
        sun.shadow.mapSize.set(mapSizePx, mapSizePx);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    },
    debugLight(look): void {
      if (look.sun !== undefined) sun.intensity = look.sun;
      if (look.hemisphere !== undefined) hemisphere.intensity = look.hemisphere;
      if (look.environment !== undefined) scene.environmentIntensity = look.environment;
      const u = dome.material.uniforms;
      if (look.turbidity !== undefined && u['turbidity']) u['turbidity'].value = look.turbidity;
      if (look.mie !== undefined && u['mieCoefficient']) u['mieCoefficient'].value = look.mie;
      if (look.mieG !== undefined && u['mieDirectionalG']) u['mieDirectionalG'].value = look.mieG;
      if (look.rayleigh !== undefined && u['rayleigh']) u['rayleigh'].value = look.rayleigh;
    },
    setShadowExtent(extentM: number): void {
      if (extentM === currentExtentM) return;
      currentExtentM = extentM;
      const cam = sun.shadow.camera;
      cam.left = -extentM;
      cam.right = extentM;
      cam.top = extentM;
      cam.bottom = -extentM;
      sun.shadow.normalBias = extentM < 10 ? 0.002 : 0.03;
      cam.updateProjectionMatrix();
    },
    followFocus(position: Vector3): void {
      sun.target.position.copy(position);
      sun.position.copy(position).addScaledVector(lightDirection, 300);
    },
  };
  rig.setShadowExtent(RENDER.shadowExtentM);
  return rig;
}
