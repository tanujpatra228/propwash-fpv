import { Vector3 } from 'three';
import type { GameRenderer } from '../core/renderer';
import type { Battery } from '../drone/battery';
import { NO_INPUT, type FlightInput } from '../drone/flight-model';
import type { CrashReason } from '../physics/resolve';
import type { Gate } from '../world/gates';
import type { SkyRig } from '../world/sky';
import type { LapTracker } from './lap-tracker';
import type { GameMode, ModeId } from './modes/mode';
import type { Pose } from './respawn';

/** What the dev-only test helpers may touch. Keeps `Game` free of test-only methods. */
export interface DebugTarget {
  renderer: GameRenderer;
  sky: SkyRig;
  tracker: LapTracker;
  battery: Battery;
  gates: readonly Gate[];
  currentMode(): GameMode;
  phase(): 'menu' | 'playing';
  placeDrone(pose: Pose): void;
  startMode(id: ModeId): void;
  returnToMenu(): void;
  simulate(input: Readonly<FlightInput>, dtS: number): CrashReason | null;
  tickMode(dtS: number): void;
}

/** Helpers for browser tests. Exposed on `window.__game` in dev builds only (see main.ts). */
export function createDebugApi(t: DebugTarget) {
  return {
    debugPlace: (x: number, y: number, z: number, yawRad: number): void => t.placeDrone({ position: new Vector3(x, y, z), yawRad }),
    debugRenderInfo: (): { calls: number; triangles: number; geometries: number } => {
      const { render, memory } = t.renderer.webgl.info;
      return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries };
    },
    debugLook: (look: Parameters<GameRenderer['debugLook']>[0] & Parameters<SkyRig['debugLight']>[0]): void => {
      t.renderer.debugLook(look);
      t.sky.debugLight(look);
    },
    debugStartMode: (id: ModeId): void => t.startMode(id),
    debugReturnToMenu: (): void => t.returnToMenu(),
    /** Advances the simulation without rendering (headless browsers render too slowly to fly in real time). */
    debugSimulate: (seconds: number, input: Partial<FlightInput>): { crashed: CrashReason | null } => {
      const pilot: FlightInput = { ...NO_INPUT, ...input };
      let crashed: CrashReason | null = null;
      for (let i = 0; i < Math.round(seconds * 60) && crashed === null; i++) {
        crashed = t.simulate(t.currentMode().isInputLocked ? NO_INPUT : pilot, 1 / 60);
        t.tickMode(1 / 60);
      }
      return { crashed };
    },
    debugState: () => ({
      phase: t.phase(),
      mode: t.currentMode().id,
      countdown: t.currentMode().hud.countdown,
      nextGate: t.tracker.nextGate,
      lastPassedGate: t.tracker.lastPassedGate,
      laps: t.tracker.completedLaps,
      battery: t.battery.charge01,
      best: t.tracker.best?.lapTimeS ?? null,
    }),
    debugGate: (index: number): { position: number[]; yawRad: number } | null => {
      const gate = t.gates[index];
      return gate ? { position: gate.position.toArray(), yawRad: Math.atan2(-gate.forward.x, -gate.forward.z) } : null;
    },
  };
}

export type DebugApi = ReturnType<typeof createDebugApi>;
