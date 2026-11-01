import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, type Texture } from 'three';
import type { ColliderWorld } from '../physics/colliders';

const containerGeometry = new BoxGeometry(2.44, 2.6, 6.06);

export const CONTAINER_COLORS = [0x8a3a2a, 0x2f5d7a, 0x3c6a3c, 0xa7752e, 0x6b6b6b] as const;

/** Adds a shipping container to `parent` and registers its collider. `parent` must already be placed. */
export function addContainer(
  parent: Group,
  colliders: ColliderWorld,
  ribs: Texture,
  x: number,
  baseY: number,
  z: number,
  rotationYRad: number,
  color: number,
): Mesh {
  const mesh = new Mesh(
    containerGeometry,
    new MeshStandardMaterial({ map: ribs, color: new Color(color), roughness: 0.7, metalness: 0.3 }),
  );
  mesh.position.set(x, baseY + 1.3, z);
  mesh.rotation.y = rotationYRad;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  colliders.addMeshBox(mesh, 'container');
  return mesh;
}
