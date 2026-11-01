import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3, type Scene } from 'three';
import { WORLD } from '../config';

const { halfSizeM, ceilingM } = WORLD.bounds;
const grid = WORLD.boundaryGrid;

const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Draws crisp 1-pixel grid lines in world space (so they do not stretch) and fades with distance to the drone.
const FRAGMENT = /* glsl */ `
  uniform vec3 uDrone;
  uniform vec3 uColor;
  uniform float uSpacing, uMaxOpacity, uFadeStart, uFadeEnd;
  uniform int uPlane; // 0 = wall along X, 1 = wall along Z, 2 = ceiling
  varying vec3 vWorld;
  void main() {
    vec2 g = uPlane == 0 ? vWorld.xy : (uPlane == 1 ? vWorld.zy : vWorld.xz);
    vec2 cell = g / uSpacing;
    vec2 d = abs(fract(cell - 0.5) - 0.5) / max(fwidth(cell), vec2(1e-5));
    float line = 1.0 - clamp(min(d.x, d.y), 0.0, 1.0);
    float near = 1.0 - smoothstep(uFadeStart, uFadeEnd, distance(vWorld, uDrone));
    float alpha = line * near * uMaxOpacity;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export interface Boundary {
  /** Tell the grid where the drone is, so it fades in only when you are close to a wall. */
  update(dronePosition: Vector3): void;
}

/** A faint grid on the four walls and the ceiling of the flyable area. Invisible from afar. */
export function buildBoundary(scene: Scene): Boundary {
  const drone = new Vector3();
  const makeMaterial = (plane: number): ShaderMaterial =>
    new ShaderMaterial({
      uniforms: {
        uDrone: { value: drone },
        uColor: { value: new Color(grid.lineColor) },
        uSpacing: { value: grid.spacingM },
        uMaxOpacity: { value: grid.maxOpacity },
        uFadeStart: { value: grid.fadeStartM },
        uFadeEnd: { value: grid.fadeEndM },
        uPlane: { value: plane },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });

  const size = halfSizeM * 2;
  const height = ceilingM - grid.bottomM;
  const centreY = (ceilingM + grid.bottomM) / 2;
  const wall = new PlaneGeometry(size, height);
  const ceiling = new PlaneGeometry(size, size);

  const add = (geometry: PlaneGeometry, material: ShaderMaterial, place: (mesh: Mesh) => void): void => {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    place(mesh);
    scene.add(mesh);
  };
  const alongX = makeMaterial(0);
  const alongZ = makeMaterial(1);
  add(wall, alongX, (m) => m.position.set(0, centreY, -halfSizeM));
  add(wall, alongX, (m) => m.position.set(0, centreY, halfSizeM));
  add(wall, alongZ, (m) => {
    m.position.set(-halfSizeM, centreY, 0);
    m.rotation.y = Math.PI / 2;
  });
  add(wall, alongZ, (m) => {
    m.position.set(halfSizeM, centreY, 0);
    m.rotation.y = Math.PI / 2;
  });
  add(ceiling, makeMaterial(2), (m) => {
    m.position.set(0, ceilingM, 0);
    m.rotation.x = Math.PI / 2;
  });

  return {
    update(dronePosition: Vector3): void {
      drone.copy(dronePosition);
    },
  };
}
