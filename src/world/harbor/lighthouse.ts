import { CylinderGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Scene } from 'three';
import { HARBOR } from '../../config';
import type { ColliderWorld } from '../../physics/colliders';

/** Red and white bands, a gallery and a lamp, at the end of the breakwater. Solid. */
export function buildLighthouse(scene: Scene, colliders: ColliderWorld): void {
  const { x, z, radiusM, heightM } = HARBOR.lighthouse;
  const bands = 6;
  const bandHeight = heightM / bands;
  for (let i = 0; i < bands; i++) {
    const mesh = new Mesh(
      new CylinderGeometry(radiusM * (1 - (i + 1) * 0.06), radiusM * (1 - i * 0.06), bandHeight, 16),
      new MeshStandardMaterial({ color: i % 2 === 0 ? 0xe9e4da : 0xc4382c, roughness: 0.8 }),
    );
    mesh.position.set(x, bandHeight * (i + 0.5), z);
    mesh.castShadow = true;
    scene.add(mesh);
  }
  const gallery = new Mesh(new CylinderGeometry(radiusM * 0.95, radiusM * 0.8, 1.2, 16), new MeshStandardMaterial({ color: 0x2b2e33 }));
  gallery.position.set(x, heightM + 0.6, z);
  const lamp = new Mesh(new CylinderGeometry(radiusM * 0.45, radiusM * 0.45, 2.6, 12), new MeshBasicMaterial({ color: 0xfff1b8 }));
  lamp.position.set(x, heightM + 2.5, z);
  scene.add(gallery, lamp);
  colliders.addCylinder(x, z, 0, heightM + 4, radiusM, 'building');
}
