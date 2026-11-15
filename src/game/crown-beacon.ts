import { AdditiveBlending, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';
import { CROWN } from '../config';
import { createCrown } from '../drone/crown';

/** The drone crown is about 0.1 m wide: scaled up this far it is as wide as the pick-up zone, so it reads from afar. */
const CROWN_SCALE = (CROWN.claimRangeM * 2) / 0.1 * 0.8;
const BEAM_HEIGHT_M = 160;
const BOB_M = 0.6;

/** The crown waiting on the map: a big spinning gold crown with a light beam so every pilot can spot where to fly. */
export class CrownBeacon {
  readonly group = new Group();
  private readonly crown = createCrown();
  private timeS = 0;

  constructor(x: number, y: number, z: number) {
    this.crown.position.set(0, 0, 0);
    this.crown.scale.setScalar(CROWN_SCALE);
    this.crown.visible = true;
    const beam = new Mesh(
      new CylinderGeometry(CROWN.claimRangeM * 0.5, CROWN.claimRangeM * 0.5, BEAM_HEIGHT_M, 20, 1, true),
      new MeshBasicMaterial({ color: 0xffc83a, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    );
    beam.position.y = BEAM_HEIGHT_M / 2;
    this.group.add(this.crown, beam);
    this.group.position.set(x, y, z);
    this.group.visible = false;
  }

  /** Shown while the crown lies free and ready; hidden while someone wears it or it is still respawning. */
  setVisible(isVisible: boolean): void {
    this.group.visible = isVisible;
  }

  update(dtS: number): void {
    if (!this.group.visible) return;
    this.timeS += dtS;
    this.crown.rotation.y += dtS * 1.2;
    this.crown.position.y = Math.sin(this.timeS * 1.6) * BOB_M;
  }
}
