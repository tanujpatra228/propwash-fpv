/** The part catalog and the one function that turns a setup into flight and battery numbers. */
import { PARTS } from '../config';
import { STOCK_STATS, type DroneStats } from './drone-stats';

export type PropId = keyof typeof PARTS.propellers;
export type BatteryId = keyof typeof PARTS.batteries;
export type PartId = PropId | BatteryId;
export type PartKind = 'prop' | 'battery';
export type Level = 1 | 2 | 3;

export interface DroneSetup {
  prop: PropId;
  propLevel: Level;
  battery: BatteryId;
  batteryLevel: Level;
}

export const STOCK_SETUP: Readonly<DroneSetup> = { prop: PARTS.stockProp, propLevel: 1, battery: PARTS.stockBattery, batteryLevel: 1 };

export const PROP_IDS = Object.keys(PARTS.propellers) as PropId[];
export const BATTERY_IDS = Object.keys(PARTS.batteries) as BatteryId[];

export function isPropId(value: unknown): value is PropId {
  return typeof value === 'string' && Object.hasOwn(PARTS.propellers, value);
}

export function isBatteryId(value: unknown): value is BatteryId {
  return typeof value === 'string' && Object.hasOwn(PARTS.batteries, value);
}

export function isLevel(value: unknown): value is Level {
  return value === 1 || value === 2 || value === 3;
}

export function kindOf(id: PartId): PartKind {
  return isPropId(id) ? 'prop' : 'battery';
}

export function partLabel(id: PartId): string {
  return isPropId(id) ? PARTS.propellers[id].label : PARTS.batteries[id as BatteryId].label;
}

export function partPrice(id: PartId): number {
  return isPropId(id) ? PARTS.propellers[id].price : PARTS.batteries[id as BatteryId].price;
}

/** Credits to go from `level` to the next, or null at the top level. */
export function upgradePrice(level: Level): number | null {
  return level === 1 ? PARTS.upgradePrice[2] : level === 2 ? PARTS.upgradePrice[3] : null;
}

/** Combines the parts. Flight model, battery and Hangar all read this; nothing else recombines part effects. */
export function buildStats(setup: Readonly<DroneSetup>): DroneStats {
  const prop = PARTS.propellers[setup.prop];
  const battery = PARTS.batteries[setup.battery];
  const up = PARTS.upgrade;
  const propSteps = setup.propLevel - 1;
  const massKg = (PARTS.dryWeightG + battery.weightG) / 1000;
  return {
    topSpeedFactor: prop.topSpeed * battery.topSpeed,
    gripFactor: prop.grip,
    // Lift and acceleration are scaled by weight inside the flight model (stats.massKg), so only the part bonus goes here.
    liftFactor: prop.lift * battery.lift,
    drainFactor: prop.drain * battery.drain * (1 - up.propDrainCutPerLevel * propSteps),
    wobble: prop.wobble * (1 - up.propWobbleCutPerLevel * propSteps),
    massKg,
    cells: battery.cells,
    capacityMah: Math.round(battery.capacityMah * (1 + up.batteryCapacityGainPerLevel * (setup.batteryLevel - 1))),
  };
}

/** What the drone model should draw for a setup. */
export function droneLook(setup: Readonly<DroneSetup>): { propBlades: 2 | 3 | 4 | 5; battery: BatteryId } {
  return { propBlades: PARTS.propellers[setup.prop].blades, battery: setup.battery };
}

/** Short name for menus and the race panel: "Allround 3-blade · Standard 1500". */
export function setupName(setup: Readonly<DroneSetup>): string {
  const prop = PARTS.propellers[setup.prop];
  return `${prop.label} ${prop.blades}-blade · ${PARTS.batteries[setup.battery].label}`;
}

export function isStockSetup(setup: Readonly<DroneSetup>): boolean {
  return setup.prop === STOCK_SETUP.prop && setup.battery === STOCK_SETUP.battery && setup.propLevel === 1 && setup.batteryLevel === 1;
}
