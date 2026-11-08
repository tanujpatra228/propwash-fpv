import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type BufferGeometry,
  DoubleSide,
  type Material,
} from 'three';
import { DRONE, PARTS } from '../config';
import type { BatteryId } from './parts';
import { lerp } from '../core/math';

export interface DroneModelOptions {
  color: number;
  /** Translucent white-blue copy for best-lap ghosts: no shadows, no depth writes. */
  ghost?: boolean;
  propBlades?: 2 | 3 | 4 | 5;
  /** Which battery is strapped on top; sets its size and label colour. Defaults to the stock pack. */
  battery?: BatteryId;
}

/** The parts that change how the drone looks. */
export interface DroneLook {
  propBlades: 2 | 3 | 4 | 5;
  battery: BatteryId;
}

export interface DroneModel {
  group: Group;
  setColor(color: number): void;
  /** Swaps the propellers and the battery that are drawn. */
  setLook(look: DroneLook): void;
  /** Spins the props; faster at higher throttle. Alternating directions per motor. */
  spinProps(throttle01: number, dtS: number): void;
  dispose(): void;
}

/** Geometries are created once and shared by every drone. */
interface SharedGeometry {
  body: BufferGeometry;
  arm: BufferGeometry;
  canopy: BufferGeometry;
  stack: BufferGeometry;
  strap: BufferGeometry;
  camera: BufferGeometry;
  lens: BufferGeometry;
  led: BufferGeometry;
  antenna: BufferGeometry;
  motor: BufferGeometry;
  blade: BufferGeometry;
  disc: BufferGeometry;
}

const shared = (() => {
  let cache: SharedGeometry | null = null;
  return (): SharedGeometry => {
    cache ??= {
      body: new BoxGeometry(0.075, 0.012, 0.15),
      arm: new BoxGeometry(0.3, 0.008, 0.032),
      canopy: new BoxGeometry(0.058, 0.034, 0.095),
      stack: new BoxGeometry(0.036, 0.03, 0.078),
      strap: new BoxGeometry(0.037, 0.006, 0.079),
      camera: new BoxGeometry(0.026, 0.024, 0.024),
      lens: new CylinderGeometry(0.008, 0.008, 0.006, 12),
      led: new BoxGeometry(0.06, 0.006, 0.12),
      antenna: new CylinderGeometry(0.002, 0.002, 0.07, 4),
      motor: new CylinderGeometry(0.014, 0.015, 0.022, 12),
      blade: new BoxGeometry(0.125, 0.002, 0.016),
      disc: new CircleGeometry(0.064, 24),
    };
    return cache;
  };
})();

const MOTORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.106, 0.106, 1],
  [-0.106, 0.106, -1],
  [0.106, -0.106, -1],
  [-0.106, -0.106, 1],
];

