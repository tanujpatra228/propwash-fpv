import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type Scene,
  type Vector3,
} from 'three';
import { HUD } from '../config';
import { heightState } from '../ui/height-gauge';

const OPACITY_LINE = 0.85;
const OPACITY_RING = 0.9;
const LINE_START_BELOW_DRONE_M = 0.05;

/** Chase-camera helper: a dashed line from the drone down to the ground, with a ring where it would land. */
export class GroundMarker {
  private readonly group = new Group();
  private readonly positions = new Float32Array(6);
  private readonly geometry = new BufferGeometry();
  private readonly lineMaterial = new LineDashedMaterial({
    color: HUD.markerColors.ok,
    dashSize: HUD.markerDash.dashM,
    gapSize: HUD.markerDash.gapM,
    transparent: true,
    opacity: OPACITY_LINE,
  });
  private readonly ringMaterial = new MeshBasicMaterial({
    color: HUD.markerColors.ok,
    transparent: true,
    opacity: OPACITY_RING,
    side: DoubleSide,
    depthWrite: false,
  });
  private readonly line: Line;
  private readonly ring: Mesh;

  constructor(scene: Scene) {
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.line = new Line(this.geometry, this.lineMaterial);
    this.line.frustumCulled = false;
    this.ring = new Mesh(new RingGeometry(HUD.markerDash.ringInnerM, HUD.markerDash.ringOuterM, 40), this.ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.group.add(this.line, this.ring);
    this.group.visible = false;
    scene.add(this.group);
  }

  hide(): void {
    this.group.visible = false;
  }

  /** Updates in place (no allocation). `heightM` is height above the surface below the drone. */
  update(dronePosition: Vector3, groundYM: number, heightM: number, isVisible: boolean): void {
    this.group.visible = isVisible;
    if (!isVisible) return;
    const lift = HUD.markerDash.ringLiftM;
    this.positions.set([dronePosition.x, dronePosition.y - LINE_START_BELOW_DRONE_M, dronePosition.z, dronePosition.x, groundYM + lift, dronePosition.z]);
    const attribute = this.geometry.getAttribute('position');
    attribute.needsUpdate = true;
    this.line.computeLineDistances();
    this.ring.position.set(dronePosition.x, groundYM + lift, dronePosition.z);
    const state = heightState(heightM);
    const color = state === 'danger' ? HUD.markerColors.danger : state === 'low' ? HUD.markerColors.low : HUD.markerColors.ok;
    this.lineMaterial.color.setHex(color);
    this.ringMaterial.color.setHex(color);
  }
}
