import { Scene, Vector3 } from 'three';
import { LOOP } from '../config';
import { mustGet } from '../core/dom';
import { clamp } from '../core/math';
import { GameRenderer } from '../core/renderer';
import { Battery } from '../drone/battery';
import { createDroneModel } from '../drone/drone-model';
import { STOCK_STATS } from '../drone/drone-stats';
import { FlightModel, NO_INPUT, type FlightInput } from '../drone/flight-model';
import { Input } from '../input/input';
import {
  loadBindings,
  loadMouseSensitivity,
  primaryKeyLabel,
  saveBindings,
  saveMouseSensitivity,
  type Bindings,
} from '../input/key-bindings';
import { ControlsPanel } from '../ui/controls-panel';
import { buildSky } from '../world/sky';
import { ColliderWorld } from '../physics/colliders';
import { PIT_PAD } from '../world/pit-area';
import { buildScenery, type Scenery } from '../world/scenery';
import { buildTerrain, buildWater, groundY } from '../world/terrain';
import { createWorldTextures } from '../world/textures';
import { CameraRig } from './camera-rig';

const REST_OFFSET_M = 0.1;

const spawn = new Vector3();

/** Owns the scene and the main loop. M2 sandbox: one drone, free flight, chase camera. */
export class Game {
  private readonly renderer: GameRenderer;
  private readonly scene = new Scene();
  private readonly rig = new CameraRig();
  private readonly sky;
  private readonly colliders = new ColliderWorld();
  private readonly scenery: Scenery;
  private readonly flight = new FlightModel();
  private readonly battery = new Battery(STOCK_STATS);
  private readonly drone = createDroneModel({ color: 0xff7a1a });
  private readonly input: Input;
  private readonly controls: ControlsPanel;
  private readonly hint = mustGet('hint');
  private readonly flightInput: FlightInput = { ...NO_INPUT };
  private bindings: Bindings;
  private lastTimeMs = 0;
  private clockS = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new GameRenderer(canvas);
    this.sky = buildSky(this.scene, this.renderer.webgl);
    const textures = createWorldTextures(this.renderer.webgl.capabilities.getMaxAnisotropy());
    buildTerrain(this.scene, textures.detail);
    buildWater(this.scene);
    this.scenery = buildScenery(this.scene, this.colliders, textures);
    this.scene.add(this.drone.group);

    this.bindings = loadBindings();
    const sensitivity = loadMouseSensitivity();
    this.input = new Input(canvas, this.bindings);
    this.input.setSensitivity(sensitivity);
    this.controls = new ControlsPanel(this.bindings, sensitivity, {
      onBindingsChange: (next) => {
        this.bindings = next;
        saveBindings(next);
        this.input.setBindings(next);
        this.updateHint();
      },
      onSensitivityChange: (value) => {
        saveMouseSensitivity(value);
        this.input.setSensitivity(value);
      },
      onClose: () => {
        this.input.enabled = true;
      },
    });
    mustGet('open-controls').addEventListener('click', () => {
      this.input.enabled = false;
      this.controls.open();
    });
    this.input.onPress((action) => {
      if (action === 'reset') this.resetToSpawn();
    });

    this.resetToSpawn();
    this.updateHint();
    this.input.enabled = true;
  }

  /** Dev-only helper used by browser tests to put the drone somewhere specific. */
  debugPlace(x: number, y: number, z: number, yawRad: number): void {
    spawn.set(x, y, z);
    this.flight.reset(spawn, yawRad);
    this.rig.snap();
  }

  /** Dev-only: draw calls and triangles of the last frame. */
  debugRenderInfo(): { calls: number; triangles: number; geometries: number } {
    const { render, memory } = this.renderer.webgl.info;
    return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries };
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  private resetToSpawn(): void {
    spawn.copy(PIT_PAD.position);
    spawn.y = groundY(spawn.x, spawn.z) + REST_OFFSET_M;
    this.flight.reset(spawn, PIT_PAD.yawRad);
    this.rig.snap();
  }

  private updateHint(): void {
    const key = (id: Parameters<typeof primaryKeyLabel>[1]): string => primaryKeyLabel(this.bindings, id);
    this.hint.textContent =
      `${key('up')} up · ${key('down')} down · ${key('forward')}/${key('back')} fly · ` +
      `${key('left')}/${key('right')} slide · mouse or ${key('turnLeft')}/${key('turnRight')} turn · ` +
      `${key('reset')} reset · click the view to steer with the mouse`;
  }

  private readonly frame = (nowMs: number): void => {
    const dtS = clamp((nowMs - this.lastTimeMs) / 1000, LOOP.minDtS, LOOP.maxDtS);
    this.lastTimeMs = nowMs;
    this.clockS += dtS;
    this.update(dtS);
    this.renderer.render(this.scene, this.rig.camera);
    requestAnimationFrame(this.frame);
  };

  private update(dtS: number): void {
    const input = this.input.readFlightInput(this.flightInput);
    const effort = this.flight.step(input, STOCK_STATS, this.battery.powerFactor, dtS);
    this.battery.step(effort, dtS);

    // Temporary ground response; real collisions and crash rules arrive with physics/ in M4.
    const floorY = groundY(this.flight.position.x, this.flight.position.z) + REST_OFFSET_M;
    if (this.flight.position.y < floorY) {
      this.flight.position.y = floorY;
      if (this.flight.velocity.y < 0) this.flight.velocity.y = 0;
      if (this.battery.isEmpty) {
        this.battery.refill();
        this.resetToSpawn();
      }
    }

    this.drone.group.position.copy(this.flight.position);
    this.drone.group.quaternion.copy(this.flight.quaternion);
    this.drone.spinProps(this.flight.throttle01, dtS);
    this.scenery.update(this.clockS);
    this.sky.followFocus(this.flight.position);
    this.rig.setAspect(this.renderer.aspect);
    this.rig.update(dtS, { position: this.flight.position, yawRad: this.flight.yawRad });
  }
}
