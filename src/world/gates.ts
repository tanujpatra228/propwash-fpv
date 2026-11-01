import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GATE, TRACK } from '../config';
import type { ColliderWorld } from '../physics/colliders';
import { createGatePlane, type GatePlane } from './gate-crossing';
import { heightAt } from './terrain';
import type { WorldTextures } from './textures';
import { gateSampleIndex, track } from './track';

export interface Gate extends GatePlane {
  index: number;
}

const UP = new Vector3(0, 1, 0);
const BANNER_ASPECT = 160 / 1024;

/**
 * Builds the 12 race gates: orange padded frames with LED strips, legs down to the ground where they float,
 * and the START/FINISH banner on gate 0. Frames, LEDs and legs are merged into one mesh each.
 */
export function buildGates(scene: Scene, colliders: ColliderWorld, textures: WorldTextures): Gate[] {
  const { widthM: w, heightM: h, frameThicknessM: t, ledThicknessM: li } = GATE;
  const frameParts: BufferGeometry[] = [];
  const ledParts: BufferGeometry[] = [];
  const legParts: BufferGeometry[] = [];
  const gates: Gate[] = [];

  for (let i = 0; i < TRACK.gateCount; i++) {
    const sampleIndex = gateSampleIndex(i);
    const position = (track.positions[sampleIndex] ?? new Vector3()).clone();
    const forward = track.horizontalTangent(sampleIndex, new Vector3());
    const gate: Gate = { index: i, ...createGatePlane(position, forward) };
    gates.push(gate);

    const placement = new Matrix4().compose(
      position,
      new Quaternion().setFromAxisAngle(UP, Math.atan2(gate.forward.x, gate.forward.z)),
      new Vector3(1, 1, 1),
    );
    const bar = (parts: BufferGeometry[], sx: number, sy: number, sz: number, x: number, y: number, solid: boolean): void => {
      const local = new Matrix4().makeTranslation(x, y, 0);
      parts.push(new BoxGeometry(sx, sy, sz).applyMatrix4(local).applyMatrix4(placement));
      if (solid) colliders.addBox(placement.clone().multiply(local), new Vector3(sx / 2, sy / 2, sz / 2), 'gate');
    };

    bar(frameParts, t, h + t, t, -w / 2, 0, true);
    bar(frameParts, t, h + t, t, w / 2, 0, true);
    bar(frameParts, w + t, t, t, 0, h / 2, true);
    bar(frameParts, w + t, t, t, 0, -h / 2, true);
    bar(ledParts, w - t, li, li, 0, h / 2 - t / 2 - li, false);
    bar(ledParts, w - t, li, li, 0, -h / 2 + t / 2 + li, false);
    bar(ledParts, li, h - t, li, -w / 2 + t / 2 + li, 0, false);
    bar(ledParts, li, h - t, li, w / 2 - t / 2 - li, 0, false);

    const left = position.clone().addScaledVector(gate.right, -w / 2);
    const right = position.clone().addScaledVector(gate.right, w / 2);
    const groundM = Math.min(heightAt(left.x, left.z), heightAt(right.x, right.z));
    const legLengthM = position.y - h / 2 - groundM + GATE.legExtraM;
    if (legLengthM > GATE.minLegLengthM) {
      for (const [side, base] of [[-1, left], [1, right]] as const) {
        const local = new Matrix4().makeTranslation(side * (w / 2), -h / 2 - legLengthM / 2, 0);
        legParts.push(new CylinderGeometry(GATE.legRadiusM, GATE.legRadiusM, legLengthM, 6).applyMatrix4(local).applyMatrix4(placement));
        colliders.addCylinder(base.x, base.z, base.y - (position.y - h / 2 - legLengthM), legLengthM, GATE.legRadiusM, 'gate');
      }
    }

    if (i === 0) addBanner(scene, textures, placement);
  }

  const addMerged = (parts: BufferGeometry[], material: MeshStandardMaterial, castShadow: boolean): void => {
    if (parts.length === 0) return;
    const mesh = new Mesh(mergeGeometries(parts), material);
    mesh.castShadow = castShadow;
    scene.add(mesh);
    for (const part of parts) part.dispose();
  };
  addMerged(frameParts, new MeshStandardMaterial({ color: 0xff6a10, emissive: 0xff5a00, emissiveIntensity: 0.55, roughness: 0.5 }), true);
  addMerged(ledParts, new MeshStandardMaterial({ color: 0xffd0a0, emissive: 0xffa040, emissiveIntensity: 3.2 }), false);
  addMerged(legParts, new MeshStandardMaterial({ color: 0x8b9096, roughness: 0.4, metalness: 0.8 }), true);
  return gates;
}

function addBanner(scene: Scene, textures: WorldTextures, placement: Matrix4): void {
  const width = GATE.widthM + GATE.bannerExtraWidthM;
  const banner = new Mesh(
    new PlaneGeometry(width, width * BANNER_ASPECT * 1.6),
    new MeshStandardMaterial({ map: textures.checker, side: DoubleSide, roughness: 0.8 }),
  );
  banner.applyMatrix4(placement);
  banner.translateY(GATE.heightM / 2 + GATE.bannerAboveM);
  banner.rotateY(Math.PI); // face the drones arriving along the track
  scene.add(banner);
}
