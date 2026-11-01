import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Object3D,
  type Scene,
  type Texture,
} from 'three';
import type { ColliderWorld } from '../physics/colliders';

const SIZE = { widthM: 2.44, heightM: 2.6, lengthM: 6.06 } as const;
const HALF = new Vector3(SIZE.widthM / 2, SIZE.heightM / 2, SIZE.lengthM / 2);
const UP = new Vector3(0, 1, 0);

export const CONTAINER_COLORS = [0x8a3a2a, 0x2f5d7a, 0x3c6a3c, 0xa7752e, 0x6b6b6b] as const;

interface Item {
  matrix: Matrix4;
  color: number;
}

/** Collects every shipping container in the world and draws them as one instanced mesh. */
export class ContainerBatch {
  private readonly items: Item[] = [];

  constructor(
    private readonly colliders: ColliderWorld,
    private readonly ribs: Texture,
  ) {}

  /** Adds a container under `parent` (which must already be placed) and registers its collider. */
  add(parent: Object3D, x: number, baseY: number, z: number, rotationYRad: number, color: number): void {
    parent.updateMatrixWorld(true);
    const local = new Matrix4().compose(
      new Vector3(x, baseY + SIZE.heightM / 2, z),
      new Quaternion().setFromAxisAngle(UP, rotationYRad),
      new Vector3(1, 1, 1),
    );
    const world = parent.matrixWorld.clone().multiply(local);
    this.colliders.addBox(world, HALF, 'container');
    this.items.push({ matrix: world, color });
  }

  /** Call once, after every container has been added. */
  build(scene: Scene): InstancedMesh {
    const mesh = new InstancedMesh(
      new BoxGeometry(SIZE.widthM, SIZE.heightM, SIZE.lengthM),
      new MeshStandardMaterial({ map: this.ribs, color: 0xffffff, roughness: 0.7, metalness: 0.3 }),
      this.items.length,
    );
    const tint = new Color();
    this.items.forEach((item, i) => {
      mesh.setMatrixAt(i, item.matrix);
      mesh.setColorAt(i, tint.set(item.color));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
}
