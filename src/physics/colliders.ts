import { Matrix4, Vector3, type Mesh } from 'three';
import { COLLISION } from '../config';

/** What was hit. The game layer maps each kind to a crash reason. */
export type ColliderKind = 'gate' | 'factory' | 'container' | 'building' | 'tree' | 'vehicle' | 'crane';

/** A box that moves (a car, a bus). Call `place` each frame it moves. */
export interface DynamicBox {
  place(x: number, y: number, z: number, yawRad: number): void;
}

export interface CollisionHit {
  kind: ColliderKind;
  /** Unit vector pointing out of the obstacle, toward the drone. */
  normal: Vector3;
  /** How far the drone sphere overlaps the surface, in metres. */
  depth: number;
}

interface BoxCollider {
  kind: ColliderKind;
  inverseWorld: Matrix4;
  worldMatrix: Matrix4;
  halfExtents: Vector3;
  center: Vector3;
  boundingRadiusM: number;
}

interface CylinderCollider {
  kind: ColliderKind;
  x: number;
  z: number;
  baseY: number;
  topY: number;
  radiusM: number;
}

const local = new Vector3();
const nearest = new Vector3();
const delta = new Vector3();

/** Pure geometry: boxes of any orientation and vertical cylinders (trees). No game rules. */
export class ColliderWorld {
  private readonly boxes: BoxCollider[] = [];
  private readonly cylinderGrid = new Map<string, CylinderCollider[]>();
  cylinderCount = 0;

  get boxCount(): number {
    return this.boxes.length;
  }

  /** Adds an oriented box. `worldMatrix` must be the final world transform (scale included). */
  addBox(worldMatrix: Matrix4, halfExtents: Vector3, kind: ColliderKind): void {
    const center = new Vector3().setFromMatrixPosition(worldMatrix);
    const scale = new Vector3().setFromMatrixScale(worldMatrix);
    const scaled = halfExtents.clone().multiply(scale);
    // Collision is tested in the box's own space, so store the matrix without scale folded into extents twice.
    const unscaled = worldMatrix.clone().scale(new Vector3(1 / scale.x, 1 / scale.y, 1 / scale.z));
    this.boxes.push({
      kind,
      worldMatrix: unscaled,
      inverseWorld: unscaled.clone().invert(),
      halfExtents: scaled,
      center,
      boundingRadiusM: scaled.length(),
    });
  }

  /** Adds a box that can be moved with `place` (rotation about Y only). `y` is the centre height. */
  addDynamicBox(halfExtents: Vector3, kind: ColliderKind): DynamicBox {
    const box: BoxCollider = {
      kind,
      worldMatrix: new Matrix4(),
      inverseWorld: new Matrix4(),
      halfExtents: halfExtents.clone(),
      center: new Vector3(),
      boundingRadiusM: halfExtents.length(),
    };
    this.boxes.push(box);
    return {
      place(x: number, y: number, z: number, yawRad: number): void {
        box.worldMatrix.makeRotationY(yawRad).setPosition(x, y, z);
        box.inverseWorld.copy(box.worldMatrix).invert();
        box.center.set(x, y, z);
      },
    };
  }

  /** Adds a mesh with a box-like geometry, using its bounding box. Call after the mesh is placed in the scene. */
  addMeshBox(mesh: Mesh, kind: ColliderKind): void {
    mesh.updateWorldMatrix(true, false);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box) return;
    const half = box.getSize(new Vector3()).multiplyScalar(0.5);
    // Geometry may be offset from its origin; fold the offset into the matrix.
    const offset = box.getCenter(new Vector3());
    const matrix = mesh.matrixWorld.clone().multiply(new Matrix4().makeTranslation(offset.x, offset.y, offset.z));
    this.addBox(matrix, half, kind);
  }

  addCylinder(x: number, z: number, baseY: number, heightM: number, radiusM: number, kind: ColliderKind): void {
    const collider: CylinderCollider = { kind, x, z, baseY, topY: baseY + heightM, radiusM };
    const cell = COLLISION.gridCellM;
    const x0 = Math.floor((x - radiusM) / cell);
    const x1 = Math.floor((x + radiusM) / cell);
    const z0 = Math.floor((z - radiusM) / cell);
    const z1 = Math.floor((z + radiusM) / cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = `${cx},${cz}`;
        const list = this.cylinderGrid.get(key);
        if (list) list.push(collider);
        else this.cylinderGrid.set(key, [collider]);
      }
    }
    this.cylinderCount++;
  }

  /** Finds the deepest overlap of a sphere with any obstacle. Writes into `out`; returns false when clear. */
  query(position: Vector3, radiusM: number, out: CollisionHit): boolean {
    let bestDepth = 0;
    for (const box of this.boxes) {
      if (box.center.distanceTo(position) > box.boundingRadiusM + radiusM) continue;
      local.copy(position).applyMatrix4(box.inverseWorld);
      nearest.set(
        clampAbs(local.x, box.halfExtents.x),
        clampAbs(local.y, box.halfExtents.y),
        clampAbs(local.z, box.halfExtents.z),
      );
      delta.subVectors(local, nearest);
      const distance = delta.length();
      let depth: number;
      if (distance > 1e-6) {
        depth = radiusM - distance;
        if (depth <= bestDepth) continue;
        delta.divideScalar(distance);
      } else {
        // Centre inside the box: push out along the shortest axis.
        const gapX = box.halfExtents.x - Math.abs(local.x);
        const gapY = box.halfExtents.y - Math.abs(local.y);
        const gapZ = box.halfExtents.z - Math.abs(local.z);
        const gap = Math.min(gapX, gapY, gapZ);
        depth = radiusM + gap;
        if (depth <= bestDepth) continue;
        delta.set(0, 0, 0);
        if (gap === gapX) delta.x = Math.sign(local.x) || 1;
        else if (gap === gapY) delta.y = Math.sign(local.y) || 1;
        else delta.z = Math.sign(local.z) || 1;
      }
      bestDepth = depth;
      out.kind = box.kind;
      out.depth = depth;
      out.normal.copy(delta).transformDirection(box.worldMatrix);
    }

    const cell = COLLISION.gridCellM;
    const list = this.cylinderGrid.get(`${Math.floor(position.x / cell)},${Math.floor(position.z / cell)}`);
    if (list) {
      for (const tree of list) {
        if (position.y < tree.baseY - radiusM || position.y > tree.topY + radiusM) continue;
        const dx = position.x - tree.x;
        const dz = position.z - tree.z;
        const distance = Math.hypot(dx, dz);
        const depth = tree.radiusM + radiusM - distance;
        if (depth <= bestDepth) continue;
        bestDepth = depth;
        out.kind = tree.kind;
        out.depth = depth;
        if (distance > 1e-6) out.normal.set(dx / distance, 0, dz / distance);
        else out.normal.set(1, 0, 0);
      }
    }
    return bestDepth > 0;
  }
}

function clampAbs(value: number, limit: number): number {
  return value < -limit ? -limit : value > limit ? limit : value;
}

export function createHit(): CollisionHit {
  return { kind: 'tree', normal: new Vector3(), depth: 0 };
}
