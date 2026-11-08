import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D, Vector3, type Scene } from 'three';
import type { ColliderWorld, DynamicBox } from '../../physics/colliders';
import { buildTraffic, vehiclePose, type Vehicle, type VehiclePose, type VehicleType } from './traffic-plan';

const TYPES: readonly VehicleType[] = ['car', 'van', 'bus'];
const GLASS = 0x1b2630;

interface Group {
  vehicles: Vehicle[];
  boxes: DynamicBox[];
  body: InstancedMesh;
  cabin: InstancedMesh;
}

/** The moving cars, vans and buses: drawn as instances and solid (each has a collider that follows it). */
export class Traffic {
  private readonly groups: Group[] = [];
  private readonly pose: VehiclePose = { x: 0, z: 0, yawRad: 0, speedMps: 0 };
  private readonly dummy = new Object3D();

  constructor(scene: Scene, colliders: ColliderWorld) {
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
      this.groups.push({ vehicles, boxes, body, cabin });
    }
    this.update(0);
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
      });
      group.body.instanceMatrix.needsUpdate = true;
      group.cabin.instanceMatrix.needsUpdate = true;
      if (group.body.instanceColor) group.body.instanceColor.needsUpdate = true;
    }
  }
}
