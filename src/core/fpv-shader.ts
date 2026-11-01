import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** What the lens pass needs to know. The shader itself knows nothing about the game. */
export interface LensSettings {
  /** 0 = off, 1 = full barrel distortion and chromatic aberration. */
  fisheye: number;
  vignette: number;
  grain: number;
  /** 0..1 analog video static. */
  staticAmount: number;
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTime, uStatic, uFish, uAspect, uVig, uGrain;
  varying vec2 vUv;
  float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    vec2 q = vec2(p.x * uAspect, p.y);
    float r2 = dot(q, q) / (1.0 + uAspect * uAspect);
    vec2 uv = p * (1.0 + uFish * 0.22 * r2) / (1.0 + uFish * 0.167);
    uv = uv * 0.5 + 0.5;
    float line = floor(vUv.y * 260.0);
    uv.x += (rnd(vec2(line, floor(uTime * 30.0))) - 0.5) * 0.035 * uStatic * uStatic;
    float ca = 0.0022 * uFish + 0.006 * uStatic;
    vec3 col = vec3(texture2D(tDiffuse, uv + vec2(ca, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(ca, 0.0)).b);
    col *= step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float n = rnd(vUv * vec2(uAspect * 420.0, 420.0) + fract(uTime * 7.31));
    float g = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(g), uStatic * 0.6);
    col = mix(col, vec3(n), uStatic * 0.5);
    col += (n - 0.5) * uGrain;
    float bar = smoothstep(0.0, 0.08, abs(fract(vUv.y * 0.6 - uTime * 0.35) - 0.5));
    col *= mix(1.0, 0.7 + 0.3 * bar, uStatic);
    float d = length(p * vec2(1.0, 0.86));
    col *= mix(1.0, smoothstep(1.48, 0.5, d), uVig);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The FPV goggles look: barrel distortion, chromatic aberration, vignette, sensor grain and analog static. */
export function createFpvPass(): ShaderPass {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uStatic: { value: 0 },
      uFish: { value: 0 },
      uAspect: { value: 1 },
      uVig: { value: 0.3 },
      uGrain: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}

export function applyLens(pass: ShaderPass, lens: LensSettings, timeS: number, aspect: number): void {
  const u = pass.uniforms;
  const set = (name: string, value: number): void => {
    const uniform = u[name];
    if (uniform) uniform.value = value;
  };
  set('uTime', timeS);
  set('uAspect', aspect);
  set('uFish', lens.fisheye);
  set('uVig', lens.vignette);
  set('uGrain', lens.grain);
  set('uStatic', lens.staticAmount);
}
