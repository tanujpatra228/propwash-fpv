import { BoxGeometry, CapsuleGeometry, Color, CylinderGeometry, InstancedMesh, MeshStandardMaterial, Object3D, type Scene } from 'three';
import {
  birdPlacement,
  buildBirds,
  buildDeliveryDrones,
  buildPedestrians,
  deliveryPlacement,
  pedestrianPlacement,
  type Placement,
} from './life-plan';

const FLAP_RAD = 0.7;
const FLAP_HZ = 2.2;
const ROTOR_RADIUS_M = 0.5;
const DRONE_SCALE = 1.7;

/** Scenery that moves but is never solid: flocks of birds, delivery quadcopters over the avenues, and pedestrians. */
export class CityLife {
  private readonly birds = buildBirds();
  private readonly deliveries = buildDeliveryDrones();
  private readonly pedestrians = buildPedestrians();
  private readonly place: Placement = { x: 0, y: 0, z: 0, yawRad: 0 };
  private readonly root = new Object3D();
  private readonly wing = new Object3D();
  private readonly leftWings: InstancedMesh;
  private readonly rightWings: InstancedMesh;
  private readonly droneBodies: InstancedMesh;
  private readonly rotors: InstancedMesh;
  private readonly packages: InstancedMesh;
  private readonly walkers: InstancedMesh;

  constructor(scene: Scene) {
    const dark = new MeshStandardMaterial({ color: 0x23262b, roughness: 0.8 });
    const wingMaterial = new MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.9 });
    this.leftWings = new InstancedMesh(new BoxGeometry(0.55, 0.03, 0.2).translate(-0.28, 0, 0), wingMaterial, this.birds.length);
    this.rightWings = new InstancedMesh(new BoxGeometry(0.55, 0.03, 0.2).translate(0.28, 0, 0), wingMaterial, this.birds.length);
    this.droneBodies = new InstancedMesh(new BoxGeometry(0.9, 0.22, 0.9), dark, this.deliveries.length);
    this.rotors = new InstancedMesh(new CylinderGeometry(ROTOR_RADIUS_M, ROTOR_RADIUS_M, 0.03, 14), new MeshStandardMaterial({ color: 0x888d94, transparent: true, opacity: 0.55 }), this.deliveries.length * 4);
    this.packages = new InstancedMesh(new BoxGeometry(0.6, 0.5, 0.6), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), this.deliveries.length);
    this.walkers = new InstancedMesh(new CapsuleGeometry(0.22, 1.1, 2, 6).translate(0, 0.8, 0), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), this.pedestrians.length);
    const color = new Color();
    this.deliveries.forEach((d, i) => this.packages.setColorAt(i, color.setHex(d.color)));
    this.pedestrians.forEach((p, i) => this.walkers.setColorAt(i, color.setHex(p.color)));
    this.root.add(this.wing);
    for (const mesh of [this.leftWings, this.rightWings, this.droneBodies, this.rotors, this.packages, this.walkers]) {
      mesh.frustumCulled = false; // instances move far from the base geometry's bounds
      scene.add(mesh);
    }
  }

  /** Turns the small stuff off on the lowest graphics preset. */
  setDetail(isOn: boolean): void {
    this.walkers.visible = isOn;
    this.leftWings.visible = isOn;
    this.rightWings.visible = isOn;
  }

  update(timeS: number): void {
    this.updateBirds(timeS);
    this.updateDeliveries(timeS);
    this.updateWalkers(timeS);
  }

  private updateBirds(timeS: number): void {
    const { root, wing, place } = this;
    this.birds.forEach((bird, i) => {
      birdPlacement(bird, timeS, place);
      root.position.set(place.x, place.y, place.z);
      root.rotation.set(0, place.yawRad, 0);
      const flap = Math.sin(timeS * FLAP_HZ * Math.PI * 2 + bird.flapPhase) * FLAP_RAD;
      wing.rotation.set(0, 0, flap);
      root.updateMatrixWorld(true);
      this.leftWings.setMatrixAt(i, wing.matrixWorld);
      wing.rotation.set(0, 0, -flap);
      root.updateMatrixWorld(true);
      this.rightWings.setMatrixAt(i, wing.matrixWorld);
    });
    this.leftWings.instanceMatrix.needsUpdate = true;
    this.rightWings.instanceMatrix.needsUpdate = true;
  }

  private updateDeliveries(timeS: number): void {
    const { root, place } = this;
    this.wing.rotation.set(0, 0, 0);
    root.scale.setScalar(DRONE_SCALE);
    this.deliveries.forEach((d, i) => {
      deliveryPlacement(d, timeS, place);
      root.position.set(place.x, place.y, place.z);
      root.rotation.set(0, place.yawRad, 0);
      root.updateMatrixWorld(true);
      this.droneBodies.setMatrixAt(i, root.matrixWorld);
      this.wing.position.set(0, -0.4, 0);
      root.updateMatrixWorld(true);
      this.packages.setMatrixAt(i, this.wing.matrixWorld);
      let k = 0;
      for (const sx of [-0.5, 0.5]) {
        for (const sz of [-0.5, 0.5]) {
          this.wing.position.set(sx, 0.1, sz);
          this.wing.rotation.y = timeS * 40 * (k % 2 === 0 ? 1 : -1);
          root.updateMatrixWorld(true);
          this.rotors.setMatrixAt(i * 4 + k, this.wing.matrixWorld);
          k++;
        }
      }
      this.wing.position.set(0, 0, 0);
      this.wing.rotation.set(0, 0, 0);
    });
    root.scale.setScalar(1);
    for (const mesh of [this.droneBodies, this.rotors, this.packages]) mesh.instanceMatrix.needsUpdate = true;
    if (this.packages.instanceColor) this.packages.instanceColor.needsUpdate = true;
  }

  private updateWalkers(timeS: number): void {
    if (!this.walkers.visible) return;
    const { root, place } = this;
    root.scale.setScalar(1);
    this.wing.position.set(0, 0, 0);
    this.wing.rotation.set(0, 0, 0);
    this.pedestrians.forEach((p, i) => {
      pedestrianPlacement(p, timeS, place);
      root.position.set(place.x, place.y, place.z);
      root.rotation.set(0, place.yawRad, 0);
      root.updateMatrixWorld(true);
      this.walkers.setMatrixAt(i, root.matrixWorld);
    });
    this.walkers.instanceMatrix.needsUpdate = true;
    if (this.walkers.instanceColor) this.walkers.instanceColor.needsUpdate = true;
  }
}
