import { Sprite, SpriteMaterial, type Scene } from 'three';
import { SCENERY, WORLD } from '../config';
import { createRng, randRange } from '../core/math';
import type { WorldTextures } from './textures';

const TWO_PI = Math.PI * 2;

/** Soft sprite clouds high above the valley, unaffected by fog. */
export function buildClouds(scene: Scene, textures: WorldTextures): void {
  const rng = createRng(WORLD.seed + 211);
  for (let i = 0; i < SCENERY.cloudCount; i++) {
    const material = new SpriteMaterial({
      map: textures.cloud,
      fog: false,
      transparent: true,
      opacity: randRange(rng, 0.35, 0.7),
      depthWrite: false,
      color: 0xfff1e4,
    });
    const sprite = new Sprite(material);
    const angle = randRange(rng, 0, TWO_PI);
    const radius = randRange(rng, 600, 1500);
    sprite.position.set(Math.cos(angle) * radius, randRange(rng, 260, 520), Math.sin(angle) * radius);
    sprite.scale.set(randRange(rng, 260, 520), randRange(rng, 110, 200), 1);
    scene.add(sprite);
  }
}
