import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from 'three';
import { FLIGHT, TRACK, VALLEY } from '../config';
import { BANDO_FLOOR_Y, LAKE_SURFACE_Y, heightAt } from './terrain';

const UP = new Vector3(0, 1, 0);
const COUNT = TRACK.samples;

function controlPointY(x: number, z: number, clearance: number | 'bando' | 'lake'): number {
  if (clearance === 'bando') return BANDO_FLOOR_Y + TRACK.bandoClearanceM;
  if (clearance === 'lake') return LAKE_SURFACE_Y + TRACK.lakeClearanceM;
  let highest = heightAt(x, z);
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    highest = Math.max(
      highest,
      heightAt(x + Math.cos(angle) * TRACK.groundScanRadiusM, z + Math.sin(angle) * TRACK.groundScanRadiusM),
    );
  }
  return highest + clearance;
}

function isInFactoryZone(p: Vector3): boolean {
  return Math.hypot(p.x - VALLEY.bando.x, p.z - VALLEY.bando.z) < TRACK.bandoZoneRadiusM;
}

/** Evenly spaced samples along the closed spline, kept clear of the ground and smoothed. */
function buildPositions(): Vector3[] {
  const controlPoints = TRACK.points.map(([x, z, clearance]) => new Vector3(x, controlPointY(x, z, clearance), z));
  const curve = new CatmullRomCurve3(controlPoints, true, 'centripetal');
  curve.arcLengthDivisions = 3000;
  const points = curve.getSpacedPoints(COUNT);
  points.pop();
  for (const p of points) if (!isInFactoryZone(p)) p.y = Math.max(p.y, heightAt(p.x, p.z) + 2.2);
  const half = TRACK.smoothingHalfWindow;
  for (let pass = 0; pass < TRACK.smoothingPasses; pass++) {
    const ys = points.map((p) => p.y);
    for (let i = 0; i < COUNT; i++) {
      let sum = 0;
      for (let k = -half; k <= half; k++) sum += ys[(i + k + COUNT) % COUNT] ?? 0;
      const p = points[i];
      if (!p) continue;
      const average = sum / (2 * half + 1);
      p.y = isInFactoryZone(p) ? average : Math.max(average, heightAt(p.x, p.z) + TRACK.minGroundClearanceM);
    }
  }
  return points;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[((index % COUNT) + COUNT) % COUNT];
  if (item === undefined) throw new Error('Track sample out of range');
  return item;
}

const positions = buildPositions();
let lengthM = 0;
for (let i = 0; i < COUNT; i++) lengthM += at(positions, i).distanceTo(at(positions, i + 1));
const spacingM = lengthM / COUNT;

const tangents = positions.map((_, i) => at(positions, i + 1).clone().sub(at(positions, i - 1)).normalize());

/** Curvature vectors (change of direction per metre), smoothed so banking is calm. */
const curvatures = (() => {
  const half = TRACK.curvatureHalfWindow;
  let current = tangents.map((_, i) =>
    at(tangents, i + half).clone().sub(at(tangents, i - half)).divideScalar(2 * half * spacingM),
  );
  const smoothHalf = TRACK.curvatureSmoothHalfWindow;
  for (let pass = 0; pass < TRACK.curvatureSmoothPasses; pass++) {
    const source = current;
    current = source.map((_, i) => {
      const sum = new Vector3();
      for (let k = -smoothHalf; k <= smoothHalf; k++) sum.add(at(source, i + k));
      return sum.divideScalar(2 * smoothHalf + 1);
    });
  }
  return current;
})();

const trackXZ = positions.filter((_, i) => i % 10 === 0);

const tmpTangent = new Vector3();
const tmpCurvature = new Vector3();
const tmpSide = new Vector3();
const tmpThrust = new Vector3();
const tmpForward = new Vector3();
const tmpRight = new Vector3();
const tmpBack = new Vector3();
const tmpMatrix = new Matrix4();

/** Linear blend between neighbouring samples; `u` wraps around 0..1. */
function blend(u: number, out: Vector3, source: readonly Vector3[]): Vector3 {
  const wrapped = ((u % 1) + 1) % 1;
  const f = wrapped * COUNT;
  const i = Math.floor(f);
  return out.copy(at(source, i)).lerp(at(source, i + 1), f - i);
}

