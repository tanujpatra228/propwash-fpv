import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { STOCK_STATS } from './drone-stats';
import { FlightModel, NO_INPUT, type FlightInput } from './flight-model';

const DT = 1 / 30;

function press(partial: Partial<FlightInput>): FlightInput {
  return { ...NO_INPUT, ...partial };
}

function makeModel(): FlightModel {
  const model = new FlightModel();
  model.reset(new Vector3(0, 0, 0), 0);
  return model;
}

function run(model: FlightModel, input: FlightInput, frames: number, dt = DT): void {
  for (let i = 0; i < frames; i++) model.step(input, STOCK_STATS, 1, dt);
}

function isFinite3(v: Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

describe('FlightModel', () => {
  it('holding up for 2 s reaches about 10 m, then holds height', () => {
    const m = makeModel();
    run(m, press({ up: 1 }), 60);
    expect(m.position.y).toBeGreaterThan(9);
    expect(m.position.y).toBeLessThan(11);
    run(m, NO_INPUT, 30); // let the climb settle
    const settled = m.position.y;
    run(m, NO_INPUT, 150);
    expect(Math.abs(m.position.y - settled)).toBeLessThan(0.5);
  });

  it('holding forward for 3 s from a hover reaches 15 to 19.5 m/s', () => {
    const m = makeModel();
    run(m, press({ forward: 1 }), 90);
    const speed = Math.hypot(m.velocity.x, m.velocity.z);
    expect(speed).toBeGreaterThan(15);
    expect(speed).toBeLessThan(19.5);
    expect(m.velocity.z).toBeLessThan(0); // forward is -Z
  });

  it('top speed is about 100 km/h (26.4 to 30.5 m/s)', () => {
    const m = makeModel();
    run(m, press({ forward: 1 }), 600);
    const speed = Math.hypot(m.velocity.x, m.velocity.z);
    expect(speed).toBeGreaterThan(26.4);
    expect(speed).toBeLessThan(30.5);
  });

  it('coasts down smoothly without bouncing back', () => {
    const m = makeModel();
    run(m, press({ forward: 1 }), 90);
    let previous = Math.hypot(m.velocity.x, m.velocity.z);
    for (let i = 0; i < 600; i++) {
      m.step(NO_INPUT, STOCK_STATS, 1, DT);
      const speed = Math.hypot(m.velocity.x, m.velocity.z);
      expect(speed).toBeLessThanOrEqual(previous + 0.5);
      previous = speed;
    }
    expect(previous).toBeLessThan(3);
  });

  it('opposite inputs cancel', () => {
    const m = makeModel();
    run(m, press({ forward: 1, back: 1, up: 1, down: 1 }), 90);
    expect(Math.hypot(m.velocity.x, m.velocity.z)).toBeLessThan(0.1);
    expect(Math.abs(m.position.y)).toBeLessThan(0.1);
  });

  it('banks into a turn while moving', () => {
    const m = makeModel();
    run(m, press({ forward: 1 }), 90);
    run(m, press({ forward: 1, turnLeft: 1 }), 20);
    expect(m.rollRad).toBeGreaterThan(0.05); // left bank is positive roll
  });

  it('stays finite for zero, negative, NaN and huge dt', () => {
    for (const dt of [0, -1, Number.NaN, 5, Number.POSITIVE_INFINITY]) {
      const m = makeModel();
      m.step(press({ forward: 1, up: 1, mouseYawRad: 0.1 }), STOCK_STATS, 1, dt);
      expect(isFinite3(m.position)).toBe(true);
      expect(isFinite3(m.velocity)).toBe(true);
    }
  });

  it('low power weakens climb', () => {
    const full = makeModel();
    const weak = makeModel();
    for (let i = 0; i < 60; i++) {
      full.step(press({ up: 1 }), STOCK_STATS, 1, DT);
      weak.step(press({ up: 1 }), STOCK_STATS, 0.7, DT);
    }
    expect(weak.position.y).toBeLessThan(full.position.y * 0.85);
  });

  it('motors cut: ignores input and falls', () => {
    const m = makeModel();
    m.position.set(0, 50, 0);
    const effort = m.step(press({ up: 1, forward: 1 }), STOCK_STATS, 0, DT);
    for (let i = 0; i < 30; i++) m.step(press({ up: 1, forward: 1 }), STOCK_STATS, 0, DT);
    expect(effort).toBe(0);
    expect(m.velocity.y).toBeLessThan(-5);
    expect(m.position.y).toBeLessThan(50);
  });

  it('effort rises with hard flying', () => {
    const m = makeModel();
    const calm = m.step(NO_INPUT, STOCK_STATS, 1, DT);
    run(m, press({ forward: 1, up: 1 }), 60);
    const hard = m.step(press({ forward: 1, up: 1 }), STOCK_STATS, 1, DT);
    expect(calm).toBeLessThan(0.05);
    expect(hard).toBeGreaterThan(0.6);
    expect(hard).toBeLessThanOrEqual(1);
  });

  it('heavier drones accelerate slower', () => {
    const stock = makeModel();
    const heavy = makeModel();
    const heavyStats = { ...STOCK_STATS, massKg: 0.9 };
    for (let i = 0; i < 60; i++) {
      stock.step(press({ forward: 1 }), STOCK_STATS, 1, DT);
      heavy.step(press({ forward: 1 }), heavyStats, 1, DT);
    }
    expect(heavy.velocity.length()).toBeLessThan(stock.velocity.length());
  });
});
