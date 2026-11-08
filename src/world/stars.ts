import { BackSide, BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial, CircleGeometry, Points, PointsMaterial, ShaderMaterial, SphereGeometry, Vector3, type Scene } from 'three';
import { WORLD } from '../config';
import { createRng } from '../core/math';

const STAR_COUNT = 1500;
const SKY_RADIUS_M = 2700;

/** A scatter of stars on the upper half of the sky, plus a moon disc where the moonlight comes from. */
export function buildNightSky(scene: Scene, moonDirection: Vector3): void {
  const rng = createRng(WORLD.seed + 12);
  const positions: number[] = [];
  const colors: number[] = [];
  const tint = new Color();
  for (let i = 0; i < STAR_COUNT; i++) {
    // Uniform on the upper hemisphere, kept a little above the horizon where haze would hide them.
    const y = 0.08 + rng() * 0.92;
    const angle = rng() * Math.PI * 2;
    const ring = Math.sqrt(1 - y * y);
    positions.push(Math.cos(angle) * ring * SKY_RADIUS_M, y * SKY_RADIUS_M, Math.sin(angle) * ring * SKY_RADIUS_M);
    const brightness = 0.35 + rng() * 0.65;
    tint.setHSL(0.6 + rng() * 0.1, 0.3 * rng(), brightness);
    colors.push(tint.r, tint.g, tint.b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const stars = new Points(geometry, new PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true }));
  stars.renderOrder = -1;
  stars.frustumCulled = false;
  scene.add(stars);

  const moon = new Mesh(new CircleGeometry(75, 32), new MeshBasicMaterial({ color: 0xdfe8ff, fog: false, depthWrite: false }));
  moon.position.copy(moonDirection).multiplyScalar(SKY_RADIUS_M);
  moon.lookAt(0, 0, 0);
  moon.frustumCulled = false;
  scene.add(moon);
}

const DOME_VERTEX = 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const DOME_FRAGMENT = `
  varying vec3 vDir;
  uniform vec3 uTop; uniform vec3 uHorizon;
  void main() {
    float h = clamp(vDir.y, 0.0, 1.0);
    vec3 c = mix(uHorizon, uTop, pow(h, 0.45));
    gl_FragColor = vec4(c, 1.0);
  }
`;

/** A navy gradient sky: lighter near the horizon (city glow), deep blue overhead. The stock sky dome goes pure black. */
export function buildNightDome(scene: Scene): void {
  const dome = new Mesh(
    new SphereGeometry(2900, 24, 16),
    new ShaderMaterial({
      uniforms: { uTop: { value: new Color(0x04081a) }, uHorizon: { value: new Color(0x23356b) } },
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      side: BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  dome.renderOrder = -2;
  dome.frustumCulled = false;
  scene.add(dome);
}
