import { Color, InstancedMesh, Matrix4, type BufferGeometry, type Material, type Scene } from 'three';

interface Group {
  matrices: Matrix4[];
  colors: Color[];
}

export interface ChunkOptions {
  castShadow: boolean;
  receiveShadow: boolean;
}

/**
 * Splits instances of one mesh into square map chunks, one InstancedMesh each.
 * A single InstancedMesh covering the whole valley can never be skipped by the GPU, so every tree is drawn every
 * frame (and again for shadows). Chunks have small bounding spheres, so the ones out of view are culled.
 */
export class InstanceChunks {
  private readonly groups = new Map<string, Group>();

  constructor(private readonly chunkSizeM: number) {}

  add(x: number, z: number, matrix: Matrix4, color?: Color): void {
    const key = `${Math.floor(x / this.chunkSizeM)},${Math.floor(z / this.chunkSizeM)}`;
    let group = this.groups.get(key);
    if (!group) {
      group = { matrices: [], colors: [] };
      this.groups.set(key, group);
    }
    group.matrices.push(matrix.clone());
    if (color) group.colors.push(color.clone());
  }

  get chunkCount(): number {
    return this.groups.size;
  }

  get instanceCount(): number {
    let total = 0;
    for (const group of this.groups.values()) total += group.matrices.length;
    return total;
  }

  /** Creates and adds one mesh per chunk. Geometry and material are shared by all of them. */
  build(geometry: BufferGeometry, material: Material, scene: Scene, options: ChunkOptions): InstancedMesh[] {
    const meshes: InstancedMesh[] = [];
    for (const group of this.groups.values()) {
      const mesh = new InstancedMesh(geometry, material, group.matrices.length);
      group.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      if (group.colors.length === group.matrices.length) group.colors.forEach((color, i) => mesh.setColorAt(i, color));
      mesh.castShadow = options.castShadow;
      mesh.receiveShadow = options.receiveShadow;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}
