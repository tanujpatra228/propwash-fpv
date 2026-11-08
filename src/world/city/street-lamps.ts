import { BoxGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, AdditiveBlending, type Scene } from 'three';
import { CITY, WORLD } from '../../config';

const AVENUES = [-240, -120, 0, 120, 240] as const;
const SPACING_M = 30;
const SIDE_M = CITY.avenueWidthM / 2 + 1.6;
const POLE_HEIGHT_M = 9;
const ARM_M = 0.9;

interface Lamp {
  x: number;
  z: number;
  /** Direction from the pole toward the road, as a unit step on X or Z. */
  towardX: number;
  towardZ: number;
}

function layout(): Lamp[] {
  const lamps: Lamp[] = [];
  const limit = WORLD.bounds.halfSizeM - 12;
  for (const avenue of AVENUES) {
    for (let t = -limit; t <= limit; t += SPACING_M) {
      // Not inside a junction.
      if (AVENUES.some((a) => Math.abs(t - a) < CITY.avenueWidthM / 2 + 4)) continue;
      for (const side of [-1, 1]) {
        lamps.push({ x: avenue + side * SIDE_M, z: t, towardX: -side, towardZ: 0 });
        lamps.push({ x: t, z: avenue + side * SIDE_M, towardX: 0, towardZ: -side });
      }
    }
  }
  return lamps;
}

function poolTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (c) {
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,214,150,0.32)');
    g.addColorStop(1, 'rgba(255,214,150,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

/** Street lamps along every avenue: poles by day; at night the heads glow and light a soft pool on the road. */
export function buildStreetLamps(scene: Scene, isNight: boolean): void {
  const lamps = layout();
  const o = new Object3D();
  const poles = new InstancedMesh(new CylinderGeometry(0.1, 0.16, POLE_HEIGHT_M, 6).translate(0, POLE_HEIGHT_M / 2, 0), new MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.7, metalness: 0.4 }), lamps.length);
  const heads = new InstancedMesh(
    new BoxGeometry(0.5, 0.18, 1.1).translate(0, 0, 0),
    isNight ? new MeshBasicMaterial({ color: new Color(0xffe2a8) }) : new MeshStandardMaterial({ color: 0x55585d, roughness: 0.6 }),
    lamps.length,
  );
  lamps.forEach((lamp, i) => {
    o.position.set(lamp.x, 0, lamp.z);
    o.rotation.set(0, 0, 0);
    o.updateMatrix();
    poles.setMatrixAt(i, o.matrix);
    o.position.set(lamp.x + lamp.towardX * ARM_M, POLE_HEIGHT_M, lamp.z + lamp.towardZ * ARM_M);
    o.rotation.y = lamp.towardX !== 0 ? Math.PI / 2 : 0;
    o.updateMatrix();
    heads.setMatrixAt(i, o.matrix);
  });
  poles.castShadow = true;
  scene.add(poles, heads);

  if (!isNight) return;
  const pools = new InstancedMesh(
    new CircleGeometry(7, 20).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }),
    lamps.length,
  );
  lamps.forEach((lamp, i) => {
    o.position.set(lamp.x + lamp.towardX * 5, 0.06, lamp.z + lamp.towardZ * 5);
    o.rotation.set(0, 0, 0);
    o.updateMatrix();
    pools.setMatrixAt(i, o.matrix);
  });
  pools.frustumCulled = false;
  scene.add(pools);
}
