import { Color, DoubleSide, InstancedMesh, MeshStandardMaterial, Object3D, PlaneGeometry, type Scene } from 'three';
import { VALLEY, WORLD, SCENERY } from '../config';
import { createRng, randRange } from '../core/math';
import { LAKE_SURFACE_Y, heightAt } from './terrain';
import { PIT_PAD } from './pit-area';
import { slopeAt } from './scatter';
import { track } from './track';

const BLADE_HEIGHT_M = 0.6;
const PALETTE = [0x5d7a2c, 0x6f8634, 0x4f6c26, 0x84893e] as const;
const MIN_ABOVE_WATER_M = 0.35;
const FACTORY_CLEAR_RADIUS_M = 30;
const PAD_CLEAR_RADIUS_M = 7;
const TWO_PI = Math.PI * 2;

export interface Grass {
  mesh: InstancedMesh;
  /** Advances the wind. */
  update(timeS: number): void;
}

/** Wind-blown grass blades, concentrated along the track and around the pits. */
export function buildGrass(scene: Scene): Grass {
  const rng = createRng(WORLD.seed + 97);
  const blade = new PlaneGeometry(0.09, BLADE_HEIGHT_M, 1, 3).translate(0, BLADE_HEIGHT_M / 2, 0);
  const p = blade.attributes.position;
  if (!p) throw new Error('Grass blade has no positions');
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - p.getY(i) / (BLADE_HEIGHT_M + 0.02)));

  const uniforms = { uTime: { value: 0 } };
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = uniforms.uTime;
    shader.vertexShader =
      'uniform float uTime;\nvarying float vH;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vH = position.y / ${BLADE_HEIGHT_M.toFixed(1)};
         vec2 wp = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
         float w = sin(uTime * 1.7 + wp.x * 0.15 + wp.y * 0.11) * 0.5 + sin(uTime * 3.1 + wp.x * 0.6) * 0.2;
         transformed.x += w * 0.18 * vH * vH;
         transformed.z += w * 0.08 * vH * vH;`,
      );
    shader.fragmentShader =
      'varying float vH;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.42, 1.08, vH);');
  };

  const mesh = new InstancedMesh(blade, material, SCENERY.grassCount);
  const dummy = new Object3D();
  const color = new Color();
  const pad = PIT_PAD.position;
  const anchors = track.positions.filter((_, i) => i % 10 === 0);
  let count = 0;
  for (let tries = 0; count < SCENERY.grassCount && tries < SCENERY.grassCount * 4; tries++) {
    const near = rng() < SCENERY.grassNearPadChance ? pad : anchors[Math.floor(rng() * anchors.length)];
    if (!near) continue;
    const angle = randRange(rng, 0, TWO_PI);
    const reach = rng() ** 0.7 * SCENERY.grassReachM;
    const x = near.x + Math.cos(angle) * reach;
    const z = near.z + Math.sin(angle) * reach;
    const h = heightAt(x, z);
    if (h < LAKE_SURFACE_Y + MIN_ABOVE_WATER_M) continue;
    if (Math.hypot(x - VALLEY.bando.x, z - VALLEY.bando.z) < FACTORY_CLEAR_RADIUS_M) continue;
    if (Math.hypot(x - pad.x, z - pad.z) < PAD_CLEAR_RADIUS_M) continue;
    if (slopeAt(x, z, 1.5) > SCENERY.maxGrassSlope) continue;
    const s = randRange(rng, 0.6, 1.5);
    dummy.position.set(x, h - 0.03, z);
    dummy.rotation.set(randRange(rng, -0.25, 0.25), randRange(rng, 0, TWO_PI), randRange(rng, -0.25, 0.25));
    dummy.scale.set(s, s * randRange(rng, 0.7, 1.3), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(count, dummy.matrix);
    mesh.setColorAt(count, color.set(PALETTE[Math.floor(rng() * PALETTE.length)] ?? 0x5d7a2c));
    count++;
  }
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  scene.add(mesh);

  return {
    mesh,
    update(timeS: number): void {
      uniforms.uTime.value = timeS;
    },
  };
}
