import { BoxGeometry, Color, Frustum, Matrix4, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { InstanceChunks } from './instance-chunks';

const at = (x: number, z: number): Matrix4 => new Matrix4().makeTranslation(x, 0, z);

describe('InstanceChunks', () => {
  it('groups instances by map cell and keeps every instance', () => {
    const chunks = new InstanceChunks(100);
    chunks.add(10, 10, at(10, 10));
    chunks.add(90, 20, at(90, 20));
    chunks.add(150, 10, at(150, 10));
    chunks.add(-5, -5, at(-5, -5));
    expect(chunks.chunkCount).toBe(3);
    expect(chunks.instanceCount).toBe(4);
    const meshes = chunks.build(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), new Scene(), { castShadow: true, receiveShadow: false });
    expect(meshes.reduce((n, m) => n + m.count, 0)).toBe(4);
    expect(meshes.every((m) => m.castShadow && !m.receiveShadow)).toBe(true);
  });

  it('stores per-instance colours', () => {
    const chunks = new InstanceChunks(100);
    chunks.add(1, 1, at(1, 1), new Color(0xff0000));
    chunks.add(2, 2, at(2, 2), new Color(0x00ff00));
    const [mesh] = chunks.build(new BoxGeometry(), new MeshBasicMaterial(), new Scene(), { castShadow: false, receiveShadow: false });
    expect(mesh?.instanceColor?.count).toBe(2);
  });

  it('gives far-away chunks bounding spheres that a camera can cull', () => {
    const chunks = new InstanceChunks(100);
    chunks.add(10, -50, at(10, -50)); // in front of the camera
    chunks.add(800, 800, at(800, 800)); // far off to the side
    const meshes = chunks.build(new BoxGeometry(2, 2, 2), new MeshBasicMaterial(), new Scene(), { castShadow: false, receiveShadow: false });
    const camera = new PerspectiveCamera(70, 1, 0.1, 400);
    camera.updateMatrixWorld();
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const visible = meshes.filter((m) => frustum.intersectsObject(m));
    expect(meshes.length).toBe(2);
    expect(visible.length).toBe(1);
  });
});
