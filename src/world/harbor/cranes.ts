import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3, type Scene } from 'three';
import { HARBOR } from '../../config';
import type { ColliderWorld, DynamicBox } from '../../physics/colliders';
import { craneState, type CraneState } from './plan';

const CABLE_WIDTH_M = 0.5;

interface MovingCrane {
  phaseS: number;
  x: number;
  trolley: Mesh;
  cable: Mesh;
  container: Mesh;
  boxes: { trolley: DynamicBox; cable: DynamicBox; container: DynamicBox };
}

/** The moving parts of the gantry cranes: a trolley on the boom, a cable and a hanging container. Each is solid. */
export class MovingCranes {
  private readonly cranes: MovingCrane[] = [];
  private readonly state: CraneState = { trolleyZ: 0, containerZ: 0 };

  constructor(scene: Scene, colliders: ColliderWorld) {
    const { crane } = HARBOR;
    const steel = new MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.5 });
    const cargo = new MeshStandardMaterial({ color: 0xc4382c, roughness: 0.7, metalness: 0.2 });
    const c = crane.container;
    const trolleyH = 2.5;
    const containerY = crane.container.bottomM + c.heightM / 2;
    const cableTop = crane.trolleyY - trolleyH / 2;
    const cableBottom = containerY + c.heightM / 2;
    const cableLength = cableTop - cableBottom;
    for (const spec of HARBOR.cranes) {
      const trolley = new Mesh(new BoxGeometry(4, trolleyH, 5), steel);
      const cable = new Mesh(new BoxGeometry(CABLE_WIDTH_M, cableLength, CABLE_WIDTH_M), steel);
      const container = new Mesh(new BoxGeometry(c.widthM, c.heightM, c.lengthM), cargo);
      for (const mesh of [trolley, cable, container]) {
        mesh.castShadow = true;
        scene.add(mesh);
      }
      const boxes = {
        trolley: colliders.addDynamicBox(new Vector3(2, trolleyH / 2, 2.5), 'crane'),
        cable: colliders.addDynamicBox(new Vector3(CABLE_WIDTH_M / 2, cableLength / 2, CABLE_WIDTH_M / 2), 'crane'),
        container: colliders.addDynamicBox(new Vector3(c.widthM / 2, c.heightM / 2, c.lengthM / 2), 'container'),
      };
      this.cranes.push({ phaseS: spec.phaseS, x: spec.x, trolley, cable, container, boxes });
    }
    this.update(0);
  }

  update(timeS: number): void {
    const { crane } = HARBOR;
    const c = crane.container;
    const trolleyH = 2.5;
    const containerY = c.bottomM + c.heightM / 2;
    const cableTop = crane.trolleyY - trolleyH / 2;
    const cableBottom = containerY + c.heightM / 2;
    const cableY = (cableTop + cableBottom) / 2;
    for (const k of this.cranes) {
      craneState(k.phaseS, timeS, this.state);
      const z = this.state.trolleyZ;
      k.trolley.position.set(k.x, crane.trolleyY, z);
      k.cable.position.set(k.x, cableY, z);
      k.container.position.set(k.x, containerY, this.state.containerZ);
      k.boxes.trolley.place(k.x, crane.trolleyY, z, 0);
      k.boxes.cable.place(k.x, cableY, z, 0);
      k.boxes.container.place(k.x, containerY, this.state.containerZ, 0);
    }
  }
}
