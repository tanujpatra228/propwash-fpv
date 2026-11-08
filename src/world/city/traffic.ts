import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Vector3, type Scene } from 'three';
import type { ColliderWorld, DynamicBox } from '../../physics/colliders';
import { buildTraffic, vehiclePose, type Vehicle, type VehiclePose, type VehicleType } from './traffic-plan';

const TYPES: readonly VehicleType[] = ['car', 'van', 'bus'];
const GLASS = 0x1b2630;

interface Group {
  vehicles: Vehicle[];
  boxes: DynamicBox[];
  body: InstancedMesh;
  cabin: InstancedMesh;
  /** Headlights and tail lights (two per vehicle), night only. */
  lights: InstancedMesh | null;
}

/** The moving cars, vans and buses: drawn as instances and solid (each has a collider that follows it). */
export class Traffic {
  private readonly groups: Group[] = [];
  private readonly pose: VehiclePose = { x: 0, z: 0, yawRad: 0, speedMps: 0 };
  private readonly dummy = new Object3D();

  constructor(scene: Scene, colliders: ColliderWorld, hasLights = false) {
    const all = buildTraffic();
    const unit = new BoxGeometry(1, 1, 1);
    const color = new Color();
    for (const type of TYPES) {
      const vehicles = all.filter((v) => v.type === type);
      const body = new InstancedMesh(unit, new MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.3 }), vehicles.length);
      const cabin = new InstancedMesh(unit, new MeshStandardMaterial({ color: GLASS, roughness: 0.15, metalness: 0.6 }), vehicles.length);
      vehicles.forEach((v, i) => body.setColorAt(i, color.setHex(v.color)));
      for (const mesh of [body, cabin]) {
        mesh.frustumCulled = false; // instances move far from the unit box's own bounds
        mesh.castShadow = true;
        scene.add(mesh);
      }
      const boxes = vehicles.map((v) => colliders.addDynamicBox(new Vector3(v.widthM / 2, v.heightM / 2, v.lengthM / 2), 'vehicle'));
      let lights: InstancedMesh | null = null;
      if (hasLights) {
        lights = new InstancedMesh(unit, new MeshBasicMaterial({ color: 0xffffff }), vehicles.length * 2);
        lights.frustumCulled = false;
        scene.add(lights);
        vehicles.forEach((_, i) => {
          lights?.setColorAt(i * 2, color.setHex(0xfff0c8));
          lights?.setColorAt(i * 2 + 1, color.setHex(0xff2a22));
        });
      }
      this.groups.push({ vehicles, boxes, body, cabin, lights });
    }
    this.update(0);
  }

  /** Two light bars: white at the front, red at the back. */
  private placeLights(lights: InstancedMesh, i: number, v: Vehicle, pose: VehiclePose): void {
    const { dummy } = this;
    const fx = -Math.sin(pose.yawRad);
    const fz = -Math.cos(pose.yawRad);
    for (const end of [1, -1]) {
      const reach = (v.lengthM / 2 + 0.03) * end;
      dummy.position.set(pose.x + fx * reach, v.heightM * 0.3 + 0.15, pose.z + fz * reach);
      dummy.rotation.set(0, pose.yawRad, 0);
      dummy.scale.set(v.widthM * 0.82, 0.2, 0.08);
      dummy.updateMatrix();
      lights.setMatrixAt(i * 2 + (end === 1 ? 0 : 1), dummy.matrix);
    }
  }

  update(timeS: number): void {
    const { dummy, pose } = this;
    for (const group of this.groups) {
      group.vehicles.forEach((v, i) => {
        vehiclePose(v, timeS, pose);
        // Body: the lower two thirds. Cabin: a narrower box on top, a bit toward the front for cars and vans.
        const bodyH = v.heightM * (v.type === 'bus' ? 0.9 : 0.62);
        dummy.position.set(pose.x, bodyH / 2 + 0.15, pose.z);
        dummy.rotation.set(0, pose.yawRad, 0);
        dummy.scale.set(v.widthM, bodyH, v.lengthM);
        dummy.updateMatrix();
        group.body.setMatrixAt(i, dummy.matrix);
        const cabinH = v.heightM - bodyH;
        const isBus = v.type === 'bus';
        const cabinLength = v.lengthM * (isBus ? 0.96 : 0.52);
        const forward = isBus ? 0 : v.lengthM * 0.04;
        dummy.position.set(pose.x - Math.sin(pose.yawRad) * forward, 0.15 + bodyH + cabinH / 2 - (isBus ? bodyH * 0.55 : 0), pose.z - Math.cos(pose.yawRad) * forward);
        dummy.scale.set(v.widthM * (isBus ? 1.01 : 0.9), isBus ? bodyH * 0.45 : cabinH, cabinLength);
        dummy.updateMatrix();
        group.cabin.setMatrixAt(i, dummy.matrix);
        group.boxes[i]?.place(pose.x, v.heightM / 2 + 0.1, pose.z, pose.yawRad);
        if (group.lights) this.placeLights(group.lights, i, v, pose);
      });
      group.body.instanceMatrix.needsUpdate = true;
      group.cabin.instanceMatrix.needsUpdate = true;
      if (group.body.instanceColor) group.body.instanceColor.needsUpdate = true;
      if (group.lights) {
        group.lights.instanceMatrix.needsUpdate = true;
        if (group.lights.instanceColor) group.lights.instanceColor.needsUpdate = true;
      }
    }
  }
}