export interface Track {
  readonly lengthM: number;
  readonly sampleCount: number;
  readonly spacingM: number;
  /** Read-only racing line samples. */
  readonly positions: readonly Vector3[];
  readonly tangents: readonly Vector3[];
  sampleAt(u: number, out: Vector3): Vector3;
  tangentAt(u: number, out: Vector3): Vector3;
  curvatureAt(u: number, out: Vector3): Vector3;
  /** Curvature magnitude (1/m) at a distance along the track. */
  curvatureMagnitudeAtDistance(distM: number): number;
  /** Pose of a drone flying the line at `speedMps`, tilted the way real thrust would be. Returns the thrust-up vector. */
  poseAt(distM: number, lateralOffsetM: number, speedMps: number, outPos: Vector3, outQuat: Quaternion): Vector3;
  nearestSampleIndex(position: Vector3): number;
  /** Horizontal distance from a point to the racing line (sampled every 10th point). */
  distanceToLineXZ(x: number, z: number): number;
  /** Unit tangent flattened onto the ground plane at a sample index. */
  horizontalTangent(index: number, out: Vector3): Vector3;
}

export const track: Track = {
  lengthM,
  sampleCount: COUNT,
  spacingM,
  positions,
  tangents,
  sampleAt: (u, out) => blend(u, out, positions),
  tangentAt: (u, out) => blend(u, out, tangents).normalize(),
  curvatureAt: (u, out) => blend(u, out, curvatures),
  curvatureMagnitudeAtDistance: (distM) => blend(distM / lengthM, tmpCurvature, curvatures).length(),

  poseAt(distM, lateralOffsetM, speedMps, outPos, outQuat) {
    const u = distM / lengthM;
    blend(u, outPos, positions);
    blend(u, tmpTangent, tangents).normalize();
    blend(u, tmpCurvature, curvatures);
    tmpSide.crossVectors(tmpTangent, UP).normalize();
    outPos.addScaledVector(tmpSide, lateralOffsetM);
    const lateralAccel = tmpCurvature.length() * speedMps * speedMps;
    if (lateralAccel > TRACK.maxLateralAccelMps2) tmpCurvature.multiplyScalar(TRACK.maxLateralAccelMps2 / lateralAccel);
    tmpThrust
      .copy(tmpCurvature)
      .multiplyScalar(speedMps * speedMps)
      .addScaledVector(tmpTangent, FLIGHT.dragQuadratic * speedMps * speedMps);
    tmpThrust.y += FLIGHT.gravityMps2;
    const up = tmpThrust.normalize();
    tmpForward.copy(tmpTangent).addScaledVector(up, -tmpTangent.dot(up)).normalize();
    tmpRight.crossVectors(tmpForward, up).normalize();
    tmpBack.copy(tmpForward).negate();
    tmpMatrix.makeBasis(tmpRight, up, tmpBack);
    outQuat.setFromRotationMatrix(tmpMatrix);
    return up;
  },

  nearestSampleIndex(position) {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < COUNT; i++) {
      const d = at(positions, i).distanceToSquared(position);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    return best;
  },

  distanceToLineXZ(x, z) {
    let best = Infinity;
    for (const p of trackXZ) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
    return Math.sqrt(best);
  },

  horizontalTangent(index, out) {
    const t = at(tangents, index);
    return out.set(t.x, 0, t.z).normalize();
  },
};

/** For hand-placed gates: the sample nearest to each anchor, searched forward from the previous gate so order is kept. */
const anchoredSamples: number[] | null = TRACK.gateAnchors
  ? (() => {
      const result: number[] = [];
      let from = 0;
      for (const [ax, az] of TRACK.gateAnchors) {
        let best = from;
        let bestDistance = Infinity;
        for (let k = 0; k < COUNT; k++) {
          const i = (from + k) % COUNT;
          const p = at(positions, i);
          const d = (p.x - ax) ** 2 + (p.z - az) ** 2;
          if (d < bestDistance) {
            bestDistance = d;
            best = i;
          }
        }
        result.push(best);
        from = best;
      }
      return result;
    })()
  : null;

/** Index of the gate along the line (gate 0 is the start/finish). */
export function gateSampleIndex(gateIndex: number): number {
  return anchoredSamples?.[gateIndex] ?? Math.round((gateIndex / TRACK.gateCount) * COUNT) % COUNT;
}