export function createDroneModel(options: DroneModelOptions): DroneModel {
  const geo = shared();
  const isGhost = options.ghost === true;
  const blades = options.propBlades ?? 3;
  const ghostExtras = isGhost
    ? { transparent: true, opacity: 0.38, depthWrite: false, emissive: new Color(0xbfe6ff), emissiveIntensity: 0.8 }
    : {};
  const carbon = new MeshStandardMaterial({ color: isGhost ? 0xffffff : 0x1b1e22, roughness: 0.45, metalness: 0.3, ...ghostExtras });
  const accent = new MeshStandardMaterial({ color: isGhost ? 0xffffff : options.color, roughness: 0.35, metalness: 0.1, ...ghostExtras });
  const metal = new MeshStandardMaterial({ color: 0xa7afb8, roughness: 0.3, metalness: 0.9, ...ghostExtras });
  const led = new MeshStandardMaterial({ color: options.color, emissive: options.color, emissiveIntensity: 3.5, ...ghostExtras });
  const disc = new MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: isGhost ? 0.08 : 0.16, depthWrite: false, side: DoubleSide });
  const materials: Material[] = [carbon, accent, metal, led, disc];

  const group = new Group();
  const add = (geometry: BufferGeometry, material: Material, x: number, y: number, z: number, ry = 0): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = !isGhost;
    group.add(mesh);
    return mesh;
  };
  add(geo.body, carbon, 0, 0, 0);
  add(geo.arm, carbon, 0, -0.002, 0, Math.PI / 4);
  add(geo.arm, carbon, 0, -0.002, 0, -Math.PI / 4);
  add(geo.canopy, accent, 0, 0.024, 0.005);
  add(geo.stack, carbon, 0, 0.056, 0.012);
  add(geo.camera, carbon, 0, 0.022, -0.06).rotation.x = 0.4;
  add(geo.lens, metal, 0, 0.026, -0.074).rotation.x = Math.PI / 2 + 0.4;
  add(geo.led, led, 0, -0.01, 0);
  add(geo.antenna, carbon, 0, 0.05, 0.07).rotation.x = -0.7;

  const props: Array<{ group: Group; direction: number }> = [];
  const batteryBody = new MeshStandardMaterial({ color: 0x15181c, roughness: 0.6, metalness: 0.1, ...ghostExtras });
  const batteryLabel = new MeshStandardMaterial({ color: 0xffc94a, roughness: 0.5, emissive: 0xffc94a, emissiveIntensity: 0.25, ...ghostExtras });
  materials.push(batteryBody, batteryLabel);
  const batteryGroup = new Group();
  group.add(batteryGroup);
  const batteryGeometries: BufferGeometry[] = [];

  const buildBattery = (id: BatteryId): void => {
    batteryGroup.clear();
    for (const g of batteryGeometries) g.dispose();
    batteryGeometries.length = 0;
    const part = PARTS.batteries[id];
    const [w, h, l] = part.sizeM;
    const body = new BoxGeometry(w, h, l);
    const label = new BoxGeometry(w + 0.002, h * 0.5, l * 0.4);
    batteryGeometries.push(body, label);
    batteryLabel.color.setHex(isGhost ? 0xffffff : part.labelColor);
    batteryLabel.emissive.setHex(isGhost ? 0xffffff : part.labelColor);
    // Sits on the stack, under the strap, centred a little back so the camera still sees forward.
    const y = 0.071 + h / 2 - 0.003;
    const strap = new BoxGeometry(w + 0.004, h + 0.004, 0.007);
    batteryGeometries.push(strap);
    const parts: ReadonlyArray<readonly [BufferGeometry, Material, number, number]> = [
      [body, batteryBody, y, 0.012],
      [label, batteryLabel, y, 0.012],
      [strap, accent, y, 0.012 - l * 0.32],
      [strap, accent, y, 0.012 + l * 0.32],
    ];
    for (const [geometry, material, yy, zz] of parts) {
      const mesh = new Mesh(geometry, material);
      mesh.position.set(0, yy, zz);
      mesh.castShadow = !isGhost;
      batteryGroup.add(mesh);
    }
  };

  const buildProps = (count: number): void => {
    for (const prop of props) group.remove(prop.group);
    props.length = 0;
    // More blades are narrower, so the difference reads at a glance.
    const widthScale = Math.min(1.5, Math.max(0.7, 3 / count));
    for (const [x, z, direction] of MOTORS) {
      const propGroup = new Group();
      propGroup.position.set(x, 0.028, z);
      for (let i = 0; i < count; i++) {
        const blade = new Mesh(geo.blade, accent);
        blade.rotation.y = (i * Math.PI * 2) / count;
        blade.scale.z = widthScale;
        propGroup.add(blade);
      }
      const blur = new Mesh(geo.disc, disc);
      blur.rotation.x = -Math.PI / 2;
      propGroup.add(blur);
      group.add(propGroup);
      props.push({ group: propGroup, direction });
    }
  };

  for (const [x, z] of MOTORS) add(geo.motor, metal, x, 0.014, z);
  buildProps(blades);
  buildBattery(options.battery ?? PARTS.stockBattery);
  group.scale.setScalar(DRONE.scale);

  return {
    group,
    setColor(color: number): void {
      if (isGhost) return;
      accent.color.setHex(color);
      led.color.setHex(color);
      led.emissive.setHex(color);
    },
    setLook(look: DroneLook): void {
      buildProps(look.propBlades);
      buildBattery(look.battery);
    },
    spinProps(throttle01: number, dtS: number): void {
      const speed = lerp(DRONE.propSpinRadps.idle, DRONE.propSpinRadps.full, throttle01);
      for (const prop of props) prop.group.rotation.y += prop.direction * speed * dtS;
    },
    dispose(): void {
      // Geometries are shared and stay alive; only per-drone materials are released.
      for (const material of materials) material.dispose();
      for (const g of batteryGeometries) g.dispose();
    },
  };
}
