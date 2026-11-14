import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, RingGeometry, Vector3, DoubleSide, type Scene } from 'three';
import { surfaceAt, type Surface } from './terrain';

const POOL = 96;
const GRAVITY = 9.8;
const SKIM_MAX_HEIGHT_M = 2.5;
const SKIM_MIN_SPEED_MPS = 6;
const RING_SECONDS = 0.9;

/**
 * Water spray: a wake of droplets behind a drone skimming low and fast over water, and a splash (droplets and an
 * expanding ring) when it hits the water. A fixed pool of droplets drawn as one instanced mesh, nothing allocated per frame.
 */
export class WaterEffects {
  private readonly mesh: InstancedMesh;
  private readonly ring: Mesh;
  private readonly surface: Surface = { y: 0, isWater: false };
  private readonly position = new Float32Array(POOL * 3);
  private readonly velocity = new Float32Array(POOL * 3);
  private readonly life = new Float32Array(POOL);
  private readonly matrix = new Matrix4();
  private readonly zero = new Matrix4().makeScale(0, 0, 0);
  private ringAge = RING_SECONDS;
  private seed = 12345;
  private next = 0;

  constructor(scene: Scene) {
    this.mesh = new InstancedMesh(new IcosahedronGeometry(0.1, 0), new MeshBasicMaterial({ color: new Color(0xe9f6ff), transparent: true, opacity: 0.85 }), POOL);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < POOL; i++) this.mesh.setMatrixAt(i, this.zero);
    this.ring = new Mesh(new RingGeometry(0.6, 0.9, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xe9f6ff, transparent: true, opacity: 0.7, side: DoubleSide, depthWrite: false }));
    this.ring.visible = false;
    scene.add(this.mesh, this.ring);
  }

  /** A small deterministic random number in 0..1 (effects only; nothing depends on it). */
  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const i = this.next;
    this.next = (this.next + 1) % POOL;
    this.position.set([x, y, z], i * 3);
    this.velocity.set([vx, vy, vz], i * 3);
    this.life[i] = 0.7 + this.random() * 0.5;
  }

  /** The drone hit the water: a burst of droplets and a ring on the surface. */
  splash(at: Vector3): void {
    surfaceAt(at.x, at.z, this.surface);
    const y = this.surface.y;
    for (let k = 0; k < 40; k++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 1.5 + this.random() * 3.5;
      this.emit(at.x, y, at.z, Math.cos(angle) * speed, 3 + this.random() * 5, Math.sin(angle) * speed);
    }
    this.ring.position.set(at.x, y + 0.05, at.z);
    this.ringAge = 0;
  }

  /** Call every frame with the drone's position and speed. */
  update(dtS: number, position: Vector3, velocity: Vector3): void {
    surfaceAt(position.x, position.z, this.surface);
    const height = position.y - this.surface.y;
    const speed = velocity.length();
    if (this.surface.isWater && height > 0 && height < SKIM_MAX_HEIGHT_M && speed > SKIM_MIN_SPEED_MPS) {
      // Spray thrown up and out behind the drone, thicker the lower and faster it flies.
      const count = height < 1.2 ? 3 : 1;
      for (let k = 0; k < count; k++) {
        const side = (this.random() - 0.5) * 3;
        this.emit(position.x, this.surface.y, position.z, -velocity.x * 0.15 + side, 1.5 + this.random() * 2.5, -velocity.z * 0.15 + (this.random() - 0.5) * 3);
      }
    }
    for (let i = 0; i < POOL; i++) {
      const life = this.life[i] ?? 0;
      if (life <= 0) continue;
      const base = i * 3;
      this.velocity[base + 1] = (this.velocity[base + 1] ?? 0) - GRAVITY * dtS;
      this.position[base] = (this.position[base] ?? 0) + (this.velocity[base] ?? 0) * dtS;
      this.position[base + 1] = (this.position[base + 1] ?? 0) + (this.velocity[base + 1] ?? 0) * dtS;
      this.position[base + 2] = (this.position[base + 2] ?? 0) + (this.velocity[base + 2] ?? 0) * dtS;
      const remaining = life - dtS;
      this.life[i] = remaining;
      if (remaining <= 0 || (this.position[base + 1] ?? 0) < this.surface.y - 0.2) {
        this.life[i] = 0;
        this.mesh.setMatrixAt(i, this.zero);
      } else {
        this.matrix.makeTranslation(this.position[base] ?? 0, this.position[base + 1] ?? 0, this.position[base + 2] ?? 0);
        this.mesh.setMatrixAt(i, this.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.ringAge < RING_SECONDS) {
      this.ringAge += dtS;
      const t = Math.min(1, this.ringAge / RING_SECONDS);
      this.ring.visible = t < 1;
      this.ring.scale.setScalar(1 + t * 7);
      (this.ring.material as MeshBasicMaterial).opacity = 0.7 * (1 - t);
    }
  }
}
