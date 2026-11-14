import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, Vector2, type Scene } from 'three';
import { WORLD } from '../../config';
import { createRng } from '../../core/math';

/** A tileable bump texture of overlapping ripples, drawn once. */
function rippleTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (c) {
    c.fillStyle = '#8080ff';
    c.fillRect(0, 0, size, size);
    const rng = createRng(WORLD.seed + 77);
    for (let i = 0; i < 220; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 6 + rng() * 22;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      const tone = 100 + Math.floor(rng() * 56);
      g.addColorStop(0, `rgba(${tone},${tone},255,0.5)`);
      g.addColorStop(1, 'rgba(128,128,255,0)');
      c.fillStyle = g;
      // Draw wrapped copies near the edges so the texture tiles without a seam.
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) c.fillRect(x - r + dx, y - r + dy, 2 * r, 2 * r);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(70, 70);
  return texture;
}

export interface Water {
  update(timeS: number): void;
}

/** The sea: one big reflective plane at water level, with a ripple map that drifts. The quay and piers sit above it. */
export function buildWater(scene: Scene): Water {
  const normalMap = rippleTexture();
  const material = new MeshStandardMaterial({
    color: 0x3a8ca6,
    roughness: 0.16,
    metalness: 0.5,
    normalMap,
    normalScale: new Vector2(0.35, 0.35),
    transparent: true,
    opacity: 0.94,
    envMapIntensity: 1.4,
  });
  const mesh = new Mesh(new PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), material);
  mesh.position.y = 0;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return {
    update(timeS: number): void {
      normalMap.offset.set(timeS * 0.004, timeS * 0.0027);
    },
  };
}
