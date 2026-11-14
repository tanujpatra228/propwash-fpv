import { BoxGeometry, InstancedMesh, MeshBasicMaterial, Object3D, type Scene } from 'three';
import { GLACIER } from '../../config';
import { createRng, randRange } from '../../core/math';
import { glacierHeight } from './terrain-fn';

const PER_ZONE = 70;
const SPEED_MPS = 16;

interface Streak {
  zone: number;
  /** 0..1 along the zone's wind line, and sideways and height offsets. */
  phase: number;
  side: number;
  heightM: number;
  baseY: number;
}

/** Blowing snow: pale streaks drifting through each wind zone in the direction of the wind, so you can see where it blows. */
export class WindStreaks {
  private readonly mesh: InstancedMesh;
  private readonly streaks: Streak[] = [];
  private readonly o = new Object3D();

  constructor(scene: Scene) {
    const rng = createRng(GLACIER.seed + 9);
    GLACIER.wind.zones.forEach((zone, zi) => {
      for (let i = 0; i < PER_ZONE; i++) {
        const side = randRange(rng, -zone.radiusM * 0.8, zone.radiusM * 0.8);
        const along = randRange(rng, -zone.radiusM, zone.radiusM);
        const rad = (zone.directionDeg * Math.PI) / 180;
        const x = zone.x + Math.sin(rad) * along + Math.cos(rad) * side;
        const z = zone.z - Math.cos(rad) * along + Math.sin(rad) * side;
        this.streaks.push({ zone: zi, phase: rng(), side, heightM: randRange(rng, 2, 16), baseY: glacierHeight(x, z) });
      }
    });
    this.mesh = new InstancedMesh(new BoxGeometry(0.05, 0.05, 3.2), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), this.streaks.length);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(timeS: number): void {
    const { o } = this;
    this.streaks.forEach((s, i) => {
      const zone = GLACIER.wind.zones[s.zone];
      if (!zone) return;
      const rad = (zone.directionDeg * Math.PI) / 180;
      const length = zone.radiusM * 2;
      const t = (((s.phase + (timeS * SPEED_MPS) / length) % 1) + 1) % 1;
      const along = (t - 0.5) * length;
      o.position.set(zone.x + Math.sin(rad) * along + Math.cos(rad) * s.side, s.baseY + s.heightM, zone.z - Math.cos(rad) * along + Math.sin(rad) * s.side);
      // The box is long along z; yaw so that z points along the wind (toward bearing `rad`, which is (sin, -cos)).
      o.rotation.set(0, Math.atan2(Math.sin(rad), -Math.cos(rad)) + Math.PI, 0);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
