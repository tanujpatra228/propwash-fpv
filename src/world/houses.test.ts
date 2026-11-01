import { InstancedMesh, Matrix4, Quaternion, Scene, Texture, Vector3, type CanvasTexture } from 'three';
import { describe, expect, it } from 'vitest';
import { SCENERY } from '../config';
import { ColliderWorld, createHit } from '../physics/colliders';
import { buildHamlet } from './houses';
import { Exclusions } from './scatter';
import type { WorldTextures } from './textures';

const blank = (): CanvasTexture => new Texture() as unknown as CanvasTexture;
const textures: WorldTextures = {
  detail: blank(),
  concrete: blank(),
  ribs: blank(),
  houseWall: blank(),
  checker: blank(),
  pad: blank(),
  cloud: blank(),
};

function build(): { scene: Scene; world: ColliderWorld } {
  const scene = new Scene();
  const world = new ColliderWorld();
  buildHamlet(scene, world, textures, new Exclusions());
  return { scene, world };
}

describe('hamlet colliders', () => {
  it('places the requested number of houses with walls and two roof slabs each', () => {
    const { scene, world } = build();
    const walls = scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh);
    expect(walls?.count).toBeGreaterThan(3);
    expect(world.boxCount).toBe((walls?.count ?? 0) * 3);
    expect(walls?.count).toBeLessThanOrEqual(SCENERY.hamlet.houseCount);
  });

  it('is solid at the roof, not only at the walls', () => {
    const { scene, world } = build();
    const [walls, roofs] = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
    if (!walls || !roofs) throw new Error('hamlet meshes missing');
    const hit = createHit();
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const rotation = new Quaternion();
    for (let i = 0; i < walls.count; i++) {
      roofs.getMatrixAt(i, matrix);
      matrix.decompose(position, rotation, scale);
      // Just under the ridge, at the roof's centre, a drone must be inside the roof slabs' reach.
      const ridgeY = position.y + (scale.y * Math.sqrt(3)) / 3 - 0.1;
      const point = new Vector3(position.x, ridgeY, position.z);
      expect(world.query(point, 0.18, hit)).toBe(true);
      expect(hit.kind).toBe('building');
      // High above the house is clear.
      expect(world.query(point.setY(ridgeY + 6), 0.18, hit)).toBe(false);
    }
  });
});
